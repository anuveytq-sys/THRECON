from __future__ import annotations

import base64
import io
import tempfile
from functools import lru_cache
from pathlib import Path

import numpy as np
import psutil
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, Field

from .spatial import SpatialAnalysisRequest, analyze_relationships

from .world_completion import load_completion_checkpoint

try:
    from transformers import pipeline as hf_pipeline
except Exception as exc:
    hf_pipeline = None
    TRANSFORMERS_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"
else:
    TRANSFORMERS_IMPORT_ERROR = None

try:
    from vggt.models.vggt import VGGT
    from vggt.utils.load_fn import load_and_preprocess_images
except Exception:
    VGGT = None
    load_and_preprocess_images = None

APP_VERSION = "0.7.0"
DEPTH_MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
MAX_IMAGES = 8
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_RETURNED_POINTS = 30000
MAX_DEPTH_IMAGE_BYTES = 15 * 1024 * 1024
WORLD_COMPLETION_CHECKPOINT = Path(__file__).resolve().parents[1] / "models" / "world_completion.pt"
app = FastAPI(title="VIRTUAL ITG Local Spatial API", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://anuveytq-sys.github.io"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def choose_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


@lru_cache(maxsize=1)
def load_model():
    if VGGT is None:
        raise RuntimeError("VGGT is not installed. Follow local-engine/README.md.")
    device = choose_device()
    if device == "cpu" and psutil.virtual_memory().available < 4 * 1024**3:
        raise RuntimeError(
            "VGGT CPU inference needs at least 4 GB of currently available RAM. "
            "Close memory-heavy applications or use a computer with more memory. "
            "The lightweight single-photo browser reconstruction remains available."
        )
    model = VGGT.from_pretrained("facebook/VGGT-1B")
    model.eval()
    model.to(device)
    return model, device


@lru_cache(maxsize=1)
def load_depth_model():
    if hf_pipeline is None:
        raise RuntimeError("Python transformers is not installed. Install local-engine/requirements.txt.")
    device = choose_device()
    pipeline_device = 0 if device == "cuda" else (torch.device("mps") if device == "mps" else -1)
    model = hf_pipeline("depth-estimation", model=DEPTH_MODEL, device=pipeline_device)
    return model, device


@lru_cache(maxsize=1)
def load_world_completion_model():
    return load_completion_checkpoint(WORLD_COMPLETION_CHECKPOINT, choose_device())


@app.get("/health")
def health():
    installed = VGGT is not None
    return {
        "service": "virtual-itg-local-spatial-api",
        "version": APP_VERSION,
        "status": "online",
        "vggt_installed": installed,
        "vggt_model_loaded": load_model.cache_info().currsize > 0,
        "depth_backend_installed": hf_pipeline is not None,
        "depth_model_loaded": load_depth_model.cache_info().currsize > 0,
        "world_completion_checkpoint": WORLD_COMPLETION_CHECKPOINT.is_file(),
        "world_completion_model_loaded": load_world_completion_model.cache_info().currsize > 0,
        "depth_backend_error": TRANSFORMERS_IMPORT_ERROR,
        "device": choose_device(),
        "message": (
            "VGGT package available; model weights load on the first reconstruction request."
            if installed
            else "Local API is online, but VGGT is not installed. Follow local-engine/README.md."
        ),
        "limitations": [
            "VGGT-1B is a large model and may be slow or unavailable on 8 GB CPU-only computers.",
            "Monocular scale is not an absolute physical measurement without calibration.",
        ],
    }


@app.get("/v1/reconstruction/capabilities")
def capabilities():
    return {
        "api_version": "v1",
        "photo_to_depth": "local-python-depth-anything-v2-or-browser-stage-2",
        "single_photo_mesh": "browser-stage-3",
        "point_cloud": "browser-stage-3",
        "gaussian_splat_ply": "browser-stage-3-approximation",
        "multi_view_vggt": VGGT is not None,
        "depth_anything_v2_backend": hf_pipeline is not None,
        "stage4_world_completion_checkpoint": WORLD_COMPLETION_CHECKPOINT.is_file(),
        "stage5_spatial_relationships": True,
        "stage5_language_commands": "browser-local-deterministic-intent-parser",
        "stage4_world_completion": "trained-model-inference-when-checkpoint-installed; browser-procedural-hypotheses-otherwise",
        "stage5_spatial_relationships": "POST /v1/spatial/relationships",
        "stage5_scene_commands": "browser-local-deterministic-intent-parser; no hosted LLM required",
        "depth_backend_error": TRANSFORMERS_IMPORT_ERROR,
        "depth_model": DEPTH_MODEL,
        "depth_fusion": "VGGT shared world-space point maps when the local model is available",
        "max_images": MAX_IMAGES,
    }



@app.post("/v1/vision/depth")
async def estimate_depth(image: UploadFile = File(...)):
    raw = await image.read()
    if not raw or len(raw) > MAX_DEPTH_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is empty or exceeds 15 MB.")
    try:
        source = Image.open(io.BytesIO(raw)).convert("RGB")
        source.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        model, device = load_depth_model()
        prediction = model(source)
        predicted = prediction.get("predicted_depth")
        if predicted is not None:
            depth_array = predicted.detach().float().cpu().numpy().squeeze().astype(np.float32)
        else:
            depth_image = prediction.get("depth")
            if depth_image is None:
                raise RuntimeError("Depth Anything V2 returned neither predicted_depth nor depth.")
            depth_array = np.asarray(depth_image.convert("F"), dtype=np.float32)
        if depth_array.ndim != 2 or not depth_array.size:
            raise RuntimeError(f"Depth model returned an invalid array shape: {depth_array.shape}.")
        finite = np.isfinite(depth_array)
        if not finite.any():
            raise RuntimeError("Depth Anything V2 returned no finite depth values.")
        low = float(depth_array[finite].min())
        high = float(depth_array[finite].max())
        span = max(high - low, 1e-6)
        normalized = np.zeros(depth_array.shape, dtype=np.uint8)
        normalized[finite] = np.clip((depth_array[finite] - low) / span * 255.0, 0, 255).astype(np.uint8)
        regions = []
        height, width = normalized.shape
        for row in range(3):
            for col in range(3):
                tile = normalized[
                    row * height // 3 : max(row * height // 3 + 1, (row + 1) * height // 3),
                    col * width // 3 : max(col * width // 3 + 1, (col + 1) * width // 3),
                ]
                regions.append({
                    "region": row * 3 + col + 1,
                    "mean_score": round(float(tile.mean()), 2),
                    "min_score": int(tile.min()),
                    "max_score": int(tile.max()),
                })
        output = io.BytesIO()
        Image.fromarray(normalized).save(output, format="PNG", optimize=True)
        return {
            "model": DEPTH_MODEL,
            "runtime": "local-python-" + device,
            "width": int(width),
            "height": int(height),
            "depth_min": low,
            "depth_max": high,
            "regions": regions,
            "depth_png_base64": base64.b64encode(output.getvalue()).decode("ascii"),
            "interpretation": "normalized relative depth; values are not metric distances",
        }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Depth estimation failed: {type(exc).__name__}: {exc}") from exc



@app.post("/v1/spatial/relationships")
def spatial_relationships(payload: SpatialAnalysisRequest):
    """Return deterministic image-space relations for semantic objects from Stage 2 masks."""
    ids = [obj.id for obj in payload.objects]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="Object IDs must be unique.")
    for obj in payload.objects:
        x, y, width, height = obj.bbox
        if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1.001 or y + height > 1.001:
            raise HTTPException(status_code=422, detail=f"Object {obj.id} has an invalid normalized bounding box.")
    relationships = analyze_relationships(payload.objects)
    return {
        "schema": "virtual-itg-spatial-graph/1",
        "node_count": len(payload.objects),
        "edge_count": len(relationships),
        "objects": [obj.model_dump() for obj in payload.objects],
        "relationships": [edge.model_dump() for edge in relationships],
        "interpretation": "Image-plane relations and normalized depth-response ordering; not metric or full 3D ground truth.",
        "warnings": [
            "Semantic labels and bounds originate from the supplied detector/segmentation output.",
            "Depth response polarity is intentionally not converted into near/far without model-specific calibration.",
            "Occluded objects and relationships absent from the image cannot be recovered by this endpoint.",
        ],
    }


