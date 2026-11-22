export type PrimitiveKind='cube'|'sphere'|'torus';
export interface SceneItem{id:string;name:string;kind:PrimitiveKind;position:[number,number,number];rotation:[number,number,number];scale:[number,number,number];color:string}
export interface ThreconProject{schemaVersion:1;name:string;updatedAt:string;items:SceneItem[]}
// Stage 2 starts with an empty scene. Objects are created only by the user or later reconstruction stages.
export const starterItems=():SceneItem[]=>[];
export const createProject=(items:SceneItem[]):ThreconProject=>({schemaVersion:1,name:'UNTITLED REALITY',updatedAt:new Date().toISOString(),items});
export function isProject(v:unknown):v is ThreconProject{if(!v||typeof v!=='object')return false;const p=v as Partial<ThreconProject>;return p.schemaVersion===1&&typeof p.name==='string'&&Array.isArray(p.items)&&p.items.every(x=>typeof x.id==='string'&&typeof x.name==='string'&&['cube','sphere','torus'].includes(x.kind)&&Array.isArray(x.position)&&x.position.length===3&&Array.isArray(x.rotation)&&x.rotation.length===3&&Array.isArray(x.scale)&&x.scale.length===3&&typeof x.color==='string')}