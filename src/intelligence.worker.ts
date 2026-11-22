import { env, pipeline, RawImage } from '@huggingface/transformers';

type Task = 'depth-estimation' | 'image-segmentation';
type WorkerRequest = { id: number; blob: Blob };
type SegmentPayload = { label: string; score: number; width: number; height: number; data: Uint8Array };
type WorkerResult = { depth?: { width: number; height: number; data: Uint8Array }; segments?: SegmentPayload[]; depthModel: string; segmentationModel: string; runtime: string; elapsedMs: number; warnings: string[] };
type PipelineFunction = (input: RawImage) => Promise<any>;

const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';
const SEGMENTATION_MODEL = 'Xenova/detr-resnet-50-panoptic';
let depthPipeline: PipelineFunction | null = null;
let segmentationPipeline: PipelineFunction | null = null;
let runtime = 'WASM / CPU';

const scope = self as unknown as DedicatedWorkerGlobalScope;
env.allowLocalModels = false;
env.useBrowserCache = true;

async function loadPipeline(task: Task, model: string, progress: (message: string) => void): Promise<PipelineFunction> {
  const useGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  if (useGpu) {
    try {
      progress('Preparing WebGPU model runtime…');
      return await pipeline(task, model, {
        device: 'webgpu',
        dtype: 'fp16',
        progress_callback: (event: { status?: string; file?: string; progress?: number }) => {
          if (event.status === 'progress') progress('Downloading model weights…');
        },
      }) as PipelineFunction;
    } catch {
      progress('WebGPU unavailable for this model; switching to WASM…');
    }
  }
  runtime = 'WASM / CPU';
  return await pipeline(task, model, {
    dtype: 'q8',
    progress_callback: (event: { status?: string }) => {
      if (event.status === 'progress') progress('Downloading model weights…');
    },
  }) as PipelineFunction;
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, blob } = event.data;
  const started = performance.now();
  const warnings: string[] = [];
  try {
    const image = await RawImage.fromBlob(blob);
    let depth: WorkerResult['depth'];
    let segments: SegmentPayload[] = [];
    try {
      if (!depthPipeline) depthPipeline = await loadPipeline('depth-estimation', DEPTH_MODEL, message => scope.postMessage({ id, type: 'progress', message }));
      const output = await depthPipeline(image);
      const raw = output.depth as InstanceType<typeof RawImage>;
      depth = { width: raw.width, height: raw.height, data: new Uint8Array(raw.data) };
    } catch (error) {
      warnings.push('Depth model unavailable: ' + (error instanceof Error ? error.message : 'unknown model error'));
    }
    try {
      if (!segmentationPipeline) segmentationPipeline = await loadPipeline('image-segmentation', SEGMENTATION_MODEL, message => scope.postMessage({ id, type: 'progress', message }));
      const output = await segmentationPipeline(image);
      segments = (output as Array<{ label: string; score: number; mask: InstanceType<typeof RawImage> }>)
        .slice(0, 10)
        .map(segment => ({
          label: segment.label,
          score: segment.score,
          width: segment.mask.width,
          height: segment.mask.height,
          data: new Uint8Array(segment.mask.data),
        }));
    } catch (error) {
      warnings.push('Segmentation model unavailable: ' + (error instanceof Error ? error.message : 'unknown model error'));
    }
    if (!depth && segments.length === 0) throw new Error(warnings.join(' '));
    const result: WorkerResult = {
      depth, segments, depthModel: DEPTH_MODEL, segmentationModel: SEGMENTATION_MODEL,
      runtime, elapsedMs: Math.round(performance.now() - started), warnings,
    };
    const transfer: Transferable[] = [];
    if (depth) transfer.push(depth.data.buffer);
    for (const segment of segments) transfer.push(segment.data.buffer);
    scope.postMessage({ id, type: 'complete', result }, transfer);
  } catch (error) {
    scope.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : 'Visual intelligence failed to initialize.' });
  }
};
