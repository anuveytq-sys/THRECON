export type PrimitiveKind='cube'|'sphere'|'torus';
export interface SceneItem{id:string;name:string;kind:PrimitiveKind;position:[number,number,number];rotation:[number,number,number];scale:[number,number,number];color:string}
export interface ThreconProject{schemaVersion:1;name:string;updatedAt:string;items:SceneItem[]}
export const starterItems=():SceneItem[]=>[
{id:'core-cube',name:'CORE / CUBE',kind:'cube',position:[0,.65,0],rotation:[.2,.45,0],scale:[1.3,1.3,1.3],color:'#35d9ff'},
{id:'orbital-sphere',name:'ORBITAL / 01',kind:'sphere',position:[2.35,.9,-.7],rotation:[0,0,0],scale:[.72,.72,.72],color:'#9a83ff'},
{id:'signal-torus',name:'SIGNAL / RING',kind:'torus',position:[-2.15,.9,.4],rotation:[1.1,.2,0],scale:[.85,.85,.85],color:'#4ef0bd'}];
export const createProject=(items:SceneItem[]):ThreconProject=>({schemaVersion:1,name:'UNTITLED REALITY',updatedAt:new Date().toISOString(),items});
export function isProject(v:unknown):v is ThreconProject{if(!v||typeof v!=='object')return false;const p=v as Partial<ThreconProject>;return p.schemaVersion===1&&typeof p.name==='string'&&Array.isArray(p.items)&&p.items.every(x=>typeof x.id==='string'&&typeof x.name==='string'&&['cube','sphere','torus'].includes(x.kind)&&Array.isArray(x.position)&&x.position.length===3&&Array.isArray(x.rotation)&&x.rotation.length===3&&Array.isArray(x.scale)&&x.scale.length===3&&typeof x.color==='string')}