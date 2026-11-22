import {useEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {ArrowLeft,Box,Download,Expand,Focus,Grid3X3,Info,Move3D,Ruler,ScanLine,SlidersHorizontal} from 'lucide-react';

type DepthMap={width:number;height:number;data:Uint8Array};
type Props={photoUrl:string;photoName:string;depth:DepthMap|null;onBack:()=>void};
type Point={x:number;y:number};

export default function ReconstructionLab({photoUrl,photoName,depth,onBack}:Props){
 const host=useRef<HTMLDivElement>(null);
 const api=useRef<{renderer:THREE.WebGLRenderer;scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;mesh:THREE.Mesh|null;geometry:THREE.BufferGeometry|null;texture:THREE.Texture|null}|null>(null);
 const [strength,setStrength]=useState(1.8);
 const [resolution,setResolution]=useState(160);
 const [wireframe,setWireframe]=useState(false);
 const [mode,setMode]=useState<'mesh'|'measure'>('mesh');
 const [referenceCm,setReferenceCm]=useState('100');
 const [measure,setMeasure]=useState<{start:Point;end:Point}|null>(null);
 const [drag,setDrag]=useState<Point|null>(null);
 const [imageSize,setImageSize]=useState<[number,number]>([0,0]);
 const measureCanvas=useRef<HTMLCanvasElement>(null);
 const normalized=useMemo(()=>{
  if(!depth?.data?.length)return null;
  let min=255,max=0;
  for(let i=0;i<depth.data.length;i++){const v=depth.data[i];if(v<min)min=v;if(v>max)max=v;}
  const span=Math.max(1,max-min);
  return {min,max,values:Array.from(depth.data,v=>(v-min)/span)};
 },[depth]);
 useEffect(()=>{
  const node=host.current;if(!node||!photoUrl||!depth||!normalized)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{node.dataset.error='webgl';return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setSize(node.clientWidth,node.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;node.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#060b16');
  const camera=new THREE.PerspectiveCamera(42,node.clientWidth/Math.max(1,node.clientHeight),.1,100);camera.position.set(0,2.7,9);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,0,0);controls.minDistance=2.5;controls.maxDistance=24;
  scene.add(new THREE.HemisphereLight('#b9eaff','#12152c',2));
  const key=new THREE.DirectionalLight('#a6eaff',3.2);key.position.set(4,7,6);scene.add(key);
  const rim=new THREE.PointLight('#795cff',20,18);rim.position.set(-4,2,-3);scene.add(rim);
  const grid=new THREE.GridHelper(12,24,'#245b78','#172c43');grid.position.y=-2.4;scene.add(grid);
  const image=new Image();
  image.onload=()=>{
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const ctx=canvas.getContext('2d');if(!ctx)return;ctx.drawImage(image,0,0);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
   const cols=resolution,rows=Math.max(8,Math.round(resolution*depth.height/depth.width));
   const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
   const worldW=6,worldH=worldW*depth.height/depth.width;
   for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
    const sx=Math.min(depth.width-1,Math.round(x/cols*(depth.width-1)));
    const sy=Math.min(depth.height-1,Math.round(y/rows*(depth.height-1)));
    const z=(normalized.values[sy*depth.width+sx]-.5)*strength;
    positions.push((x/cols-.5)*worldW,(.5-y/rows)*worldH,z);
    uvs.push(x/cols,1-y/rows);
   }
   for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;indices.push(a,c,b,b,c,d);
   }
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
   const material=new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide,roughness:.82,metalness:.04,wireframe});
   const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
   api.current={renderer,scene,camera,controls,mesh,geometry,texture};
  };
  image.src=photoUrl;
  let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)};animate();
  const resize=()=>{if(!node.clientWidth||!node.clientHeight)return;camera.aspect=node.clientWidth/node.clientHeight;camera.updateProjectionMatrix();renderer.setSize(node.clientWidth,node.clientHeight)};
  const observer=new ResizeObserver(resize);observer.observe(node);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(v=>v.dispose())}});renderer.dispose();renderer.domElement.remove();api.current=null;};
 },[photoUrl,depth,normalized,resolution]);
 useEffect(()=>{const a=api.current;if(!a?.mesh||!a.geometry)return;const p=a.geometry.attributes.position as THREE.BufferAttribute;for(let i=0;i<p.count;i++){const x=i%(resolution+1),y=Math.floor(i/(resolution+1));const cols=resolution,rows=Math.max(8,Math.round(resolution*(depth?.height??1)/(depth?.width??1)));const sx=Math.min((depth?.width??1)-1,Math.round(x/cols*((depth?.width??1)-1)));const sy=Math.min((depth?.height??1)-1,Math.round(y/rows*((depth?.height??1)-1)));p.setZ(i,((normalized?.values[sy*(depth?.width??1)+sx]??.5)-.5)*strength);}p.needsUpdate=true;a.geometry.computeVertexNormals();(a.mesh.material as THREE.MeshStandardMaterial).wireframe=wireframe;},[strength,wireframe,resolution,depth,normalized]);
 useEffect(()=>{const canvas=measureCanvas.current;if(!canvas||!photoUrl)return;let cancelled=false;const image=new Image();image.onload=()=>{if(cancelled)return;const maxW=1000,scale=Math.min(1,maxW/image.naturalWidth);canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);setImageSize([image.naturalWidth,image.naturalHeight]);const ctx=canvas.getContext('2d');if(!ctx)return;ctx.drawImage(image,0,0,canvas.width,canvas.height);if(measure){ctx.strokeStyle='#42eaff';ctx.lineWidth=2;ctx.fillStyle='rgba(40,210,255,.13)';const x=Math.min(measure.start.x,measure.end.x),y=Math.min(measure.start.y,measure.end.y),w=Math.abs(measure.end.x-measure.start.x),h=Math.abs(measure.end.y-measure.start.y);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.fillStyle='#e9fbff';ctx.font='bold 13px sans-serif';ctx.fillText(Math.round(w/scale)+' × '+Math.round(h/scale)+' px',x+6,Math.max(16,y-7));}};image.src=photoUrl;return()=>{cancelled=true}},[photoUrl,measure]);
 const pointer=(e:PointerEvent<HTMLCanvasElement>,end:boolean)=>{const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)*e.currentTarget.width/r.width,y=(e.clientY-r.top)*e.currentTarget.height/r.height;const point={x,y};if(!end){setDrag(point);setMeasure({start:point,end:point});e.currentTarget.setPointerCapture(e.pointerId);}else if(drag){setMeasure({start:drag,end:point});setDrag(null)}};
 const exportGlb=async()=>{const a=api.current;if(!a?.mesh){return}try{const exporter=new GLTFExporter();const result=await exporter.parseAsync(a.scene,{binary:true,onlyVisible:true});const blob=new Blob([result as ArrayBuffer],{type:'model/gltf-binary'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='threcon-photo-reconstruction.glb';link.click();URL.revokeObjectURL(url);}catch(error){console.error(error);}};
 const pxWidth=measure?Math.abs(measure.end.x-measure.start.x)*imageSize[0]/Math.max(1,measureCanvas.current?.width??1):0;
 const pxHeight=measure?Math.abs(measure.end.y-measure.start.y)*imageSize[1]/Math.max(1,measureCanvas.current?.height??1):0;
 const ref=Number(referenceCm),cmPerPx=ref>0&&pxWidth>0?ref/pxWidth:0;
 return <section className="recon-workspace">
  <header className="recon-header"><div><span className="eyebrow">STAGE 03 · SINGLE-PHOTO RECONSTRUCTION</span><strong>{photoName||'PHOTO SURFACE'}</strong></div><button className="recon-back" onClick={onBack}><ArrowLeft size={14}/> BACK TO SPATIAL LAB</button></header>
  {!depth||!normalized?<div className="recon-empty"><ScanLine size={30}/><h2>DEPTH MAP REQUIRED</h2><p>Stage 3 builds a textured 3D surface from the Stage 2 depth model. Run Visual Intelligence first; no synthetic depth is substituted.</p><button onClick={onBack}>RETURN TO PHOTO ANALYSIS</button></div>:<>
   <div className="recon-tabs"><button className={mode==='mesh'?'active':''} onClick={()=>setMode('mesh')}><Move3D size={14}/> 3D RECONSTRUCTION</button><button className={mode==='measure'?'active':''} onClick={()=>setMode('measure')}><Ruler size={14}/> PHOTO MEASUREMENT</button></div>
   {mode==='mesh'?<div className="recon-layout"><div className="recon-viewport glass" ref={host}><div className="recon-hud"><span><Box size={12}/> DEPTH-DERIVED TEXTURED MESH</span><span>ORBIT · PAN · ZOOM</span></div><div className="recon-viewport-fallback">3D renderer unavailable — enable WebGL in this browser</div></div><aside className="recon-controls glass"><div className="stage2-side-title"><span><SlidersHorizontal size={14}/> GEOMETRY CONTROLS</span><b>LIVE</b></div><label>DEPTH AMPLITUDE <b>{strength.toFixed(1)}×</b></label><input type="range" min="0" max="5" step=".1" value={strength} onChange={e=>setStrength(Number(e.target.value))}/><label>MESH DENSITY <b>{resolution} × {Math.max(8,Math.round(resolution*depth.height/depth.width))}</b></label><input type="range" min="48" max="240" step="16" value={resolution} onChange={e=>setResolution(Number(e.target.value))}/><button className="stage2-secondary" onClick={()=>setWireframe(v=>!v)}><Grid3X3 size={13}/> {wireframe?'TEXTURED SURFACE':'SHOW WIREFRAME'}</button><button className="stage2-analyze" onClick={()=>void exportGlb()}><Download size={14}/> EXPORT 3D MODEL · GLB</button><div className="recon-note"><Info size={14}/><p>This is a real mesh generated from predicted relative depth and the source photo texture. It is a view-conditioned surface, not a complete room scan. Hidden backsides and metric scale are unknown.</p></div><div className="recon-stats"><span>DEPTH MODEL <b>DEPTH ANYTHING V2</b></span><span>VERTICES <b>{(resolution+1)*(Math.max(8,Math.round(resolution*depth.height/depth.width))+1).toLocaleString()}</b></span><span>SOURCE <b>{depth.width} × {depth.height}</b></span></div></aside></div>:<div className="recon-measure-layout"><div className="recon-measure-photo glass"><div className="recon-hud"><span><Ruler size={12}/> DRAG TO MEASURE A REGION</span><span>{imageSize[0]} × {imageSize[1]} PX</span></div><canvas ref={measureCanvas} onPointerDown={e=>pointer(e,false)} onPointerMove={e=>{if(drag){const r=e.currentTarget.getBoundingClientRect();setMeasure({start:drag,end:{x:(e.clientX-r.left)*e.currentTarget.width/r.width,y:(e.clientY-r.top)*e.currentTarget.height/r.height}})}} onPointerUp={e=>pointer(e,true)}/></div><aside className="recon-controls glass"><div className="stage2-side-title"><span><Focus size={14}/> IMAGE-PLANE MEASURE</span><b>ESTIMATE</b></div><p className="recon-measure-help">Drag over an object to read its pixel bounds. For an approximate scale, enter a known width for a reference object in the same image plane.</p><label>REFERENCE WIDTH (CM)</label><input value={referenceCm} onChange={e=>setReferenceCm(e.target.value)} inputMode="decimal"/><div className="recon-stats"><span>WIDTH <b>{Math.round(pxWidth)} px</b></span><span>HEIGHT <b>{Math.round(pxHeight)} px</b></span>{measure&&ref>0&&pxWidth>0&&<><span>CALIBRATED WIDTH <b>{ref.toFixed(1)} cm</b></span><span>APPROX. HEIGHT <b>{(pxHeight*cmPerPx).toFixed(1)} cm</b></span></>}</div><button className="stage2-secondary" onClick={()=>setMeasure(null)}>CLEAR MEASUREMENT</button><div className="recon-note"><Info size={14}/><p>Measurements are pixel-accurate on the image plane. A reference-width estimate only applies to objects at roughly the same distance and plane; perspective distortion prevents reliable real-world measurement from one uncalibrated photo.</p></div></aside></div>}
  </>}
 </section>;
}
