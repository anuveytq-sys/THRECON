# VIRTUAL ITG Local Spatial API

This optional local service provides the official Hugging Face Transformers Depth Anything V2 Small pipeline for Stage 2 and connects Stage 3 to the official VGGT model for multi-view camera estimation and shared world-space point maps. The browser Studio still has a browser-side inference fallback and single-photo depth-derived meshes, point clouds and Gaussian-style PLY export.

## Requirements

- Python 3.10 or newer.
- Prefer 16 GB RAM or more for VGGT-1B. An 8 GB CPU-only computer may not have enough free memory and inference can be very slow.
- A supported NVIDIA GPU is recommended for practical VGGT-1B inference. Apple Silicon may use PyTorch MPS where supported.
- At least two overlapping photographs of the same static scene are recommended for multi-view reconstruction.

## Install

Run these commands from the repository root.

### Windows PowerShell

~~~powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r local-engine/requirements.txt
python -m pip install torch torchvision
python -m pip install git+https://github.com/facebookresearch/vggt.git
python -m uvicorn app.main:app --app-dir local-engine --host 127.0.0.1 --port 8000
~~~

### macOS / Linux

~~~bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r local-engine/requirements.txt
python -m pip install torch torchvision
python -m pip install git+https://github.com/facebookresearch/vggt.git
python -m uvicorn app.main:app --app-dir local-engine --host 127.0.0.1 --port 8000
~~~

For the best PyTorch installation command for your operating system and GPU, use the official PyTorch installation selector before installing torch and torchvision.

The first depth request downloads `depth-anything/Depth-Anything-V2-Small-hf` weights and can take several minutes. The API request is allowed to remain open while the model downloads and initializes. The first multi-view reconstruction request downloads the facebook/VGGT-1B model weights. Keep the server bound to 127.0.0.1; do not expose this development API directly to the public internet.

## Endpoints

The local API loads the depth model on the first `/v1/vision/depth` request. The first request therefore downloads model weights and can take longer than later requests. The returned depth PNG is a normalized relative-depth visualization, not an absolute-distance map.

- GET http://127.0.0.1:8000/health
- POST http://127.0.0.1:8000/v1/vision/depth (multipart field `image`; returns a base64 PNG relative-depth map)
- GET http://127.0.0.1:8000/v1/reconstruction/capabilities
- POST http://127.0.0.1:8000/v1/reconstruction/vggt

The depth endpoint returns a normalized grayscale PNG, model/runtime provenance, and a 3×3 summary of relative depth scores. These scores compare regions within the same image and are not metres or calibrated physical distances. The POST reconstruction endpoint accepts one to eight image fields and a confidence_threshold between 0 and 1. It returns confidence-filtered points, colors, confidence and the number of registered views. The frontend uses those world-space points for its point-cloud and Gaussian-style preview.

## Hardware and accuracy notes

- Stage 2 first probes the optional local `/v1/vision/depth` endpoint with an eight-minute initialization allowance, then falls back to browser inference when the local service is unavailable. The browser uses the documented Transformers.js-compatible `onnx-community/depth-anything-v2-small` model, with the `onnx-community/depth-anything-v2-small-ONNX` repository as a fallback. The local endpoint lazily loads `depth-anything/Depth-Anything-V2-Small-hf` through the official Transformers depth-estimation pipeline.
- The browser worker uses the Apache-2.0 `onnx-community/depth-anything-v2-small` model and the documented `Xenova/detr-resnet-50-panoptic` segmentation model. Depth Anything V2 returns per-pixel relative-depth estimates; the Spatial Lab also summarizes mean intensity for each of nine image regions.
- The local Python service and browser model are separate inference runtimes; GitHub Pages serves only the frontend and cannot run Python inference.
- Multi-view fusion is only marked complete after this service returns actual VGGT world points.
- VGGT-1B is a large model. The service checks currently available system memory before CPU inference and returns a clear error rather than deliberately starting when less than 4 GB is available.
- A single photograph cannot determine absolute scale or reveal the exact geometry of hidden surfaces.
- The exported Gaussian-style PLY uses isotropic Gaussian initialisation derived from point samples. It is a starting representation, not a trained anisotropic splat reconstruction.
- Model and dataset licences must be reviewed before redistribution or commercial use.
