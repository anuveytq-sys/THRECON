import { env, pipeline, RawImage } from '@huggingface/transformers';

type Task='depth-estimation'|'image-segmentation';
type WorkerRequest={id:number;blob:Blob};
type SegmentPayload={label:string;score:number;width:number;height:number;data:Uint8Array};
type DepthPayload={width:number;height:number;data:Uint8Array};
type WorkerResult={depth?:DepthPayload;segments?:SegmentPayload[];depthModel:string;segmentationModel:string;runtime:string;elapsedMs:number;warnings:string[]};
type PipelineFunction=(input:RawImage)=>Promise<any>;
const DEPTH_MODELS=['onnx-community/depth-anything-v2-small','onnx-community/depth-anything-v2-small-ONNX'];
const SEGMENTATION_MODEL='Xenova/detr-resnet-50-panoptic';
let depthPipeline:PipelineFunction|null=null;
let segmentationPipeline:PipelineFunction|null=null;
let runtime='WASM / CPU';
let depthModelUsed=DEPTH_MODELS[0];
const scope=self as unknown as {onmessage:((event:MessageEvent<WorkerRequest>)=>void)|null;postMessage:(message:unknown,transfer?:Transferable[])=>void};
env.allowLocalModels=false;
env.allowRemoteModels=true;
env.useBrowserCache=true;
const createPipeline=pipeline as unknown as (task:Task,model:string,options:Record<string,unknown>)=>Promise<PipelineFunction>;

