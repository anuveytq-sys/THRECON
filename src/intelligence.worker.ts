import { env, pipeline, RawImage } from '@huggingface/transformers';

type Task='depth-estimation'|'image-segmentation';
type WorkerRequest={id:number;blob:Blob};
type SegmentPayload={label:string;score:number;width:number;height:number;data:Uint8Array};
type WorkerResult={depth?:{width:number;height:number;data:Uint8Array};segments?:SegmentPayload[];depthModel:string;segmentationModel:string;runtime:string;elapsedMs:number;warnings:string[]};
type PipelineFunction=(input:RawImage)=>Promise<any>;
const DEPTH_MODELS=['onnx-community/depth-anything-v2-small-ONNX','onnx-community/depth-anything-v2-small'];
const DEPTH_MODEL=DEPTH_MODELS[0];
const SEGMENTATION_MODEL='Xenova/detr-resnet-50-panoptic';
let depthPipeline:PipelineFunction|null=null;
let segmentationPipeline:PipelineFunction|null=null;
let runtime='WASM / CPU';
let depthModelUsed=DEPTH_MODEL;
const scope=self as unknown as {onmessage:((event:MessageEvent<WorkerRequest>)=>void)|null;postMessage:(message:unknown,transfer?:Transferable[])=>void};
env.allowLocalModels=false;
env.useBrowserCache=true;
// Safari/iOS may not expose cross-origin-isolated WASM threads; single-thread WASM is slower but broadly compatible.
try{env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;}catch{}
const createPipeline=pipeline as unknown as (task:Task,model:string,options:Record<string,unknown>)=>Promise<PipelineFunction>;

