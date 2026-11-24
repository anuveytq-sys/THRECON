# Stage 4 — Generative World Completion

Stage 4 adds an explicitly provenance-aware world-completion workspace.

## Browser-side completion baseline

Open **World Completion · Stage 04** after Stage 2 analysis. It consumes the existing Depth Anything relative-depth map and DETR panoptic masks to:

- isolate up to eight high-scoring semantic object regions;
- estimate each region's 2D bounds, mean relative depth and mask confidence;
- create separate editable 3D proxy volumes using category-aware primitive priors;
- show observed photo evidence separately from inferred backside volume;
- compare conservative, balanced and expanded geometry hypotheses;
- display per-object and 3×3 confidence summaries;
- export a GLB scene and a JSON SceneIR/provenance manifest.

This is a useful geometry-completion baseline, **not a pretrained generative 3D foundation model**. It does not claim that a chair, person or room's hidden geometry has been recovered exactly. The shape priors are explicit alternatives and should be replaced or refined by trained models and multi-view evidence.

## Synthetic training data

The Blender generator creates paired complete and occluded indoor scenes, RGB renders, normalized depth passes, object-index passes and a saved ground-truth .blend scene.

From the repository root:

~~~bash
blender -b --python training/synthetic_generator/generate_scenes.py -- --output ./synthetic-data --count 100 --seed 7
~~~

The generated dataset is intentionally not committed to Git because rendered datasets and Blender files can be large.

## Train a depth-completion model

Install PyTorch in the Python environment used for the local engine, generate at least two scenes, then run:

~~~bash
python training/world_completion/train.py --data ./synthetic-data --epochs 20 --batch-size 4 --output ./local-engine/models/world_completion.pt
~~~

The compact convolutional model accepts RGB, occluded depth and an occlusion mask, and predicts a completed depth map. The training script prints training and validation L1 error and stores its architecture and sample counts in the checkpoint.

## Local inference endpoint

After training, start the local FastAPI service as documented in local-engine/README.md.

- GET /health reports whether the Stage 4 checkpoint exists and is loaded.
- GET /v1/reconstruction/capabilities reports Stage 4 availability.
- POST /v1/world-completion/infer accepts multipart image, depth and mask files and returns a completed depth PNG and confidence PNG as base64.

Without a trained checkpoint the endpoint returns HTTP 503 with setup instructions. It does not silently substitute a fake AI result.

## Confidence and limitations

- Source RGB and segmentation are observed evidence.
- Depth is estimated relative geometry.
- Generated object backs and completed depth are inferred.
- The baseline confidence is a heuristic based on segmentation score, mask occupancy and depth consistency; it is not calibrated probability.
- The local training model is only as general as its synthetic training data. Evaluate it on held-out real and synthetic scenes before relying on it.
- One photo cannot uniquely identify occluded surfaces. Multiple overlapping photos and a capable VGGT runtime improve geometric constraints.