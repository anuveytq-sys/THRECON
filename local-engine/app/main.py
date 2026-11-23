from __future__ import annotations

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

try:
    from vggt.models.vggt import VGGT
    from vggt.utils.load_fn import load_and_preprocess_images
except Exception:
    VGGT = None
    load_and_preprocess_images = None

APP_VERSION = "0.3.0"
MAX_IMAGES = 8
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_RETURNED_POINTS = 30000
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


@app.get("/health")
def health():
    installed = VGGT is not None
    return {
        "service": "virtual-itg-local-spatial-api",
        "version": APP_VERSION,
        "status": "online",
        "vggt_installed": installed,
        "model_loaded": load_model.cache_info().currsize > 0,
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
        "photo_to_depth": "browser-stage-2",
        "single_photo_mesh": "browser-stage-3",
        "point_cloud": "browser-stage-3",
        "gaussian_splat_ply": "browser-stage-3-approximation",
        "multi_view_vggt": VGGT is not None,
        "depth_fusion": "VGGT shared world-space point maps when the local model is available",
        "max_images": MAX_IMAGES,
    }


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
