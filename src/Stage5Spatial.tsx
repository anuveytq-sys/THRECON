import {useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,Download,GitBranch,Layers3,RotateCcw,Send,Target} from 'lucide-react';

type DepthMap={width:number;height:number;data:Uint8Array};
type Segment={label:string;score:number;width:number;height:number;data:Uint8Array};
type Props={photoName:string;depth:DepthMap|null;segments:Segment[];onBack:()=>void};
type Box={x:number;y:number;w:number;h:number};
type Node={id:string;label:string;score:number;box:Box;depth:number;depthSpread:number;area:number;position:[number,number,number];visible:boolean;selected:boolean};
type Edge={from:string;to:string;relation:string;strength:number};
type Snapshot={nodes:Node[];selectedId:string|null};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const uid=(i:number)=>'region-'+String(i+1).padStart(2,'0');
function buildNodes(segments:Segment[],depth:DepthMap|null):Node[]{
 return segments.map((s,i)=>{
  const w=Math.min(s.width,depth?.width??s.width),h=Math.min(s.height,depth?.height??s.height);
  let x0=w,y0=h,x1=-1,y1=-1,n=0,ds=0,dmin=1,dmax=0;
  const step=Math.max(1,Math.floor(Math.sqrt(w*h/24000)));
  for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
   if((s.data[y*s.width+x]??0)<96)continue;
   x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);n++;
   if(depth){const d=(depth.data[Math.min(depth.height-1,y)*depth.width+Math.min(depth.width-1,x)]??0)/255;ds+=d;dmin=Math.min(dmin,d);dmax=Math.max(dmax,d);}
  }
  const bw=Math.max(1,x1-x0+1),bh=Math.max(1,y1-y0+1),box={x:x0/Math.max(1,s.width),y:y0/Math.max(1,s.height),w:bw/Math.max(1,s.width),h:bh/Math.max(1,s.height)};
  const cx=box.x+box.w/2,cy=box.y+box.h/2,mean=n&&depth?ds/n:0.5;
  return {id:uid(i),label:s.label,score:s.score,box,depth:mean,depthSpread:n&&depth?dmax-dmin:0,area:box.w*box.h,position:[(cx-.5)*4,(.5-cy)*3,(.5-mean)*2] as [number,number,number],visible:true,selected:false};
 }).filter(n=>n.box.w>.012&&n.box.h>.012).slice(0,24);
}
function graph(nodes:Node[]):Edge[]{
 const edges:Edge[]=[];
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],acx=a.box.x+a.box.w/2,acy=a.box.y+a.box.h/2,bcx=b.box.x+b.box.w/2,bcy=b.box.y+b.box.h/2;
  const dx=bcx-acx,dy=bcy-acy,overlapX=Math.max(0,Math.min(a.box.x+a.box.w,b.box.x+b.box.w)-Math.max(a.box.x,b.box.x)),overlapY=Math.max(0,Math.min(a.box.y+a.box.h,b.box.y+b.box.h)-Math.max(a.box.y,b.box.y));
  const overlap=overlapX*overlapY/Math.max(.0001,Math.min(a.area,b.area));
  if(overlap>.18){edges.push({from:a.id,to:b.id,relation:'overlaps',strength:overlap});continue;}
  if(Math.abs(dx)>.07)edges.push({from:a.id,to:b.id,relation:dx<0?'right_of':'left_of',strength:clamp(Math.abs(dx),0,1)});
  if(Math.abs(dy)>.07)edges.push({from:a.id,to:b.id,relation:dy<0?'below':'above',strength:clamp(Math.abs(dy),0,1)});
  if(Math.abs(a.depth-b.depth)>.08)edges.push({from:a.id,to:b.id,relation:a.depth>b.depth?'higher_depth_response':'lower_depth_response',strength:Math.abs(a.depth-b.depth)});
 }
 return edges;
}
function downloadJson(value:unknown,name:string){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
export default function Stage5Spatial({photoName,depth,segments,onBack}:Props){
 const [nodes,setNodes]=useState<Node[]>(()=>buildNodes(segments,depth));
 const [selectedId,setSelectedId]=useState<string|null>(null),[command,setCommand]=useState(''),[status,setStatus]=useState('SCENE GRAPH READY · LOCAL INTENT ENGINE'),[history,setHistory]=useState<Snapshot[]>([]);
 const edges=useMemo(()=>graph(nodes),[nodes]),selected=nodes.find(n=>n.id===selectedId)??null;
 const commit=(next:Node[],message:string)=>{setHistory(h=>[...h.slice(-19),{nodes,selectedId}]);setNodes(next);setStatus(message)};
 const execute=()=>{
  const raw=command.trim(),q=raw.toLowerCase();if(!q)return;
  let target=selected;
  if(!target){const matches=nodes.filter(n=>q.includes(n.label.toLowerCase()));if(matches.length===1)target=matches[0];}
  if(/show graph|rebuild graph|refresh graph/.test(q)){setStatus('RELATIONSHIP GRAPH REBUILT');setCommand('');return;}
  if(/undo|revert last/.test(q)){const last=history.at(-1);if(last){setNodes(last.nodes);setSelectedId(last.selectedId);setHistory(h=>h.slice(0,-1));setStatus('LAST SCENE EDIT UNDONE')}else setStatus('NOTHING TO UNDO');setCommand('');return;}
  if(!target){setStatus('SELECT AN OBJECT OR NAME ONE IN YOUR COMMAND');return;}
  const index=nodes.findIndex(n=>n.id===target!.id);if(index<0)return;
  const next=nodes.map(n=>({...n,position:[...n.position] as [number,number,number]}));
  const n=next[index],rename=raw.match(/\b(?:rename|call|name)\s+(?:the\s+)?(.+?)\s+(?:to|as)\s+["']?([^"']+)["']?$/i);
  if(rename){n.label=rename[2].trim().slice(0,48);commit(next,'RENAMED '+target.label+' → '+n.label);}
  else if(/\b(hide|make invisible)\b/.test(q)){n.visible=false;commit(next,'HID '+n.label);}
  else if(/\b(show|make visible)\b/.test(q)){n.visible=true;commit(next,'SHOWING '+n.label);}
  else if(/\b(left|right|up|above|down|below|forward|back|backward)\b/.test(q)){
   const amount=/\bslightly\b/.test(q)?0.12:/\bfar\b|\ba lot\b/.test(q)?0.65:0.3;
   if(/left/.test(q))n.position[0]-=amount;if(/right/.test(q))n.position[0]+=amount;
   if(/up|above/.test(q))n.position[1]+=amount;if(/down|below/.test(q))n.position[1]-=amount;
   if(/forward/.test(q))n.position[2]+=(amount);if(/back|backward/.test(q))n.position[2]-=amount;
   commit(next,'MOVED '+n.label+' · '+n.position.map(v=>v.toFixed(2)).join(', '));
  }else if(/\b(bigger|larger|increase size|scale up)\b/.test(q)){n.box.w=clamp(n.box.w*1.15,.01,1);n.box.h=clamp(n.box.h*1.15,.01,1);commit(next,'SCALED UP '+n.label);}
  else if(/\b(smaller|reduce size|scale down)\b/.test(q)){n.box.w=clamp(n.box.w*.85,.01,1);n.box.h=clamp(n.box.h*.85,.01,1);commit(next,'SCALED DOWN '+n.label);}
  else if(/\b(reset|restore position)\b/.test(q)){const original=buildNodes(segments,depth).find(x=>x.id===n.id);if(original){n.position=original.position;n.box=original.box;n.visible=true;commit(next,'RESTORED '+n.label)}}
  else {setStatus('COMMAND NOT RECOGNIZED · TRY RENAME, MOVE, HIDE, SHOW, SCALE OR UNDO');}
  setCommand('');
 };
 const exportScene=()=>downloadJson({schema:'virtual-itg-sceneir/1.1',stage:5,source:photoName,coordinateSystem:'image-relative right-handed proxy coordinates',units:'normalized scene units; not metric',evidence:{labels:'observed semantic labels from Stage 2 segmentation',bounds:'estimated from pixel masks',depth:'relative monocular depth; ordering only',relationships:'computed from 2D bounds and relative depth',editedTransforms:'user-authored'},objects:nodes.map(({selected,...n})=>n),relationships:edges,warnings:['Object dimensions are normalized image-relative estimates, not real-world measurements.','Depth ordering is relative and model-dependent.','Scene relationships are inferred from visible 2D masks; occluded relationships may be missing.']},'virtual-itg-stage5-sceneir.json');
 return <section className="stage5-workspace">
  <header className="stage5-header"><div><span>VIRTUAL ITG · STAGE 05</span><strong>SPATIAL INTELLIGENCE & SCENE GRAPH</strong><small>{photoName||'NO SOURCE'} · {nodes.length} OBJECT NODES · {edges.length} RELATIONSHIPS</small></div><button onClick={onBack}><ArrowLeft size={14}/> BACK TO WORLD COMPLETION</button></header>
  <div className="stage5-toolbar"><span><GitBranch size={15}/> SEMANTIC SCENE GRAPH · OBJECT RELATIONSHIPS · LOCAL COMMAND ENGINE</span><span><Target size={14}/> {depth?'DEPTH-AWARE':'MASK-ONLY'} ANALYSIS</span></div>
  <div className="stage5-layout">
   <section className="stage5-graph-panel"><div className="stage5-panel-title">SPATIAL RELATIONSHIP MAP <small>SELECT A NODE TO INSPECT</small></div>
    <div className="stage5-graph">
     <svg viewBox="0 0 1000 620" role="img" aria-label="Spatial relationship graph">
      {edges.filter(e=>e.relation==='overlaps'||e.relation==='relative_depth_nearer').map(e=>{const a=nodes.find(n=>n.id===e.from),b=nodes.find(n=>n.id===e.to);if(!a||!b)return null;return <line key={e.from+e.to+e.relation} x1={(a.box.x+a.box.w/2)*1000} y1={(a.box.y+a.box.h/2)*620} x2={(b.box.x+b.box.w/2)*1000} y2={(b.box.y+b.box.h/2)*620} className="stage5-edge"/>})}
      {nodes.map(n=>{const x=(n.box.x+n.box.w/2)*1000,y=(n.box.y+n.box.h/2)*620;return <g key={n.id} className={'stage5-node '+(selectedId===n.id?'selected':'')+(n.visible?'':' hidden')} onClick={()=>setSelectedId(n.id)} role="button" tabIndex={0} aria-label={'Select '+n.label} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedId(n.id)}}}><circle cx={x} cy={y} r={Math.max(18,Math.min(44,18+n.box.w*35))}/><text x={x} y={y+58} textAnchor="middle">{n.label.slice(0,18)}</text><text x={x} y={y+4} textAnchor="middle" className="stage5-node-score">{Math.round(n.score*100)}%</text></g>})}
     </svg>
     {!nodes.length&&<div className="stage5-empty">RUN STAGE 02 VISUAL ANALYSIS TO BUILD SEMANTIC OBJECT NODES</div>}
    </div>
    <div className="stage5-legend"><span><i/> SELECTED OBJECT</span><span><i/> SEGMENTATION EVIDENCE</span><span><i/> INFERRED RELATIONSHIP</span></div>
   </section>
   <aside className="stage5-inspector">
    <div className="stage5-panel-title"><Layers3 size={14}/> OBJECT INSPECTOR</div>
    {selected?<><div className="stage5-object-name">{selected.label}<small>{selected.id} · {Math.round(selected.score*100)}% DETECTOR SCORE</small></div><div className="stage5-metrics"><div><small>IMAGE WIDTH</small><b>{(selected.box.w*100).toFixed(1)}%</b></div><div><small>IMAGE HEIGHT</small><b>{(selected.box.h*100).toFixed(1)}%</b></div><div><small>RELATIVE DEPTH</small><b>{Math.round(selected.depth*100)}/100</b></div><div><small>MASK AREA</small><b>{(selected.area*100).toFixed(1)}%</b></div></div><p className="stage5-note">Pixel bounds and relative depth only. Real-world dimensions require camera calibration or a known reference measurement.</p><div className="stage5-object-actions"><button onClick={()=>setSelectedId(null)}>DESELECT</button><button onClick={()=>commit(nodes.map(n=>n.id===selected.id?{...n,visible:!n.visible}:n),'VISIBILITY UPDATED')}>{selected.visible?'HIDE':'SHOW'} OBJECT</button></div><div className="stage5-panel-title">RELATIONSHIPS</div><div className="stage5-relations">{edges.filter(e=>e.from===selected.id||e.to===selected.id).slice(0,18).map((e,i)=>{const other=nodes.find(n=>n.id===(e.from===selected.id?e.to:e.from));return <div key={i}><b>{e.from===selected.id?'→':'←'} {e.relation.replaceAll('_',' ').toUpperCase()}</b><span>{other?.label??'UNKNOWN'} · {Math.round(e.strength*100)}%</span></div>})}{!edges.some(e=>e.from===selected.id||e.to===selected.id)&&<p>No geometric relationships inferred for this object.</p>}</div></>:<p className="stage5-note">Choose a detected object in the graph or list to inspect its estimated dimensions, relative depth and spatial relationships.</p>}
    <div className="stage5-panel-title">SEMANTIC OBJECTS <small>{nodes.length}</small></div><div className="stage5-object-list">{nodes.map(n=><button key={n.id} className={selectedId===n.id?'active':''} onClick={()=>setSelectedId(n.id)}><span>{n.label}</span><small>{Math.round(n.score*100)}%</small></button>)}</div>
    <div className="stage5-panel-title">NATURAL-LANGUAGE SCENE COMMANDS</div><p className="stage5-note">Runs locally without an API key. Select an object first, or include its detected label in the command.</p><div className="stage5-command"><input value={command} onChange={e=>setCommand(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')execute()}} placeholder='e.g. "move chair left"'/><button disabled={!nodes.length||!command.trim()} onClick={execute}><Send size={13}/></button></div><div className="stage5-shortcuts"><button onClick={()=>{setCommand('move left');}}>MOVE LEFT</button><button onClick={()=>{setCommand('make bigger');}}>SCALE UP</button><button onClick={()=>{setCommand('hide');}}>HIDE</button><button onClick={()=>{setCommand('undo');}}>UNDO</button></div>
    <button className="stage5-export" onClick={exportScene}><Download size={14}/> EXPORT SCENEIR + RELATIONSHIPS</button><button className="stage5-export" onClick={()=>{const last=history.at(-1);if(last){setNodes(last.nodes);setSelectedId(last.selectedId);setHistory(h=>h.slice(0,-1));setStatus('LAST SCENE EDIT UNDONE')}else setStatus('NOTHING TO UNDO')}}><RotateCcw size={13}/> UNDO LAST COMMAND</button>
   </aside>
  </div>
  <footer className="stage5-footer"><span>{status}</span><span>STAGE 05 · ESTIMATED SPATIAL GRAPH · NORMALIZED UNITS · NO METRIC CLAIMS</span></footer>
 </section>;
}