async function loadPipeline(task:Task,model:string,progress:(message:string)=>void,device:'webgpu'|'wasm'):Promise<PipelineFunction>{
 const gpu=device==='webgpu';
 return createPipeline(task,model,{
  ...(gpu?{device:'webgpu',dtype:'fp16'}:{device:'wasm',dtype:'q8'}),
  progress_callback:(event:{status?:string;progress?:number;file?:string})=>{if(event.status==='progress_total'&&typeof event.progress==='number')progress('Downloading '+(task==='depth-estimation'?'depth':'segmentation')+' model · '+Math.round(event.progress)+'%');else if(event.status==='progress')progress('Downloading '+(event.file||'model')+'…');}
 });
}
async function runLocalBackendDepth(blob:Blob,progress:(message:string)=>void):Promise<{width:number;height:number;data:Uint8Array}|null>{
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),1500);
 try{
  progress('Checking optional local VIRTUAL ITG vision backend…');
  const form=new FormData();form.append('image',blob,'source.jpg');
  const response=await fetch('http://127.0.0.1:8000/v1/vision/depth',{method:'POST',body:form,signal:controller.signal});
  if(!response.ok)throw new Error('Local vision backend returned HTTP '+response.status);
  const payload=await response.json() as {depth_png_base64?:string;model?:string};
  if(!payload.depth_png_base64)throw new Error('Local vision backend returned no depth image.');
  const binary=atob(payload.depth_png_base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const raw=await RawImage.fromBlob(new Blob([bytes],{type:'image/png'}));
  progress('Depth estimated by local VIRTUAL ITG backend.');
  return {width:raw.width,height:raw.height,data:new Uint8Array(raw.data)};
 }catch(error){
  if(error instanceof Error&&error.name!=='AbortError')progress('Local backend unavailable; switching to browser inference…');
  return null;
 }finally{clearTimeout(timeout);}
}
async function runDepth(image:RawImage,blob:Blob,progress:(message:string)=>void):Promise<{width:number;height:number;data:Uint8Array}>{
 const local=await runLocalBackendDepth(blob,progress);if(local){runtime='Local Python API';depthModelUsed='depth-anything/Depth-Anything-V2-Small-hf';return local;}
 const isAppleMobile=typeof navigator!=='undefined'&&/iPhone|iPad|iPod/i.test(navigator.userAgent);
 const hasGpu=!isAppleMobile&&typeof navigator!=='undefined'&&Boolean((navigator as unknown as {gpu?:unknown}).gpu);
 const loadErrors:string[]=[];
 if(!depthPipeline&&hasGpu){try{progress('Preparing WebGPU depth model…');depthPipeline=await loadPipeline('depth-estimation',DEPTH_MODEL,progress,'webgpu');runtime='WebGPU';depthModelUsed=DEPTH_MODEL;}catch(error){loadErrors.push('WebGPU: '+(error instanceof Error?error.message:String(error)));depthPipeline=null;}}
 if(!depthPipeline){
  progress('Loading Depth Anything V2 Small for WASM / CPU…');
  for(const model of DEPTH_MODELS){
   try{depthPipeline=await loadPipeline('depth-estimation',model,progress,'wasm');runtime='WASM / CPU';depthModelUsed=model;break;}
   catch(error){loadErrors.push(model+': '+(error instanceof Error?error.message:String(error)));depthPipeline=null;}
  }
 }
 if(!depthPipeline)throw new Error('Depth Anything V2 could not initialize. '+loadErrors.join(' | '));
 try{
  progress('Estimating relative depth…');
  const output=await depthPipeline(image);
  const raw=output.depth as InstanceType<typeof RawImage>;
  if(!raw?.data||!raw.width||!raw.height)throw new Error('Depth model returned an empty map.');
  return {width:raw.width,height:raw.height,data:new Uint8Array(raw.data)};
 }catch(error){
  if(runtime!=='WebGPU')throw error;
  progress('WebGPU inference failed; retrying on WASM / CPU…');
  depthPipeline=null;runtime='WASM / CPU';
  for(const model of DEPTH_MODELS){
   try{depthPipeline=await loadPipeline('depth-estimation',model,progress,'wasm');depthModelUsed=model;break;}
   catch(loadError){loadErrors.push(model+': '+(loadError instanceof Error?loadError.message:String(loadError)));}
  }
  if(!depthPipeline)throw new Error('WebGPU failed and WASM fallback could not load. '+loadErrors.join(' | '));
  const output=await depthPipeline(image);
  const raw=output.depth as InstanceType<typeof RawImage>;
  if(!raw?.data||!raw.width||!raw.height)throw new Error('Depth model returned an empty map after CPU fallback.');
  return {width:raw.width,height:raw.height,data:new Uint8Array(raw.data)};
 }
}
async function runSegmentation(image:RawImage,progress:(message:string)=>void):Promise<SegmentPayload[]>{
 const hasGpu=typeof navigator!=='undefined'&&Boolean((navigator as unknown as {gpu?:unknown}).gpu);
 if(!segmentationPipeline&&hasGpu){try{progress('Preparing WebGPU segmentation model…');segmentationPipeline=await loadPipeline('image-segmentation',SEGMENTATION_MODEL,progress,'webgpu');}catch{segmentationPipeline=null;}}
 if(!segmentationPipeline){progress('Loading segmentation model…');segmentationPipeline=await loadPipeline('image-segmentation',SEGMENTATION_MODEL,progress,'wasm');}
 try{
  progress('Finding object regions…');
  const output=await segmentationPipeline(image);
  return (output as Array<{label:string;score:number;mask:InstanceType<typeof RawImage>}>).slice(0,10).map(segment=>({
   label:segment.label,score:segment.score,width:segment.mask.width,height:segment.mask.height,data:new Uint8Array(segment.mask.data)
  }));
 }catch(error){
  if(!hasGpu)throw error;
  progress('Segmentation GPU inference failed; retrying on WASM / CPU…');
  segmentationPipeline=null;
  segmentationPipeline=await loadPipeline('image-segmentation',SEGMENTATION_MODEL,progress,'wasm');
  const output=await segmentationPipeline(image);
  return (output as Array<{label:string;score:number;mask:InstanceType<typeof RawImage>}>).slice(0,10).map(segment=>({
   label:segment.label,score:segment.score,width:segment.mask.width,height:segment.mask.height,data:new Uint8Array(segment.mask.data)
  }));
 }
}
scope.onmessage=async(event:MessageEvent<WorkerRequest>)=>{
 const {id,blob}=event.data,started=performance.now(),warnings:string[]=[];
 const progress=(message:string)=>scope.postMessage({id,type:'progress',message});
 try{
  progress('Decoding source photograph…');
  const image=await RawImage.fromBlob(blob);
  let depth:WorkerResult['depth'];
  let segments:SegmentPayload[]=[];
  try{
   depth=await runDepth(image,blob,progress);
   const elapsedMs=Math.round(performance.now()-started);
   const earlyDepth={...depth,data:new Uint8Array(depth.data)};
   scope.postMessage({id,type:'depth',depth:earlyDepth,depthModel:depthModelUsed,runtime,elapsedMs},[earlyDepth.data.buffer as ArrayBuffer]);
  }catch(error){warnings.push('Depth model unavailable: '+(error instanceof Error?error.message:'unknown model error'));}
  try{
   segments=await runSegmentation(image,progress);
   const earlySegments=segments.map(segment=>({...segment,data:new Uint8Array(segment.data)}));
   const transfers=earlySegments.map(segment=>segment.data.buffer as ArrayBuffer);
   scope.postMessage({id,type:'segments',segments:earlySegments},transfers);
  }catch(error){warnings.push('Segmentation model unavailable: '+(error instanceof Error?error.message:'unknown model error'));}
  if(!depth&&segments.length===0)throw new Error(warnings.join(' '));
  const result:WorkerResult={depth,segments,depthModel:depthModelUsed,segmentationModel:SEGMENTATION_MODEL,runtime,elapsedMs:Math.round(performance.now()-started),warnings};
  const transfer:Transferable[]=[];
  if(depth)transfer.push(depth.data.buffer as ArrayBuffer);
  for(const segment of segments)transfer.push(segment.data.buffer as ArrayBuffer);
  scope.postMessage({id,type:'complete',result},transfer);
 }catch(error){scope.postMessage({id,type:'error',message:error instanceof Error?error.message:'Visual intelligence failed to initialize.'});}
};
