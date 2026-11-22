import type {ThreconProject} from './project';
const DB='threcon-local',PROJECTS='projects',SCANS='scans';
export interface SavedScan {
  id:string; imageName:string; imageBlob:Blob; width:number; height:number; createdAt:string;
  depth?:{width:number;height:number;data:Uint8Array};
  segments:Array<{label:string;score:number;width:number;height:number;data:Uint8Array}>;
  depthModel:string;segmentationModel:string;runtime:string;elapsedMs:number;warnings:string[];
}
function openDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(new Error('IndexedDB unavailable'));const r=indexedDB.open(DB,2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(PROJECTS))r.result.createObjectStore(PROJECTS);if(!r.result.objectStoreNames.contains(SCANS))r.result.createObjectStore(SCANS,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});}
export async function saveProject(p:ThreconProject):Promise<void>{const db=await openDB();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(PROJECTS,'readwrite');tx.objectStore(PROJECTS).put(p,'current');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();}
export async function loadProject():Promise<ThreconProject|null>{const db=await openDB();const p=await new Promise<ThreconProject|null>((resolve,reject)=>{const r=db.transaction(PROJECTS,'readonly').objectStore(PROJECTS).get('current');r.onsuccess=()=>resolve((r.result as ThreconProject|undefined)??null);r.onerror=()=>reject(r.error)});db.close();return p;}
export async function saveScan(scan:SavedScan):Promise<void>{const db=await openDB();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(SCANS,'readwrite');tx.objectStore(SCANS).put(scan);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();}
export async function loadLatestScan():Promise<SavedScan|null>{const db=await openDB();const scan=await new Promise<SavedScan|null>((resolve,reject)=>{const r=db.transaction(SCANS,'readonly').objectStore(SCANS).getAll();r.onsuccess=()=>resolve(((r.result as SavedScan[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0])??null);r.onerror=()=>reject(r.error)});db.close();return scan;}