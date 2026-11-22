import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
interface Props{depth:{width:number;height:number;data:Uint8Array};rgb:Uint8ClampedArray}
export default function PointCloudPreview({depth,rgb}:Props){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{const node=host.current;if(!node)return;let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{return}renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(node.clientWidth,node.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;node.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#050b16');const camera=new THREE.PerspectiveCamera(48,node.clientWidth/node.clientHeight,.1,100);camera.position.set(0,1.6,6.5);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,0,0);
 scene.add(new THREE.HemisphereLight('#bdeaff','#111827',1.4));const grid=new THREE.GridHelper(5,20,'#235d78','#162c43');grid.position.y=-1.3;scene.add(grid);
 const stride=Math.max(1,Math.floor(Math.sqrt((depth.width*depth.height)/18000)));const pos:number[]=[];const colors:number[]=[];
 for(let y=0;y<depth.height;y+=stride){for(let x=0;x<depth.width;x+=stride){const i=y*depth.width+x;const v=depth.data[i]/255;const sx=(x/depth.width-.5)*4.2;const sy=(.5-y/depth.height)*2.8;const z=(.5-v)*2.1;const ci=i*4;pos.push(sx,sy,z);colors.push((rgb[ci]??130)/255,(rgb[ci+1]??180)/255,(rgb[ci+2]??210)/255)}}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const points=new THREE.Points(geo,new THREE.PointsMaterial({size:.025,vertexColors:true,sizeAttenuation:true}));scene.add(points);
 let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)};animate();const resize=()=>{if(!node.clientWidth||!node.clientHeight)return;camera.aspect=node.clientWidth/node.clientHeight;camera.updateProjectionMatrix();renderer.setSize(node.clientWidth,node.clientHeight)};const observer=new ResizeObserver(resize);observer.observe(node);
 return()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();geo.dispose();(points.material as THREE.Material).dispose();renderer.dispose();renderer.domElement.remove()};},[depth,rgb]);
 return <div className="point-cloud-host" ref={host}/>;
}