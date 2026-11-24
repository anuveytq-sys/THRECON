import {useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {ArrowLeft,Boxes,Download,Layers3,LoaderCircle,RefreshCw,Sparkles,ShieldCheck} from 'lucide-react';

type DepthMap={width:number;height:number;data:Uint8Array};
type Segment={label:string;score:number;width:number;height:number;data:Uint8Array};
type Props={photoUrl:string;photoName:string;depth:DepthMap|null;segments:Segment[];onBack:()=>void};
type Candidate={id:number;label:string;score:number;confidence:number;box:{x:number;y:number;w:number;h:number};depth:number;kind:'box'|'round'|'cylinder'};
type Variant='balanced'|'conservative'|'expanded';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1200);}
function candidatesFromMasks(segments:Segment[],depth:DepthMap):Candidate[]{
 return segments.map((s,id)=>{
  const w=Math.min(s.width,depth.width),h=Math.min(s.height,depth.height);
  let x0=w,y0=h,x1=0,y1=0,count=0,sum=0,sum2=0;
  const step=Math.max(1,Math.floor(Math.sqrt((w*h)/18000)));
  for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){if((s.data[y*s.width+x]??0)<96)continue;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);const d=depth.data[Math.min(depth.height-1,y)*depth.width+Math.min(depth.width-1,x)]/255;sum+=d;sum2+=d*d;count++;}
  const bw=Math.max(1,x1-x0+1),bh=Math.max(1,y1-y0+1),fill=count/Math.max(1,bw*bh/(step*step)),mean=count?sum/count:.5,variance=count?Math.max(0,sum2/count-mean*mean):.25;
  const confidence=clamp(s.score*(.72+.28*clamp(fill,0,1))*(1-clamp(Math.sqrt(variance)*.35,0,.25)),.05,.99);
  const label=s.label.toLowerCase();
  const kind=/bottle|cup|vase|person|plant|tree/.test(label)?'round':/chair|table|door|book|tv|laptop|cabinet|bed|sofa/.test(label)?'box':'cylinder';
  return {id,label:s.label,score:s.score,confidence,box:{x:x0/Math.max(1,s.width),y:y0/Math.max(1,s.height),w:bw/Math.max(1,s.width),h:bh/Math.max(1,s.height)},depth:mean,kind};
 }).filter(c=>c.box.w>.018&&c.box.h>.018).sort((a,b)=>b.confidence-a.confidence).slice(0,8);
}
export default function Stage4Completion({photoUrl,photoName,depth,segments,onBack}:Props){
 const host=useRef<HTMLDivElement>(null),sceneRef=useRef<THREE.Scene|null>(null),rendererRef=useRef<THREE.WebGLRenderer|null>(null),exportRef=useRef<THREE.Group|null>(null);
 const [variant,setVariant]=useState<Variant>('balanced'),[showObserved,setShowObserved]=useState(true),[showInferred,setShowInferred]=useState(true),[busy,setBusy]=useState(false),[status,setStatus]=useState('READY · WAITING FOR DEPTH + OBJECT MASKS');
 const candidates=useMemo(()=>depth?candidatesFromMasks(segments,depth):[],[segments,depth]);
 const meanConfidence=candidates.length?Math.round(candidates.reduce((a,c)=>a+c.confidence,0)/candidates.length*100):0;
 useEffect(()=>{
  const node=host.current;if(!node||!depth)return;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});}catch{node.dataset.error='webgl';setStatus('WEBGL UNAVAILABLE');return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));renderer.setSize(node.clientWidth,node.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#050b16',1);node.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#050b16');const camera=new THREE.PerspectiveCamera(48,node.clientWidth/Math.max(1,node.clientHeight),.05,100);camera.position.set(0,1.2,8);
  scene.add(new THREE.HemisphereLight('#d4f4ff','#10182c',1.7));const key=new THREE.DirectionalLight('#b5eaff',2.3);key.position.set(4,7,6);scene.add(key);const rim=new THREE.PointLight('#815dff',18,24);rim.position.set(-4,2,-4);scene.add(rim);
  const orbitTarget=new THREE.Vector3(0,0,0);let dragging=false,px=0,py=0,theta=0,phi=1.22,radius=8;
  const updateCamera=()=>{camera.position.set(radius*Math.sin(phi)*Math.sin(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(orbitTarget);};updateCamera();
  const onDown=(e:PointerEvent)=>{dragging=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)};
  const onMove=(e:PointerEvent)=>{if(!dragging)return;theta-=(e.clientX-px)*.008;phi=clamp(phi+(e.clientY-py)*.008,.25,Math.PI-.25);px=e.clientX;py=e.clientY;updateCamera()};
  const onUp=()=>{dragging=false};const onWheel=(e:WheelEvent)=>{radius=clamp(radius+e.deltaY*.008,3,18);updateCamera()};
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointermove',onMove);renderer.domElement.addEventListener('pointerup',onUp);renderer.domElement.addEventListener('pointercancel',onUp);renderer.domElement.addEventListener('wheel',onWheel,{passive:true});
  const group=new THREE.Group();scene.add(group);exportRef.current=group;sceneRef.current=scene;rendererRef.current=renderer;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,7),new THREE.MeshStandardMaterial({color:'#102337',roughness:.9,metalness:.1,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-2.15,-.6);group.add(floor);
  const grid=new THREE.GridHelper(8,32,'#28627b','#173149');grid.position.y=-2.13;group.add(grid);
  const roomMat=new THREE.MeshBasicMaterial({color:'#35c9ef',wireframe:true,transparent:true,opacity:.15});
  const room=new THREE.Mesh(new THREE.BoxGeometry(6,4.2,5),roomMat);room.position.set(0,-.05,-1.25);group.add(room);
  const makeObjects=async()=>{
   const image=new Image();image.crossOrigin='anonymous';image.onload=()=>{
    if(!host.current)return;
    const textureCanvas=document.createElement('canvas');textureCanvas.width=image.naturalWidth;textureCanvas.height=image.naturalHeight;const tc=textureCanvas.getContext('2d');if(!tc)return;tc.drawImage(image,0,0);
    const photoTexture=new THREE.CanvasTexture(textureCanvas);photoTexture.colorSpace=THREE.SRGBColorSpace;
    const imagePlane=new THREE.Mesh(new THREE.PlaneGeometry(4.6,4.6*depth.height/depth.width),new THREE.MeshBasicMaterial({map:photoTexture,transparent:true,opacity:showObserved?1:0,side:THREE.DoubleSide,depthWrite:false}));imagePlane.position.set(0,0,.45);group.add(imagePlane);
    const thickness=variant==='conservative'?.16:variant==='expanded'?.62:.34;
    candidates.forEach((c)=>{
     const x=(c.box.x+c.box.w/2-.5)*4.6,y=(.5-c.box.y-c.box.h/2)*4.6*depth.height/depth.width;
     const w=Math.max(.12,c.box.w*4.6),h=Math.max(.12,c.box.h*4.6*depth.height/depth.width),z=(.5-c.depth)*1.6;
     const front=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:'#65dfff',transparent:true,opacity:showObserved?.14:0,side:THREE.DoubleSide,depthWrite:false}));front.position.set(x,y,z+.48);group.add(front);
     let geometry:THREE.BufferGeometry;
     if(c.kind==='round')geometry=new THREE.SphereGeometry(1,24,16);
     else if(c.kind==='cylinder')geometry=new THREE.CylinderGeometry(.5,.5,1,20);
     else geometry=new THREE.BoxGeometry(1,1,1);
     const back=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#6b8cff',emissive:'#162f75',emissiveIntensity:.5,transparent:true,opacity:showInferred?.24:0,roughness:.62,metalness:.12,wireframe:variant==='conservative'}));
     back.scale.set(w,h,thickness*(variant==='expanded'?1.65:1));back.position.set(x,y,z-thickness*.5);group.add(back);
     const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#64eaff',transparent:true,opacity:showInferred?.85:0}));edges.scale.copy(back.scale);edges.position.copy(back.position);group.add(edges);
     const pin=new THREE.Mesh(new THREE.SphereGeometry(.035,8,8),new THREE.MeshBasicMaterial({color:c.confidence>.7?'#48efc0':'#ffc46b'}));pin.position.set(x-w/2,y+h/2,z+.55);group.add(pin);
    });
    setStatus('WORLD COMPLETION BASELINE BUILT · '+candidates.length+' MASKED OBJECT REGIONS · INFERRED VOLUMES LABELLED');
   };image.onerror=()=>setStatus('SOURCE PHOTO COULD NOT BE TEXTURED');image.src=photoUrl;
  };void makeObjects();
  let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);renderer.render(scene,camera)};animate();
  const resize=()=>{if(!node.clientWidth||!node.clientHeight)return;camera.aspect=node.clientWidth/node.clientHeight;camera.updateProjectionMatrix();renderer.setSize(node.clientWidth,node.clientHeight)};const observer=new ResizeObserver(resize);observer.observe(node);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointermove',onMove);renderer.domElement.removeEventListener('pointerup',onUp);renderer.domElement.removeEventListener('pointercancel',onUp);renderer.domElement.removeEventListener('wheel',onWheel);scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();const m=o.material;(Array.isArray(m)?m:[m]).forEach(x=>x.dispose())}});renderer.dispose();renderer.domElement.remove();exportRef.current=null;sceneRef.current=null;rendererRef.current=null;};
 },[photoUrl,depth,candidates,variant,showObserved,showInferred]);
 const exportWorld=async()=>{if(!sceneRef.current||!exportRef.current)return;setBusy(true);setStatus('PACKING OBSERVED + INFERRED GEOMETRY…');try{const result=await new GLTFExporter().parseAsync(sceneRef.current,{binary:true});download(new Blob([result as ArrayBuffer],{type:'model/gltf-binary'}),'virtual-itg-stage4-world-completion.glb');setStatus('STAGE 04 WORLD COMPLETION EXPORTED · GLB');}catch(e){setStatus(e instanceof Error?e.message:'GLB EXPORT FAILED');}finally{setBusy(false)}};
 const downloadManifest=()=>{const manifest={schema:'virtual-itg-world-completion/1',source:photoName,method:'single-view depth + semantic masks + procedural object-shape priors',evidence:{observed:'source photograph and segmentation masks',estimated:'relative depth and object bounds',inferred:'candidate backside volumes and room envelope'},variant,objects:candidates.map(c=>({...c,confidence:Number(c.confidence.toFixed(3)),geometry:'procedural-prior-not-ground-truth'})),warning:'Hidden geometry is ambiguous from one image. These are alternatives, not verified hidden surfaces.'};download(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}),'virtual-itg-stage4-scene-ir.json');};
 return <section className="stage4-workspace"><header className="stage4-header"><div><span>VIRTUAL ITG · STAGE 04</span><strong>GENERATIVE WORLD COMPLETION</strong><small>{photoName} · {candidates.length} SEMANTIC REGIONS</small></div><button onClick={onBack}><ArrowLeft size={14}/> BACK TO RECONSTRUCTION</button></header>
  <div className="stage4-toolbar"><span><Sparkles size={15}/> OCCLUSION INTELLIGENCE · GEOMETRY HYPOTHESES</span><span><ShieldCheck size={14}/> {meanConfidence}% MEAN MASK CONFIDENCE</span></div>
  <div className="stage4-layout"><div className="stage4-viewport" ref={host}><div className="stage4-hud">ORBIT · PINCH / SCROLL TO ZOOM · DRAG TO ROTATE</div><div className="stage4-legend"><i className="observed"/> OBSERVED PHOTO <i className="estimated"/> DEPTH ESTIMATE <i className="inferred"/> INFERRED VOLUME</div></div>
   <aside className="stage4-inspector"><h3><Boxes size={15}/> COMPLETION CONTROLS</h3><p>Builds object-level proxy volumes from segmentation masks and relative depth. The unseen backs are generated hypotheses, not measured geometry.</p>
    <label>GEOMETRY HYPOTHESIS</label><div className="stage4-variants">{(['conservative','balanced','expanded'] as Variant[]).map(v=><button className={variant===v?'active':''} key={v} onClick={()=>setVariant(v)}>{v.toUpperCase()}</button>)}</div>
    <label className="stage4-toggle"><input type="checkbox" checked={showObserved} onChange={e=>setShowObserved(e.target.checked)}/> SHOW OBSERVED SURFACES</label><label className="stage4-toggle"><input type="checkbox" checked={showInferred} onChange={e=>setShowInferred(e.target.checked)}/> SHOW INFERRED GEOMETRY</label>
    <div className="stage4-divider"/><h3><Layers3 size={14}/> OBJECT HYPOTHESES</h3>{candidates.length?candidates.map(c=><div className="stage4-object" key={c.id}><span>{c.label}</span><b>{Math.round(c.confidence*100)}% mask confidence</b><small>{c.kind.toUpperCase()} PRIOR · DEPTH {Math.round(c.depth*100)}/100</small></div>):<p>No usable segmentation masks. Run Stage 2 object analysis first.</p>}
    <div className="stage4-divider"/><h3><ShieldCheck size={14}/> EVIDENCE CONFIDENCE</h3><div className="stage4-confidence-grid">{Array.from({length:9},(_,i)=>{const c=candidates[Math.min(candidates.length-1,Math.floor(i*candidates.length/9))];const value=c?c.confidence:0;return <div key={i} title={c?c.label+' '+Math.round(value*100)+'%':'No object evidence'}><i style={{opacity:.25+value*.75}}/><span>{Math.round(value*100)}</span></div>})}</div>
    <div className="stage4-divider"/><button className="stage4-primary" disabled={!depth||busy} onClick={()=>void exportWorld()}>{busy?<LoaderCircle size={14}/>:<Download size={14}/>} EXPORT COMPLETED WORLD · GLB</button><button className="stage4-secondary" onClick={downloadManifest}><Download size={14}/> EXPORT SCENEIR + CONFIDENCE JSON</button><button className="stage4-secondary" onClick={()=>{setVariant('balanced');setShowObserved(true);setShowInferred(true);setStatus('COMPLETION HYPOTHESES RESET')}}><RefreshCw size={14}/> RESET HYPOTHESES</button>
   </aside></div>
  <footer className="stage4-footer"><span><i/> {status}</span><span>STAGE 04 · GENERATIVE COMPLETION BASELINE · NOT A TRAINED 3D FOUNDATION MODEL</span></footer>
 </section>;
}
