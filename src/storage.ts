import type {ThreconProject} from './project';
const DB='threcon-local',PROJECTS='projects',SCANS='scans';
function openDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(new Error('IndexedDB unavailable'));const r=indexedDB.open(DB,4);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(PROJECTS))r.result.createObjectStore(PROJECTS);if(!r.result.objectStoreNames.contains(SCANS))r.result.createObjectStore(SCANS,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});}
export async function saveProject(p:ThreconProject):Promise<void>{const db=await openDB();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(PROJECTS,'readwrite');tx.objectStore(PROJECTS).put(p,'current');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();}
export async function loadProject():Promise<ThreconProject|null>{const db=await openDB();const p=await new Promise<ThreconProject|null>((resolve,reject)=>{const r=db.transaction(PROJECTS,'readonly').objectStore(PROJECTS).get('current');r.onsuccess=()=>resolve((r.result as ThreconProject|undefined)??null);r.onerror=()=>reject(r.error)});db.close();return p;}
export async function clearCaptureHistory():Promise<void>{
 const db=await openDB();
 try{
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(SCANS,'readwrite');
   tx.objectStore(SCANS).clear();
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
   tx.onabort=()=>reject(tx.error??new Error('Capture history cleanup aborted'));
  });
 }finally{db.close()}
 try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('virtual-itg-stage5:'))localStorage.removeItem(key)}}catch{/* Storage may be disabled by the browser */}
}
