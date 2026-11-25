import {useCallback,useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {ArrowLeft,Box,Hand,Info,Maximize2,Move,RotateCcw} from 'lucide-react';

type DepthMap={width:number;height:number;data:Uint8Array};
type Segment={label:string;score:number;width:number;height:number;data:Uint8Array};
type Props={photoUrl:string;photoName:string;depth:DepthMap|null;segments:Segment[];onExit:()=>void};
type MoveKey='forward'|'back'|'left'|'right';
type GameObject={id:string;label:string;body:InstanceType<typeof RAPIER.RigidBody>;group:THREE.Group;size:THREE.Vector3;confidence:number};

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

export default function Stage6Game({photoUrl,photoName,depth,segments,onExit}:Props){
 const host=useRef<HTMLDivElement>(null);
 const input=useRef({forward:false,back:false,left:false,right:false,jump:false,run:false});
 const gameApi=useRef<{camera:THREE.PerspectiveCamera;objects:GameObject[];cleanup:()=>void}|null>(null);
 const [status,setStatus]=useState('INITIALIZING WORLD SYSTEMS');
 const [ready,setReady]=useState(false);
 const [forceRotate,setForceRotate]=useState(false);
 const [heldName,setHeldName]=useState('');
 const [objectCount,setObjectCount]=useState(0);
 const [error,setError]=useState('');
 const [paused,setPaused]=useState(false);
 const pausedRef=useRef(false);
 const heldRef=useRef<GameObject|null>(null);
 const [gameStarted,setGameStarted]=useState(false);

 const enterLandscape=useCallback(async()=>{
  const el=host.current;
  setForceRotate(window.matchMedia('(orientation: portrait)').matches);
  try{if(el?.requestFullscreen&&!document.fullscreenElement)await el.requestFullscreen()}catch{}
  try{const orientation=screen.orientation as ScreenOrientation&{lock?:(v:'landscape')=>Promise<void>};await orientation.lock?.('landscape')}catch{}
  setForceRotate(window.matchMedia('(orientation: portrait)').matches);
 },[]);
 const leaveLandscape=useCallback(async()=>{
  try{const orientation=screen.orientation as ScreenOrientation&{unlock?:()=>void};orientation.unlock?.()}catch{}
  try{if(document.fullscreenElement)await document.exitFullscreen()}catch{}
  setForceRotate(false);
 },[]);
 const exitGame=useCallback(()=>{void leaveLandscape();onExit()},[leaveLandscape,onExit]);

 useEffect(()=>{
  let disposed=false,animationId=0,renderer:THREE.WebGLRenderer|undefined;
  const node=host.current;if(!node)return;
  const keys=input.current;
  const down=(e:KeyboardEvent)=>{if(e.code==='Escape'){exitGame();return}if(e.code==='KeyW'||e.code==='ArrowUp')keys.forward=true;if(e.code==='KeyS'||e.code==='ArrowDown')keys.back=true;if(e.code==='KeyA'||e.code==='ArrowLeft')keys.left=true;if(e.code==='KeyD'||e.code==='ArrowRight')keys.right=true;if(e.code==='Space'){keys.jump=true;e.preventDefault()}if(e.code==='ShiftLeft'||e.code==='ShiftRight')keys.run=true};
  const up=(e:KeyboardEvent)=>{if(e.code==='KeyW'||e.code==='ArrowUp')keys.forward=false;if(e.code==='KeyS'||e.code==='ArrowDown')keys.back=false;if(e.code==='KeyA'||e.code==='ArrowLeft')keys.left=false;if(e.code==='KeyD'||e.code==='ArrowRight')keys.right=false;if(e.code==='Space')keys.jump=false;if(e.code==='ShiftLeft'||e.code==='ShiftRight')keys.run=false};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);
  let pointerId:number|null=null,lastX=0,lastY=0,yaw=0,pitch=-0.12,verticalSpeed=0,grounded=false,accumulator=0;
  let world:InstanceType<typeof RAPIER.World>|null=null,character:InstanceType<typeof RAPIER.RigidBody>|null=null,characterCollider:InstanceType<typeof RAPIER.Collider>|null=null,controller:InstanceType<typeof RAPIER.KinematicCharacterController>|null=null;
  const objects:GameObject[]=[];
  const scene=new THREE.Scene();scene.background=new THREE.Color('#07111f');scene.fog=new THREE.FogExp2('#07111f',.018);
  const camera=new THREE.PerspectiveCamera(66,1,.08,180);camera.position.set(0,3,8);
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;node.appendChild(renderer.domElement)}catch(e){setError('This browser could not create a WebGL game surface.');setStatus('GRAPHICS INITIALIZATION FAILED');return}
  const canvas=renderer.domElement;canvas.style.touchAction='none';
  scene.add(new THREE.HemisphereLight(0x9adfff,0x172033,2.0));
  const keyLight=new THREE.DirectionalLight(0xd8f4ff,3.2);keyLight.position.set(-6,12,7);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);scene.add(keyLight);
  const rim=new THREE.PointLight(0x20cfff,28,35);rim.position.set(7,5,-4);scene.add(rim);
  const violet=new THREE.PointLight(0x8a65ff,20,28);violet.position.set(-8,3,-8);scene.add(violet);
  const groundMat=new THREE.MeshStandardMaterial({color:0x101d2b,metalness:.55,roughness:.42});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(52,52),groundMat);ground.rotation.x=-Math.PI/2;ground.position.y=-.12;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(52,52,0x35cfff,0x18364d);grid.position.y=-.105;scene.add(grid);
  const ringMat=new THREE.MeshStandardMaterial({color:0x12374b,emissive:0x0b9ac8,emissiveIntensity:1.5,metalness:.65,roughness:.3});
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,x=Math.cos(a)*13,z=Math.sin(a)*13;const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.16,.28,2.6,8),ringMat);pillar.position.set(x,1.3,z);pillar.castShadow=true;scene.add(pillar);const cap=new THREE.Mesh(new THREE.TorusGeometry(.32,.045,8,24),new THREE.MeshBasicMaterial({color:0x47ddff}));cap.rotation.x=Math.PI/2;cap.position.set(x,2.65,z);scene.add(cap)}
  const platformMat=new THREE.MeshStandardMaterial({color:0x142a3d,metalness:.7,roughness:.32,emissive:0x06253a,emissiveIntensity:.5});
  for(let i=0;i<5;i++){const x=(i-2)*3.3,z=-2-(i%2)*3;const p=new THREE.Mesh(new THREE.BoxGeometry(2.3,.32,2.3),platformMat);p.position.set(x,.2,z);p.castShadow=true;p.receiveShadow=true;scene.add(p)}
  let photoImage:HTMLImageElement|null=null;
  const addPhotoWorld=async()=>{
   const image=new Image();image.crossOrigin='anonymous';image.src=photoUrl;
   try{await image.decode()}catch{return}
   if(disposed)return;photoImage=image;
   const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
   const cols=Math.min(120,Math.max(32,depth?.width??80)),rows=Math.min(80,Math.max(24,depth?.height??48));
   const geo=new THREE.PlaneGeometry(12,7,cols,rows);
   const pos=geo.attributes.position as THREE.BufferAttribute;
   if(depth){for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){const u=x/cols,v=y/rows,ix=Math.min(depth.width-1,Math.floor(u*depth.width)),iy=Math.min(depth.height-1,Math.floor(v*depth.height));const d=(depth.data[iy*depth.width+ix]??128)/255;pos.setZ(y*(cols+1)+x,(d-.5)*1.8)}}
   geo.computeVertexNormals();
   const backdrop=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:texture,roughness:.92,metalness:.02,side:THREE.DoubleSide}));backdrop.position.set(0,4,-8);backdrop.receiveShadow=true;scene.add(backdrop);
   const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(12,7,12,7)),new THREE.LineBasicMaterial({color:0x38d9ff,transparent:true,opacity:.3}));edge.position.copy(backdrop.position);scene.add(edge);
  };
  const addPhysics=async()=>{
   try{await RAPIER.init();if(disposed)return;
    world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60;
    const floorBody=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.24,0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(26,.12,26).setFriction(.9),floorBody);
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2,x=Math.cos(a)*13,z=Math.sin(a)*13;const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,1.3,z));world.createCollider(RAPIER.ColliderDesc.cylinder(1.3,.24),b)}
    for(let i=0;i<5;i++){const x=(i-2)*3.3,z=-2-(i%2)*3,b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,.2,z));world.createCollider(RAPIER.ColliderDesc.cuboid(1.15,.16,1.15),b)}
    character=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,1.25,6).setCanSleep(false));
    characterCollider=world.createCollider(RAPIER.ColliderDesc.capsule(.58,.28).setFriction(0).setRestitution(0),character);
    controller=world.createCharacterController(.03);controller.setSlideEnabled(true);controller.setMaxSlopeClimbAngle(Math.PI/3);controller.enableAutostep(.28,.18,true);controller.enableSnapToGround(.24);controller.setApplyImpulsesToDynamicBodies(true);
    const addObject=(id:string,label:string,x:number,y:number,z:number,w:number,h:number,d:number,confidence:number,texture?:THREE.Texture)=>{
     const body=world!.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,y,z).setCanSleep(false).setLinearDamping(.15).setAngularDamping(.35));
     world!.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2).setFriction(.72).setRestitution(.08).setDensity(1.1),body);
     const group=new THREE.Group();const core=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:0x17425a,metalness:.42,roughness:.38,transparent:true,opacity:.28,wireframe:true,emissive:0x19bde8,emissiveIntensity:.8}));core.castShadow=true;group.add(core);
     if(texture){const face=new THREE.Mesh(new THREE.PlaneGeometry(w*.96,h*.96),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));face.position.z=d/2+.012;group.add(face)}
     const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=96;const ctx=labelCanvas.getContext('2d');if(ctx){ctx.fillStyle='#071522dd';ctx.fillRect(0,0,512,96);ctx.strokeStyle='#42dfff';ctx.strokeRect(2,2,508,92);ctx.fillStyle='#c9f6ff';ctx.font='bold 28px monospace';ctx.fillText(label.toUpperCase().slice(0,24),16,59)}
     const labelTexture=new THREE.CanvasTexture(labelCanvas);const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture,transparent:true}));tag.scale.set(Math.max(1.3,w*1.6),.28,1);tag.position.y=h/2+.28;group.add(tag);
     group.position.set(x,y,z);scene.add(group);objects.push({id,label,body,group,size:new THREE.Vector3(w,h,d),confidence});
    };
    if(photoImage&&segments.length){const sourceImage=photoImage;const usable=segments.slice(0,18);usable.forEach((seg,i)=>{
      let x0=seg.width,y0=seg.height,x1=0,y1=0,count=0;const step=Math.max(1,Math.floor(Math.sqrt(seg.width*seg.height/12000)));
      for(let y=0;y<seg.height;y+=step)for(let x=0;x<seg.width;x+=step)if((seg.data[y*seg.width+x]??0)>96){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++}
      if(!count)return;const bw=Math.max(.45,((x1-x0)/seg.width)*8),bh=Math.max(.55,((y1-y0)/seg.height)*5.4),cx=(x0+x1)/2/seg.width,cy=(y0+y1)/2/seg.height;
      const crop=document.createElement('canvas');crop.width=Math.max(2,x1-x0+1);crop.height=Math.max(2,y1-y0+1);const c=crop.getContext('2d');if(!c)return;
      c.drawImage(sourceImage,x0/seg.width*sourceImage.width,y0/seg.height*sourceImage.height,crop.width/seg.width*sourceImage.width,crop.height/seg.height*sourceImage.height,0,0,crop.width,crop.height);
      const pixels=c.getImageData(0,0,crop.width,crop.height),maskX=Math.max(1,Math.floor(x0)),maskY=Math.max(1,Math.floor(y0));
      for(let py=0;py<crop.height;py++)for(let px=0;px<crop.width;px++){const sx=Math.min(seg.width-1,maskX+Math.floor(px/Math.max(1,crop.width)*Math.max(1,x1-x0))),sy=Math.min(seg.height-1,maskY+Math.floor(py/Math.max(1,crop.height)*Math.max(1,y1-y0)));pixels.data[(py*crop.width+px)*4+3]=seg.data[sy*seg.width+sx]??0}
      c.putImageData(pixels,0,0);const tex=new THREE.CanvasTexture(crop);tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;
      const z=-3-(depth?((depth.data[Math.min(depth.height-1,Math.floor(cy*depth.height))*depth.width+Math.min(depth.width-1,Math.floor(cx*depth.width))]??128)/255)*3:0);
      addObject('object-'+i,seg.label,(cx-.5)*9,Math.max(.8,(1-cy)*5.5),z,bw,bh,.5,seg.score,tex);
    })}
    if(!objects.length){[['ARCHIVE CUBE',-2,1,-2],['ENERGY CORE',1,1,-4],['RELIC',3,1,-1],['DATA CRATE',-3,1,1]].forEach((v,i)=>addObject('proxy-'+i,String(v[0]),Number(v[1]),Number(v[2]),Number(v[3]),.9,1,.9,.25))}
    setObjectCount(objects.length);setStatus('RAPIER PHYSICS ONLINE · '+objects.length+' INTERACTIVE OBJECTS');setReady(true);
   }catch(e){setError('Physics engine could not initialize: '+(e instanceof Error?e.message:'unknown error'));setStatus('PHYSICS INITIALIZATION FAILED')}
  };
  const resize=()=>{const w=Math.max(1,node.clientWidth),h=Math.max(1,node.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer!.setSize(w,h,false)};
  const onPointerDown=(e:PointerEvent)=>{pointerId=e.pointerId;lastX=e.clientX;lastY=e.clientY;try{canvas.setPointerCapture(e.pointerId)}catch{}};
  const onPointerMove=(e:PointerEvent)=>{if(pointerId!==e.pointerId)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.004;pitch=clamp(pitch-dy*.003,-.78,.55)};
  const onPointerUp=(e:PointerEvent)=>{if(pointerId===e.pointerId)pointerId=null};
  canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onPointerUp);
  const animate=(time:number)=>{
   if(disposed||!renderer)return;animationId=requestAnimationFrame(animate);
   const dt=Math.min(.04,Math.max(0,(time-(animate as unknown as {last?:number}).last!)/1000||1/60));(animate as unknown as {last:number}).last=time;
   if(world&&character&&characterCollider&&controller&&!pausedRef.current){
    accumulator+=dt;const step=1/60;
    while(accumulator>=step){
     world.timestep=step;world.step();
     const pos=character.translation(),forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
     const move=new THREE.Vector3();if(keys.forward)move.add(forward);if(keys.back)move.sub(forward);if(keys.right)move.add(right);if(keys.left)move.sub(right);if(move.lengthSq()>0)move.normalize().multiplyScalar(keys.run?5.8:3.7);
     if(keys.jump&&grounded){verticalSpeed=5.2;grounded=false}verticalSpeed=Math.max(-18,verticalSpeed-9.81*step);
     const desired={x:move.x*step,y:verticalSpeed*step,z:move.z*step};controller.computeColliderMovement(characterCollider,desired);const actual=controller.computedMovement();character.setNextKinematicTranslation({x:pos.x+actual.x,y:pos.y+actual.y,z:pos.z+actual.z});grounded=controller.computedGrounded();if(grounded&&verticalSpeed<0)verticalSpeed=0;
     if(heldRef.current){const target=camera.position.clone().add(new THREE.Vector3(-Math.sin(yaw),Math.sin(pitch),-Math.cos(yaw)).multiplyScalar(1.65));heldRef.current.body.setTranslation({x:target.x,y:target.y,z:target.z},true);heldRef.current.body.setLinvel({x:0,y:0,z:0},true)}
     accumulator-=step;
    }
    objects.forEach(o=>{const p=o.body.translation(),r=o.body.rotation();o.group.position.set(p.x,p.y,p.z);o.group.quaternion.set(r.x,r.y,r.z,r.w)});
    const cp=character.translation(),look=new THREE.Vector3(-Math.sin(yaw),Math.sin(pitch),-Math.cos(yaw));camera.position.lerp(new THREE.Vector3(cp.x+Math.sin(yaw)*3.8,cp.y+2.25,cp.z+Math.cos(yaw)*3.8),.16);camera.lookAt(new THREE.Vector3(cp.x,cp.y+1.15,cp.z).add(look.multiplyScalar(2.5)));
   }
   renderer.render(scene,camera);
  };
  const start=async()=>{setStatus('LOADING RAPIER WASM PHYSICS + DEPTH WORLD');await addPhotoWorld();if(disposed)return;await addPhysics();if(disposed)return;resize();animationId=requestAnimationFrame(animate)};
  void start();
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(node);window.addEventListener('resize',resize);
  const cleanup=()=>{disposed=true;cancelAnimationFrame(animationId);resizeObserver.disconnect();window.removeEventListener('resize',resize);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);canvas.removeEventListener('pointerdown',onPointerDown);canvas.removeEventListener('pointermove',onPointerMove);canvas.removeEventListener('pointerup',onPointerUp);canvas.removeEventListener('pointercancel',onPointerUp);renderer?.setAnimationLoop(null);renderer?.dispose();world?.free();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const m=o.material;if(Array.isArray(m))m.forEach(x=>x.dispose());else m.dispose()}});if(canvas.parentElement===node)node.removeChild(canvas)};
  gameApi.current={camera,objects,cleanup};
  return cleanup;
 },[photoUrl,depth,segments,exitGame]);

 const moveButton=(key:MoveKey,value:boolean)=>{input.current[key]=value};
 const jump=()=>{input.current.jump=true;window.setTimeout(()=>{input.current.jump=false},180)};
 const pickup=()=>{const api=gameApi.current;if(!api)return;if(heldRef.current){heldRef.current.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);heldRef.current.body.setLinvel({x:0,y:0,z:-1.2},true);heldRef.current=null;setHeldName('');setStatus('OBJECT RELEASED · GRAVITY ACTIVE');return}const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),api.camera);const hits=ray.intersectObjects(api.objects.flatMap(o=>o.group.children),true);const hit=hits.find(h=>h.distance<4.2);if(!hit){setStatus('AIM AT AN OBJECT WITHIN REACH');return}let object:GameObject|undefined;for(const candidate of api.objects){let p:THREE.Object3D|null=hit.object;while(p&&p!==candidate.group)p=p.parent;if(p===candidate.group){object=candidate;break}}if(!object){setStatus('OBJECT NOT AVAILABLE');return}heldRef.current=object;object.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);setHeldName(object.label);setStatus('PICKED UP · '+object.label.toUpperCase())};

 useEffect(()=>{const onChange=()=>setForceRotate(window.matchMedia('(orientation: portrait)').matches);window.addEventListener('orientationchange',onChange);window.addEventListener('resize',onChange);return()=>{window.removeEventListener('orientationchange',onChange);window.removeEventListener('resize',onChange)}},[]);
 useEffect(()=>()=>{heldRef.current=null;void leaveLandscape()},[leaveLandscape]);

 return <div ref={host} className={'stage6-game '+(forceRotate?'stage6-force-landscape':'')}>
  {!gameStarted&&<div className="stage6-start"><div><span>STAGE 06 · WORLD SIMULATOR</span><h1>ENTER YOUR PHOTO WORLD</h1><p>Explore the reconstructed depth field, move around detected object proxies, and pick them up. Hidden geometry remains clearly marked as estimated.</p><button type="button" onClick={()=>{void enterLandscape();setGameStarted(true)}}><Maximize2 size={15}/> ENTER GAME · LANDSCAPE</button><small>Browsers without orientation locking use a rotated landscape game view. EXIT WORLD returns to the studio.</small></div></div>}
  {gameStarted&&<div className="stage6-hud stage6-top"><div className="stage6-brand"><span className="stage6-live"/> VIRTUAL ITG <b>WORLD SIMULATOR</b><small>{photoName||'PHOTO WORLD'}</small></div><div className="stage6-top-actions"><span>{objectCount} OBJECTS · RAPIER 3D</span><button type="button" onClick={()=>{const next=!pausedRef.current;pausedRef.current=next;setPaused(next)}}>{paused?'RESUME':'PAUSE'}</button><button type="button" onClick={exitGame}><ArrowLeft size={14}/> EXIT WORLD</button></div></div>}
  {gameStarted&&<div className="stage6-reticle"><i/></div>}
  {gameStarted&&<div className="stage6-hud stage6-left-info"><b>{status}</b><small>WASD / ARROWS · DRAG TO LOOK · SPACE TO JUMP</small>{heldName&&<span><Hand size={12}/> HOLDING: {heldName}</span>}</div>}
  {error&&<div className="stage6-error">{error}</div>}
  {gameStarted&&<div className="stage6-touch stage6-movement">
   <div className="stage6-dpad"><button type="button" aria-label="Move forward" onPointerDown={e=>{e.preventDefault();moveButton('forward',true)}} onPointerUp={()=>moveButton('forward',false)} onPointerLeave={()=>moveButton('forward',false)}>▲</button><div><button type="button" aria-label="Move left" onPointerDown={e=>{e.preventDefault();moveButton('left',true)}} onPointerUp={()=>moveButton('left',false)} onPointerLeave={()=>moveButton('left',false)}>◀</button><button type="button" aria-label="Move backward" onPointerDown={e=>{e.preventDefault();moveButton('back',true)}} onPointerUp={()=>moveButton('back',false)} onPointerLeave={()=>moveButton('back',false)}>▼</button><button type="button" aria-label="Move right" onPointerDown={e=>{e.preventDefault();moveButton('right',true)}} onPointerUp={()=>moveButton('right',false)} onPointerLeave={()=>moveButton('right',false)}>▶</button></div></div>
  </div>}
  {gameStarted&&<div className="stage6-touch stage6-actions"><button type="button" className="stage6-jump" onClick={jump}>JUMP</button><button type="button" className="stage6-pickup" onClick={pickup}><Hand size={17}/>{heldName?'DROP':'PICK UP'}</button><button type="button" className="stage6-run" onPointerDown={()=>{input.current.run=true}} onPointerUp={()=>{input.current.run=false}} onPointerLeave={()=>{input.current.run=false}}>RUN</button></div>}
  {gameStarted&&<div className="stage6-hud stage6-bottom"><span><Move size={12}/> MOVE</span><span><RotateCcw size={12}/> DRAG TO LOOK</span><span><Box size={12}/> {objectCount} PHYSICS PROXIES</span><span><Info size={12}/> INFERRED PARTS ARE APPROXIMATIONS</span></div>}
  {!ready&&!error&&<div className="stage6-loading"><div className="stage6-loader"/><b>{status}</b><small>BUILDING PHOTO-DERIVED RELIEF + INTERACTIVE OBJECT COLLIDERS</small></div>}
  {gameStarted&&paused&&<div className="stage6-pause"><b>WORLD PAUSED</b><button type="button" onClick={()=>{pausedRef.current=false;setPaused(false)}}>RESUME EXPLORATION</button><button type="button" onClick={exitGame}>EXIT WORLD</button></div>}
 </div>;
}