@app.post("/v1/world-completion/infer")
async def infer_world_completion(
    image: UploadFile = File(...),
    depth: UploadFile = File(...),
    mask: UploadFile = File(...),
):
    raw_image, raw_depth, raw_mask = await image.read(), await depth.read(), await mask.read()
    if not raw_image or not raw_depth or not raw_mask:
        raise HTTPException(status_code=400, detail="image, depth and mask files are all required.")
    if max(len(raw_image), len(raw_depth), len(raw_mask)) > MAX_DEPTH_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="An input file exceeds 15 MB.")
    try:
        source = Image.open(io.BytesIO(raw_image)).convert("RGB")
        depth_image = Image.open(io.BytesIO(raw_depth)).convert("L")
        mask_image = Image.open(io.BytesIO(raw_mask)).convert("L")
        if depth_image.size != mask_image.size:
            raise HTTPException(status_code=400, detail="Depth and mask dimensions must match.")
        original_size = depth_image.size
        size = 256
        rgb = np.asarray(source.resize((size, size), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
        depth_array = np.asarray(depth_image.resize((size, size), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
        mask_array = (np.asarray(mask_image.resize((size, size), Image.Resampling.NEAREST), dtype=np.uint8) > 127).astype(np.float32)
        inputs = np.concatenate([rgb, depth_array[..., None], mask_array[..., None]], axis=2)
        tensor = torch.from_numpy(inputs.transpose(2, 0, 1)).unsqueeze(0).to(choose_device())
        model, metadata = load_world_completion_model()
        with torch.inference_mode():
            prediction = model(tensor)[0, 0].detach().float().cpu().numpy()
        completed = prediction * mask_array + depth_array * (1.0 - mask_array)
        completed_image = Image.fromarray(np.clip(completed * 255.0, 0, 255).astype(np.uint8)).resize(original_size, Image.Resampling.BILINEAR)
        confidence = np.where(mask_array > 0, 0.42, 0.98).astype(np.float32)
        confidence_image = Image.fromarray(np.clip(confidence * 255.0, 0, 255).astype(np.uint8)).resize(original_size, Image.Resampling.NEAREST)
        output, confidence_output = io.BytesIO(), io.BytesIO()
        completed_image.save(output, format="PNG", optimize=True)
        confidence_image.save(confidence_output, format="PNG", optimize=True)
        return {
            "model": metadata.get("architecture"),
            "training_samples": metadata.get("training_samples"),
            "completed_depth_png_base64": base64.b64encode(output.getvalue()).decode("ascii"),
            "confidence_png_base64": base64.b64encode(confidence_output.getvalue()).decode("ascii"),
            "width": original_size[0],
            "height": original_size[1],
            "interpretation": "synthetic-data-trained depth completion; masked pixels remain inferred, not observed geometry",
            "warnings": ["Synthetic training may not generalize to real photographs.", "Depth completion does not uniquely recover hidden object shape."]
        }
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"World completion failed: {type(exc).__name__}: {exc}") from exc


@app.post("/v1/reconstruction/vggt")
async def reconstruct_vggt(
    images: list[UploadFile] = File(...),
    confidence_threshold: float = Form(0.35),
):
    if VGGT is None or load_and_preprocess_images is None:
        raise HTTPException(status_code=503, detail="VGGT is not installed. Follow local-engine/README.md.")
    if not 1 <= len(images) <= MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"Upload between 1 and {MAX_IMAGES} photographs.")
    if not 0 <= confidence_threshold <= 1:
        raise HTTPException(status_code=400, detail="confidence_threshold must be between 0 and 1.")

    try:
        with tempfile.TemporaryDirectory(prefix="virtual-itg-") as temporary:
            paths: list[str] = []
            for index, upload in enumerate(images):
                raw = await upload.read()
                if not raw or len(raw) > MAX_IMAGE_BYTES:
                    raise HTTPException(status_code=413, detail=f"{upload.filename or 'Image'} is empty or exceeds 15 MB.")
                try:
                    image = Image.open(io.BytesIO(raw)).convert("RGB")
                    image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                    target = Path(temporary) / f"view-{index:02d}.jpg"
                    image.save(target, format="JPEG", quality=90)
                    paths.append(str(target))
                except Exception as exc:
                    raise HTTPException(status_code=415, detail=f"Could not decode {upload.filename}: {exc}") from exc

            model, device = load_model()
            tensors = load_and_preprocess_images(paths).to(device)
            with torch.inference_mode():
                if device == "cuda":
                    with torch.autocast(device_type="cuda", dtype=torch.float16):
                        predictions = model(tensors)
                else:
                    predictions = model(tensors)

            points = predictions.get("world_points")
            confidence = predictions.get("world_points_conf")
            source_images = predictions.get("images")
            if points is None or confidence is None or source_images is None:
                raise RuntimeError("VGGT did not return world points, confidence and source images.")

            point_array = points[0].detach().float().cpu().numpy()
            confidence_array = confidence[0].detach().float().cpu().numpy()
            image_array = source_images[0].detach().float().cpu().numpy()
            if image_array.ndim == 4 and image_array.shape[1] == 3:
                image_array = np.transpose(image_array, (0, 2, 3, 1))

            all_points: list[np.ndarray] = []
            all_colors: list[np.ndarray] = []
            all_confidence: list[np.ndarray] = []
            stride = max(1, int(np.ceil(np.sqrt(
                (point_array.shape[0] * point_array.shape[1] * point_array.shape[2]) / MAX_RETURNED_POINTS
            ))))
            for view_index in range(point_array.shape[0]):
                view_points = point_array[view_index, ::stride, ::stride, :]
                view_conf = confidence_array[view_index, ::stride, ::stride]
                view_rgb = image_array[view_index, ::stride, ::stride, :]
                mask = np.isfinite(view_conf) & (view_conf >= confidence_threshold)
                mask &= np.isfinite(view_points).all(axis=-1)
                if not np.any(mask):
                    continue
                all_points.append(view_points[mask])
                all_confidence.append(view_conf[mask])
                all_colors.append(np.clip(view_rgb[mask] * 255.0, 0, 255).astype(np.uint8))

            if not all_points:
                raise RuntimeError("No points passed the confidence filter. Lower the confidence threshold and retry.")

            fused_points = np.concatenate(all_points, axis=0)
            fused_colors = np.concatenate(all_colors, axis=0)
            fused_conf = np.concatenate(all_confidence, axis=0)
            if len(fused_points) > MAX_RETURNED_POINTS:
                select = np.linspace(0, len(fused_points) - 1, MAX_RETURNED_POINTS, dtype=np.int64)
                fused_points = fused_points[select]
                fused_colors = fused_colors[select]
                fused_conf = fused_conf[select]

            return {
                "engine": "facebookresearch/VGGT-1B",
                "coordinate_system": "VGGT shared predicted world coordinates",
                "views": len(paths),
                "points": fused_points.astype(np.float32).tolist(),
                "colors": fused_colors.astype(np.uint8).tolist(),
                "confidence": fused_conf.astype(np.float32).tolist(),
                "point_count": int(len(fused_points)),
                "confidence_threshold": confidence_threshold,
                "warnings": [
                    "World-space geometry and camera alignment are model estimates, not a surveyed metric scan.",
                    "Single-view input cannot reveal unseen surfaces; use overlapping views for stronger reconstruction.",
                ],
            }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"VGGT reconstruction failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