async function loadPipeline(task:Task,model:string,progress:(message:string)=>void,device:'webgpu'|'wasm'):Promise<PipelineFunction>{
 return createPipeline(task,model,{
  device,
  progress_callback:(event:{status?:string;progress?:number;file?:string})=>{
   if(typeof event.progress==='number')progress('Downloading '+(task==='depth-estimation'?'Depth Anything V2':'segmentation')+' · '+Math.round(event.progress)+'%');
   else if(event.status==='progress')progress('Downloading '+(event.file||'model weights')+'…');
  }
 });
}
function grayscale(raw:RawImage):DepthPayload{
 const channels=raw.channels||1;
 const data=new Uint8Array(raw.width*raw.height);
 if(channels===1){data.set(raw.data.subarray(0,data.length));}
 else{
  for(let i=0;i<data.length;i++){
   const p=i*channels;
   data[i]=Math.round((raw.data[p]||0)*.299+(raw.data[p+1]||0)*.587+(raw.data[p+2]||0)*.114);
  }
 }
 return {width:raw.width,height:raw.height,data};
}
async function runLocalBackendDepth(blob:Blob,progress:(message:string)=>void):Promise<DepthPayload|null>{
 const controller=new AbortController();
 // The first local request downloads and initializes the model; do not cancel it after a short UI timeout.
 const timeout=setTimeout(()=>controller.abort(),8*60*1000);
 try{
  progress('Checking optional local Depth Anything V2 backend…');
  const form=new FormData();form.append('image',blob,'source.jpg');
  const response=await fetch('http://127.0.0.1:8000/v1/vision/depth',{method:'POST',body:form,signal:controller.signal});
  if(!response.ok){
   const detail=await response.json().catch(()=>({}));
   throw new Error('Local depth API HTTP '+response.status+(detail.detail?': '+detail.detail:''));
  }
  const payload=await response.json() as {depth_png_base64?:string};
  if(!payload.depth_png_base64)throw new Error('Local depth API returned no depth image.');
  const binary=atob(payload.depth_png_base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const raw=await RawImage.fromBlob(new Blob([bytes],{type:'image/png'}));
  progress('Depth estimated by the local Python backend.');
  return grayscale(raw);
 }catch(error){
  if(error instanceof Error&&error.name!=='AbortError')progress('Local backend unavailable; using browser inference…');
  if(error instanceof Error&&error.name==='AbortError')progress('Local backend timed out; switching to browser inference…');
  return null;
 }finally{clearTimeout(timeout);}
}
async function inferDepth(image:RawImage,progress:(message:string)=>void):Promise<DepthPayload>{
 if(!depthPipeline)throw new Error('Depth pipeline was not initialized.');
 const output=await depthPipeline(image);
 const raw=output?.depth as RawImage|undefined;
 if(!raw?.data||!raw.width||!raw.height)throw new Error('Depth Anything V2 returned an empty depth image.');
 return grayscale(raw);
}
async function loadDepthOnWasm(progress:(message:string)=>void,errors:string[]):Promise<void>{
 for(const model of DEPTH_MODELS){
  try{
   progress('Loading official Depth Anything V2 Small · WASM / CPU…');
   depthPipeline=await loadPipeline('depth-estimation',model,progress,'wasm');
   depthModelUsed=model;runtime='WASM / CPU';return;
  }catch(error){
   errors.push(model+': '+(error instanceof Error?error.message:String(error)));
   depthPipeline=null;
  }
 }
 throw new Error('Could not load a Transformers.js-compatible Depth Anything V2 model. '+errors.join(' | '));
}
async function runDepth(image:RawImage,blob:Blob,progress:(message:string)=>void):Promise<DepthPayload>{
 const local=await runLocalBackendDepth(blob,progress);
 if(local){runtime='Local Python API';depthModelUsed='depth-anything/Depth-Anything-V2-Small-hf';return local;}
 const hasGpu=typeof navigator!=='undefined'&&Boolean((navigator as unknown as {gpu?:unknown}).gpu);
 const errors:string[]=[];
 if(!depthPipeline&&hasGpu){
  try{
   progress('Preparing Depth Anything V2 on WebGPU…');
   // Let Transformers.js select the model's supported default precision.
   depthPipeline=await loadPipeline('depth-estimation',DEPTH_MODELS[0],progress,'webgpu');
   depthModelUsed=DEPTH_MODELS[0];runtime='WebGPU';
  }catch(error){
   errors.push('WebGPU initialization: '+(error instanceof Error?error.message:String(error)));
   depthPipeline=null;
  }
 }
 if(!depthPipeline)await loadDepthOnWasm(progress,errors);
 try{
  progress('Estimating per-pixel relative depth…');
  return await inferDepth(image,progress);
 }catch(error){
  if(runtime!=='WebGPU')throw new Error('Depth inference failed on WASM / CPU: '+(error instanceof Error?error.message:String(error)));
  errors.push('WebGPU inference: '+(error instanceof Error?error.message:String(error)));
  depthPipeline=null;runtime='WASM / CPU';
  await loadDepthOnWasm(progress,errors);
  progress('Retrying depth inference on WASM / CPU…');
  try{return await inferDepth(image,progress);}
  catch(cpuError){throw new Error('Depth inference failed on WebGPU and WASM / CPU. '+errors.join(' | ')+' | CPU inference: '+(cpuError instanceof Error?cpuError.message:String(cpuError)));}
 }
}
async function runSegmentation(image:RawImage,progress:(message:string)=>void):Promise<SegmentPayload[]>{
 const hasGpu=typeof navigator!=='undefined'&&Boolean((navigator as unknown as {gpu?:unknown}).gpu);
 if(!segmentationPipeline&&hasGpu){try{progress('Preparing WebGPU segmentation model…');segmentationPipeline=await loadPipeline('image-segmentation',SEGMENTATION_MODEL,progress,'webgpu');}catch{segmentationPipeline=null;}}
 if(!segmentationPipeline){progress('Loading segmentation model on WASM / CPU…');segmentationPipeline=await loadPipeline('image-segmentation',SEGMENTATION_MODEL,progress,'wasm');}
 const convert=(output:Array<{label:string;score:number;mask:RawImage}>)=>output.slice(0,10).map(segment=>({label:segment.label,score:segment.score,width:segment.mask.width,height:segment.mask.height,data:new Uint8Array(segment.mask.data)}));
 try{progress('Finding object regions…');return convert(await segmentationPipeline(image));}
 catch(error){
  if(!hasGpu)throw error;
  progress('Segmentation GPU inference failed; retrying on WASM / CPU…');segmentationPipeline=null;
  segmentationPipeline=await loadPipeline('image-segmentation',SEGMENTATION_MODEL,progress,'wasm');
  return convert(await segmentationPipeline(image));
 }
}
scope.onmessage=async(event:MessageEvent<WorkerRequest>)=>{
 const {id,blob}=event.data,started=performance.now(),warnings:string[]=[];
 const progress=(message:string)=>scope.postMessage({id,type:'progress',message});
 try{
  progress('Decoding source photograph…');
  const image=await RawImage.fromBlob(blob);
  let depth:DepthPayload|undefined;let segments:SegmentPayload[]=[];
  try{
   depth=await runDepth(image,blob,progress);
   const earlyDepth={...depth,data:new Uint8Array(depth.data)};
   scope.postMessage({id,type:'depth',depth:earlyDepth,depthModel:depthModelUsed,runtime,elapsedMs:Math.round(performance.now()-started)},[earlyDepth.data.buffer as ArrayBuffer]);
  }catch(error){warnings.push('Depth model unavailable: '+(error instanceof Error?error.message:'unknown model error'));}
  try{
   segments=await runSegmentation(image,progress);
   const earlySegments=segments.map(segment=>({...segment,data:new Uint8Array(segment.data)}));
   scope.postMessage({id,type:'segments',segments:earlySegments},earlySegments.map(segment=>segment.data.buffer as ArrayBuffer));
  }catch(error){warnings.push('Segmentation model unavailable: '+(error instanceof Error?error.message:'unknown model error'));}
  if(!depth&&segments.length===0)throw new Error(warnings.join(' '));
  const result:WorkerResult={depth,segments,depthModel:depthModelUsed,segmentationModel:SEGMENTATION_MODEL,runtime,elapsedMs:Math.round(performance.now()-started),warnings};
  const transfer:Transferable[]=[];
  if(depth)transfer.push(depth.data.buffer as ArrayBuffer);
  for(const segment of segments)transfer.push(segment.data.buffer as ArrayBuffer);
  scope.postMessage({id,type:'complete',result},transfer);
 }catch(error){scope.postMessage({id,type:'error',message:error instanceof Error?error.message:'Visual intelligence failed to initialize.'});}
};
