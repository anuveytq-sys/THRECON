import { env, pipeline, RawImage } from '@huggingface/transformers';

type Task='depth-estimation'|'image-segmentation';
type WorkerRequest={id:number;blob:Blob};
type SegmentPayload={label:string;score:number;width:number;height:number;data:Uint8Array};
type WorkerResult={depth?:{width:number;height:number;data:Uint8Array};segments?:SegmentPayload[];depthModel:string;segmentationModel:string;runtime:string;elapsedMs:number;warnings:string[]};
type PipelineFunction=(input:RawImage)=>Promise<any>;
const DEPTH_MODEL='onnx-community/depth-anything-v2-small-ONNX';
const SEGMENTATION_MODEL='Xenova/detr-resnet-50-panoptic';
let depthPipeline:PipelineFunction|null=null;
let segmentationPipeline:PipelineFunction|null=null;
let runtime='WASM / CPU';
const scope=self as unknown as {onmessage:((event:MessageEvent<WorkerRequest>)=>void)|null;postMessage:(message:unknown,transfer?:Transferable[])=>void};
env.allowLocalModels=false;
env.useBrowserCache=true;
const createPipeline=pipeline as unknown as (task:Task,model:string,options:Record<string,unknown>)=>Promise<PipelineFunction>;

async function loadPipeline(task:Task,model:string,progress:(message:string)=>void,device:'webgpu'|'wasm'):Promise<PipelineFunction>{
 const gpu=device==='webgpu';
 return createPipeline(task,model,{
  ...(gpu?{device:'webgpu',dtype:'fp16'}:{dtype:'q8'}),
  progress_callback:(event:{status?:string})=>{if(event.status==='progress')progress('Downloading '+(task==='depth-estimation'?'depth':'segmentation')+' model weights…');}
 });
}
async function runDepth(image:RawImage,progress:(message:string)=>void):Promise<{width:number;height:number;data:Uint8Array}>{
 const isAppleMobile=typeof navigator!=='undefined'&&/iPhone|iPad|iPod/i.test(navigator.userAgent);
 const hasGpu=!isAppleMobile&&typeof navigator!=='undefined'&&Boolean((navigator as unknown as {gpu?:unknown}).gpu);
 if(!depthPipeline&&hasGpu){try{progress('Preparing WebGPU depth model…');depthPipeline=await loadPipeline('depth-estimation',DEPTH_MODEL,progress,'webgpu');runtime='WebGPU';}catch{depthPipeline=null;}}
 if(!depthPipeline){progress('Loading depth model for WASM / CPU…');depthPipeline=await loadPipeline('depth-estimation',DEPTH_MODEL,progress,'wasm');runtime='WASM / CPU';}
 try{
  progress('Estimating relative depth…');
  const output=await depthPipeline(image);
  const raw=output.depth as InstanceType<typeof RawImage>;
  if(!raw?.data||!raw.width||!raw.height)throw new Error('Depth model returned an empty map.');
  return {width:raw.width,height:raw.height,data:new Uint8Array(raw.data)};
 }catch(error){
  if(runtime!=='WebGPU')throw error;
  progress('WebGPU inference failed; retrying depth on WASM / CPU…');
  depthPipeline=null;runtime='WASM / CPU';
  depthPipeline=await loadPipeline('depth-estimation',DEPTH_MODEL,progress,'wasm');
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
   depth=await runDepth(image,progress);
   const elapsedMs=Math.round(performance.now()-started);
   const earlyDepth={...depth,data:new Uint8Array(depth.data)};
   scope.postMessage({id,type:'depth',depth:earlyDepth,depthModel:DEPTH_MODEL,runtime,elapsedMs},[earlyDepth.data.buffer as ArrayBuffer]);
  }catch(error){warnings.push('Depth model unavailable: '+(error instanceof Error?error.message:'unknown model error'));}
  try{
   segments=await runSegmentation(image,progress);
   const earlySegments=segments.map(segment=>({...segment,data:new Uint8Array(segment.data)}));
   const transfers=earlySegments.map(segment=>segment.data.buffer as ArrayBuffer);
   scope.postMessage({id,type:'segments',segments:earlySegments},transfers);
  }catch(error){warnings.push('Segmentation model unavailable: '+(error instanceof Error?error.message:'unknown model error'));}
  if(!depth&&segments.length===0)throw new Error(warnings.join(' '));
  const result:WorkerResult={depth,segments,depthModel:DEPTH_MODEL,segmentationModel:SEGMENTATION_MODEL,runtime,elapsedMs:Math.round(performance.now()-started),warnings};
  const transfer:Transferable[]=[];
  if(depth)transfer.push(depth.data.buffer as ArrayBuffer);
  for(const segment of segments)transfer.push(segment.data.buffer as ArrayBuffer);
  scope.postMessage({id,type:'complete',result},transfer);
 }catch(error){scope.postMessage({id,type:'error',message:error instanceof Error?error.message:'Visual intelligence failed to initialize.'});}
};
