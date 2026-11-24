# VIRTUAL ITG — Spatial Intelligence AI

> **A multimodal spatial intelligence platform that turns photographs and videos into measurable, editable, explorable 3D worlds.**

VIRTUAL ITG is designed as an independent AI research and engineering platform with specialized vision, depth, geometry, spatial reasoning, world-completion and language components. Its final goal is to provide **its own AI API service** that developers can integrate into other applications, while also allowing the same AI to run locally on a computer and power a browser-based experience hosted on GitHub Pages.

The central idea is simple:

**Give the AI a photograph or video of a real place, and it reconstructs that place into an editable, measurable, explorable 3D world. When information is missing, it intelligently completes the world while identifying which parts are inferred.**

This is an ambitious long-term research and engineering project. A useful first version is feasible; highly accurate reconstruction, reliable hidden-geometry inference and general-purpose physical simulation will require substantial research, datasets, GPU compute and iterative training.

---

## 1. Overall system architecture

VIRTUAL ITG is divided into specialized intelligence systems that communicate through a shared spatial representation rather than producing disconnected outputs.

![Modern architectural interior reference](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=85)

~~~mermaid
flowchart TD
    A["Multimodal input<br/>Single images · Multiple photos · Video · Natural language"]
    B["01 — Perception Intelligence<br/>Image/video understanding · Segmentation · Camera estimation · Depth"]
    C["02 — Spatial Intelligence<br/>Metric geometry · Object relationships · Occlusion · Scale · Confidence"]
    D["03 — VIRTUAL ITG Spatial Core<br/>Unified scene representation · Geometry fusion · World reasoning"]
    E["04A — Reconstruction<br/>Meshes · Textures · Gaussian splats · Editable objects"]
    F["04B — World Completion<br/>Hidden surfaces · Missing geometry · Generative completion"]
    G["05A — 3D Asset Studio<br/>Editable and exportable models"]
    H["05B — World Simulator<br/>Character · Physics · Exploration"]
    I["06 — VIRTUAL ITG Studio<br/>Reconstruction · Editing · Measurement · Exploration"]
    A --> B --> C --> D
    D --> E
    D --> F
    E --> G
    F --> G
    G --> I
    H --> I
    D --> H
~~~

The most important architectural decision is the **VIRTUAL ITG Spatial Core**. Every model should communicate through a shared scene representation instead of generating unrelated outputs.

## 2. The actual AI model architecture

Build a modular architecture with eight specialized intelligence modules and one coordinating system. Models can be independently trained, evaluated and replaced without breaking the entire platform.

### Model registry

| Module | Model responsibility | Initial foundation |
|---|---|---|
| VIRTUAL ITG Vision | Image understanding | DINOv2 / vision transformer |
| VIRTUAL ITG Depth | Depth and distance estimation | Depth Anything V2 |
| VIRTUAL ITG Geometry | Camera poses and 3D structure | VGGT |
| VIRTUAL ITG Object | Object and surface segmentation | SAM 2 + detection model |
| VIRTUAL ITG World | Scene completion and hidden geometry | 3D generative research models |
| VIRTUAL ITG Spatial | Object relationships and spatial reasoning | Custom spatial transformer |
| VIRTUAL ITG Language | Natural-language command interpretation | Fine-tuned open-weight language model |
| VIRTUAL ITG Physics | Physical-property estimation | Custom vision-to-property model |
| VIRTUAL ITG Orchestrator | Coordinates modules and tools | Custom intent and workflow engine |

These are proposed model roles, not nine models that must all be trained from scratch.

### Recommended foundation models

#### VGGT — Visual Geometry Grounded Transformer

Use for multi-view geometry, camera parameters, point maps and tracking. Its research demonstrates reconstruction from one, several or hundreds of views.

- Official repository: https://github.com/facebookresearch/vggt

#### Depth Anything V2

Use for initial depth maps and metric-depth experiments. It offers different model sizes and metric-depth variants.

- Official repository: https://github.com/DepthAnything/Depth-Anything-V2

#### SAM 2 — Segment Anything Model 2

Use to segment individual objects and track them across video frames.

- Official repository: https://github.com/facebookresearch/sam2

#### Nerfstudio

Use for reconstruction experiments, Gaussian splatting and mesh extraction.

- Official repository: https://github.com/nerfstudio-project/nerfstudio

**Important design choice:** VGGT and depth estimation should not be treated as interchangeable. VGGT supplies multi-view geometric relationships, while a monocular depth model supplies depth predictions for individual images. Their outputs should be fused and checked for consistency.

### The VIRTUAL ITG Spatial Core

This is the most important custom engineering component.

Create a unified data structure called **VIRTUAL ITG SceneIR (Scene Intermediate Representation)**. Every module reads and writes this representation.

Example:

~~~json
{
  "scene_id": "scene_001",
  "coordinate_system": "right_handed",
  "units": "meters",
  "objects": [
    {
      "id": "object_001",
      "class": "table",
      "geometry": "mesh_001",
      "transform": {
        "position": [1.2, 0.0, 2.4],
        "rotation": [0.0, 0.0, 0.0],
        "scale": [1.0, 1.0, 1.0]
      },
      "evidence": {
        "classification": "observed",
        "confidence": 0.96,
        "source_frames": [0, 12, 24]
      },
      "physics": {
        "rigid_body": true,
        "mass_kg": null,
        "mass_source": "unknown"
      }
    }
  ],
  "geometry": [],
  "camera_poses": [],
  "spatial_relationships": [],
  "reconstruction_metadata": {}
}
~~~

This is an illustrative schema; the real implementation should include geometry references, coordinate transforms, material data, visibility, provenance and confidence maps.

Three evidence classifications must be mandatory:

| Classification | Meaning |
|---|---|
| Observed | Supported directly by input |
| Estimated | Derived from geometric calculations |
| Inferred | Generated because evidence is missing |

This prevents generative AI from accidentally presenting imagined architecture as measured reality.

## 3. Image and video processing pipeline

The processing pipeline should change depending on what the user uploads.

### A. Single photograph

![Photorealistic interior reference](https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85)

1. Image validation and orientation correction.
2. Object and semantic segmentation.
3. Monocular depth prediction.
4. Camera and scene geometry estimation.
5. Generate initial geometry and object assets.
6. Infer missing geometry with uncertainty labels.
7. Generate editable scene and exportable model.

**Lower geometric certainty:** A single image generally cannot establish absolute scale or the exact shape of hidden surfaces without additional information.

### B. Multiple photographs

![Architectural interior reference](https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=85)

1. Detect overlapping views.
2. Match visual features across photographs.
3. Estimate camera positions.
4. Combine depth and point maps.
5. Fuse observations into consistent geometry.
6. Reconstruct surfaces and textures.
7. Complete areas not covered by photographs.

**Better reconstruction potential:** Multiple overlapping views provide stronger geometric evidence.

### C. Video

![Modern architectural space reference](https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=85)

1. Extract frames at adaptive intervals.
2. Remove blurry or redundant frames.
3. Track camera motion and objects.
4. Estimate depth and camera poses.
5. Build a consistent 3D scene.
6. Separate moving objects from static surroundings.
7. Reconstruct the environment and optionally dynamic objects.

**Strongest potential with good coverage:** For video, do not feed every frame into every model. Use adaptive frame sampling and temporal tracking. This saves considerable computation.

### Metric measurements

A major technical challenge is determining real-world scale.

A monocular depth model may estimate relative depth without knowing the actual physical distance.

To establish metric measurements, support:

- Known camera intrinsics and calibration.
- Depth sensor or LiDAR measurements where available.
- Known reference dimensions.
- Multiple views with geometric optimization.
- Sensor metadata when available.

For example, if the user tells the AI that a visible doorway is 2 metres tall, the system can use it as a scale reference and refine other dimensions.

The AI should display a measurement uncertainty range rather than claiming false precision.

## 4. Generative hidden-geometry system

This should be a separate model family, not just an image-generation model.

Call it **VIRTUAL ITG Occlusion Intelligence**.

![Architectural interior with visible structure](https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1400&q=85)

Its input:

- Visible surfaces.
- Camera positions.
- Depth maps.
- Segmented objects.
- Spatial relationships.
- Architectural context.
- Multiple observations where available.

Its output:

- Candidate hidden surfaces.
- Missing geometry.
- Plausible object completion.
- Confidence estimates.
- Alternative reconstructions when several possibilities are equally plausible.

### How to train it

1. Take complete 3D scenes.
2. Render them from different camera positions.
3. Artificially hide portions of the geometry.
4. Give the model only the incomplete observations.
5. Train it to predict the original hidden geometry.
6. Compare predicted geometry against the ground truth.
7. Repeat across different environments and object categories.

This gives you paired incomplete and complete scenes without requiring someone to manually hide parts of every training example.

For more reliable predictions, the model should generate multiple possible completions and rank them using geometric consistency, visual evidence and learned scene priors.

Do not let it silently invent exact building layouts.

## 5. Training datasets

Your AI's quality will depend heavily on its training data.

Combine real-world scans, synthetic 3D environments, object datasets and your own generated training scenes.

### Dataset catalogue

| Dataset | What it teaches your AI |
|---|---|
| ScanNet | Indoor scenes, camera poses, depth and reconstructed surfaces |
| ARKitScenes | Real indoor environments and 3D object annotations |
| Hypersim | Accurate synthetic depth, geometry, materials and segmentation |
| CO3D | Real-world object videos and 3D reconstruction |
| Objaverse | Object shapes, geometry, parts and visual diversity |

Datasets and documentation:

- ScanNet — https://www.scan-net.org/
- ARKitScenes — https://machinelearning.apple.com/research/arkitscenes
- Hypersim — https://machinelearning.apple.com/research/hypersim
- CO3D and uCO3D — https://ai.meta.com/datasets/CO3D-dataset/
- Objaverse — https://objaverse.allenai.org/

**Dataset licensing:** Check the individual dataset and asset licenses before training or redistribution. Objaverse contains assets under different licenses, including non-commercial licenses. Do not assume every downloadable model can be commercially reused.

### Your own synthetic dataset generator

![Photorealistic modern interior reference](https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=85)

Develop a Python-based synthetic scene generator using Blender.

It should automatically:

1. Generate rooms, buildings, corridors and outdoor environments.
2. Place objects in different configurations.
3. Randomize lighting, materials and camera positions.
4. Render images and video sequences.
5. Export exact depth maps.
6. Export camera poses.
7. Export object segmentation masks.
8. Export complete geometry and surface normals.
9. Generate artificially occluded versions.
10. Save the original unoccluded scenes as ground truth.

This synthetic dataset could eventually become one of your most valuable research assets.

### Training infrastructure

Use PyTorch for your training framework.

- Python
- PyTorch
- torchvision
- Hugging Face Transformers
- Accelerate
- Blender Python API
- Open3D
- CUDA when compatible GPU hardware is available

For experiment management, use:

- Versioned datasets.
- Model checkpoints.
- Training configurations.
- Validation metrics.
- Reproducible experiments.
- Model registry.

For each training run, record the model version, dataset version, configuration, evaluation results and checkpoint location. This will let you roll back to a known working model if an experiment reduces accuracy.

## 6. Actual model training strategy

Do not initially attempt to train a large multimodal model from zero. Fine-tune pretrained models and train smaller specialized heads first.

### Training stages

| Training stage | Main objective |
|---|---|
| T1 | Depth estimation |
| T2 | Camera pose and geometric understanding |
| T3 | 3D object and surface reconstruction |
| T4 | Occlusion and hidden geometry completion |
| T5 | Spatial relationships and scene graphs |
| T6 | Natural-language spatial instruction following |
| T7 | Physical-property estimation |
| T8 | Joint multi-module evaluation and refinement |

### Recommended loss functions

**Depth loss**

\[
L_{depth}=\frac{1}{N}\sum_i |\hat d_i-d_i|
\]

**Geometry loss**

Use point-cloud distance, such as Chamfer distance:

\[
L_{chamfer}=
\frac{1}{|P|}\sum_{p\in P}\min_{q\in Q}\|p-q\|^2
+
\frac{1}{|Q|}\sum_{q\in Q}\min_{p\in P}\|q-p\|^2
\]

**Segmentation loss:** Use cross-entropy and Dice loss.

**Camera loss:** Use rotation and translation errors.

**Hidden geometry loss:** Combine surface reconstruction loss, occupancy prediction and uncertainty calibration.

**Language loss:** Use supervised instruction-following examples and structured tool-call evaluation.

Combine these into a multi-task training objective:

\[
L_{total}=\sum_i \lambda_i L_i
\]

The \(\lambda_i\) values control how much each training objective contributes.

Do not train all these objectives simultaneously from day one. Start with individual modules and gradually introduce joint training.

### Training infrastructure

- Python and PyTorch for model development.
- CUDA for GPU acceleration.
- Hugging Face for model development and model storage.
- Blender for synthetic training scenes.
- Open3D for point-cloud processing.

## 7. Editable 3D model generation

Your AI must produce two different kinds of output:

1. A visually detailed reconstruction.
2. A structurally editable 3D model.

These are not necessarily the same representation.

### Use a hybrid representation

![Photorealistic interior reference](https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85)

**Gaussian splats**

Best for photorealistic novel views and scene appearance.

**Polygon meshes**

Best for editing, geometry inspection, collisions and conventional 3D applications.

**Point clouds**

Best for retaining observed spatial measurements and intermediate reconstruction data.

**Semantic scene graph**

Best for identifying, selecting, editing and interacting with individual objects.

### Export formats

| Format | Purpose |
|---|---|
| GLB / GLTF | Main interactive 3D model |
| OBJ | Mesh interchange |
| PLY | Point clouds and Gaussian splats |
| USD / USDZ | Advanced scene interchange |
| JSON | Scene graph and metadata |

Use GLB as the primary web export format, with separate spatial metadata.

Nerfstudio documents mesh and point-cloud export, while Three.js supports loading glTF assets.

### Essential editor features

- Select individual objects.
- Move, rotate and scale.
- Delete and duplicate.
- Change materials and textures.
- Adjust lighting.
- Edit walls, floors and ceilings.
- Inspect geometry in wireframe.
- Toggle observed and inferred geometry.
- Export the complete scene or selected objects.

Every object must have a stable identity in SceneIR, so editing the model does not destroy its relationship with the underlying scene data.

## 8. Physics and interactive world engine

This should be a dedicated simulation system.

Use **Three.js + Rapier 3D**.

Three.js handles rendering, cameras and 3D assets. Rapier handles physics, collision detection, forces and rigid-body simulation. Rapier has JavaScript bindings and is open-source under Apache 2.0.

![Modern interior environment reference](https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=85)

~~~mermaid
flowchart TD
    A["Reconstructed scene geometry"]
    B["Collider generation<br/>Primitive shapes and simplified collision meshes"]
    C["Physics property estimation<br/>Mass · Friction · Restitution · Constraints"]
    D["Rapier simulation engine"]
    E["Interactive 3D world<br/>Character · Collision · Object interactions"]
    A --> B --> C --> D --> E
~~~

### Physics properties

| Property | Purpose |
|---|---|
| Mass | Determines inertial behavior |
| Density | Helps estimate mass from volume |
| Friction | Controls surface interaction |
| Restitution | Controls bounce |
| Linear velocity | Controls movement |
| Angular velocity | Controls rotation |
| Collision shape | Determines physical boundaries |
| Body type | Static, dynamic or kinematic |

The AI should not pretend to know the true mass of an object just from a photograph. It can estimate plausible physical properties from object category and dimensions, label them as estimates, and allow user adjustment.

### Character system

Your world should have:

- Third-person character controller.
- Walk and run animation.
- Jumping.
- Camera orbit and look controls.
- Object interaction.
- Collision-aware navigation.
- Optional first-person mode.
- Scene boundary detection.

For interactive object manipulation, use a physics constraint or controlled grab interaction rather than simply teleporting an object.

**Important:** Photorealistic reconstruction and physical simulation must be kept separate. A Gaussian splat can look realistic but does not automatically provide a usable collision mesh. Generate simplified colliders and editable object geometry separately.

## 9. Natural-language intelligence and flexible commands

The user should not have to learn a special command language.

Build a custom **VIRTUAL ITG Intent Engine** around an open-weight language model.

It should understand:

- Text instructions.
- Uploaded photographs.
- Uploaded videos.
- References to individual objects.
- Follow-up instructions.
- Corrections and ambiguous requests.
- Context from the current 3D project.

### Example commands

| User instruction | AI operation |
|---|---|
| "Turn this into a 3D world" | Reconstruct scene |
| "Make it explorable" | Generate character and navigation |
| "Show me the actual dimensions" | Measurement analysis |
| "Remove that chair" | Object selection and deletion |
| "What is behind the cupboard?" | Occlusion completion |
| "Make the floor editable" | Geometry segmentation |
| "Let me pick up the table" | Physics interaction setup |
| "Show only the actual reconstructed parts" | Observed-geometry filter |
| "Create another version with a larger room" | Scene modification |

### Intent processing architecture

1. Receive the instruction and current project context.
2. Detect the user's intended operation.
3. Resolve references such as "that chair" to scene object IDs.
4. Generate a structured action plan.
5. Check whether required information is available.
6. Call the appropriate model or scene tool.
7. Validate the result.
8. Update the project state.
9. Explain what changed.

A useful structured command might look like:

~~~json
{
  "intent": "generate_explorable_world",
  "input_asset": "upload_001",
  "operations": [
    "reconstruct_scene",
    "estimate_depth",
    "generate_scene_graph",
    "create_collision_geometry",
    "initialize_character"
  ],
  "output": "interactive_3d_world"
}
~~~

The language model should orchestrate operations, not directly invent the underlying geometry.

## 10. Backend and inference architecture

This is where the entire system comes together.

Use a Python backend with FastAPI for model inference and job management.

### Suggested backend structure

~~~text
virtual-itg/
│
├── frontend/
│   ├── studio/
│   ├── viewer/
│   ├── editor/
│   └── components/
│
├── backend/
│   ├── api/
│   │   ├── uploads.py
│   │   ├── reconstruction.py
│   │   ├── projects.py
│   │   ├── measurements.py
│   │   └── commands.py
│   │
│   ├── intelligence/
│   │   ├── vision/
│   │   ├── depth/
│   │   ├── geometry/
│   │   ├── segmentation/
│   │   ├── occlusion/
│   │   ├── spatial/
│   │   ├── language/
│   │   └── physics/
│   │
│   ├── reconstruction/
│   ├── scene_ir/
│   ├── export/
│   ├── inference/
│   └── validation/
│
├── training/
│   ├── datasets/
│   ├── preprocessing/
│   ├── synthetic_generator/
│   ├── experiments/
│   ├── checkpoints/
│   └── evaluation/
│
├── physics/
│   ├── colliders/
│   ├── materials/
│   └── simulation/
│
├── models/
│   ├── model_registry.json
│   └── model_configs/
│
└── docs/
~~~

### Inference job lifecycle

1. **Upload:** User uploads image, images or video.
2. **Validation:** Check format, file size, duration and image quality.
3. **Preprocessing:** Frame extraction, resolution management and input normalization.
4. **AI inference:** Run perception, depth, geometry and spatial modules.
5. **Reconstruction:** Generate and fuse point clouds, splats and meshes.
6. **World completion:** Fill missing geometry with uncertainty tracking.
7. **Physics preparation:** Generate object colliders and simulation metadata.
8. **Export and delivery:** Save SceneIR, GLB and optional splat assets.

For long-running reconstruction, use background jobs and progress events. Do not hold one HTTP request open for the entire reconstruction.

### API design

| Endpoint | Responsibility |
|---|---|
| POST /api/v1/uploads | Upload media |
| POST /api/v1/reconstructions | Start reconstruction |
| GET /api/v1/jobs/{id} | Check processing status |
| GET /api/v1/scenes/{id} | Retrieve SceneIR |
| POST /api/v1/scenes/{id}/commands | Execute natural-language commands |
| GET /api/v1/scenes/{id}/assets | Retrieve 3D assets |
| POST /api/v1/scenes/{id}/export | Export models |
| POST /api/v1/scenes/{id}/measurements | Calculate dimensions |

## 11. Storage architecture

You will need to store more than model weights.

Separate four types of storage:

| Storage | What belongs there |
|---|---|
| Model storage | Checkpoints, weights, configurations |
| Dataset storage | Training images, videos, annotations and ground truth |
| Project storage | SceneIR, object metadata, camera poses |
| Asset storage | Meshes, textures, splats and exports |

### Suggested project layout

~~~text
project_001/
│
├── input/
│   ├── images/
│   └── video/
│
├── reconstruction/
│   ├── depth/
│   ├── camera_poses/
│   ├── point_cloud/
│   ├── meshes/
│   └── gaussian_splats/
│
├── world/
│   ├── scene_ir.json
│   ├── scene_graph.json
│   ├── object_metadata/
│   └── confidence_maps/
│
├── physics/
│   ├── colliders/
│   └── simulation_config.json
│
├── exports/
│   ├── scene.glb
│   ├── scene.obj
│   └── scene.ply
│
└── manifest.json
~~~

### Recommended storage strategy

- Use GitHub for source code, configurations and lightweight metadata.
- Keep large model weights outside normal Git repositories.
- Use browser IndexedDB or Origin Private File System for local projects.
- Allow downloading a complete project archive.
- Use an object-storage service for optional cloud projects.
- Keep model versions separate from user-generated 3D assets.

For the first version, local project storage is particularly useful because it avoids requiring a paid database or permanent cloud storage.

Do not put private API keys or user-uploaded private media in a public GitHub repository.

## 12. Free deployment strategy

The final goal is not merely a GitHub Pages website. **VIRTUAL ITG should become its own AI API service**, which can be consumed by third-party developers, used by its own web application, or run locally on a user's computer.

~~~mermaid
flowchart TD
    A["VIRTUAL ITG source repository"]
    B["GitHub Pages<br/>Browser Studio · Viewer · Editor"]
    C["VIRTUAL ITG public API<br/>Authentication · Jobs · Inference"]
    D["Local VIRTUAL ITG runtime<br/>Computer-hosted inference service"]
    E["Model registry and model weights"]
    F["Spatial project and asset storage"]
    G["External applications and developers"]
    A --> B
    A --> C
    A --> D
    B <--> C
    B <--> D
    C <--> E
    D <--> E
    C <--> F
    D <--> F
    G <--> C
~~~

### Three inference modes

#### Mode A — Browser inference

- Small depth and vision models.
- WebGPU where supported.
- ONNX Runtime Web or Transformers.js.
- No centralized GPU required.
- Best for lightweight operations.

#### Mode B — Local machine inference

- Python backend on the user's computer.
- Full-size reconstruction models where hardware allows.
- Local storage for media and model weights.
- Website connects to the local service.
- The local runtime can expose the same API contract as the cloud service.

#### Mode C — Cloud inference

- Remote GPU processing.
- Queued reconstruction jobs.
- Centralized model updates.
- Optional public API.
- Usage limits, authentication and resource controls.

### API service as the final product

The API should have a stable versioned contract so other applications can integrate VIRTUAL ITG without depending on its internal model implementation.

Core API capabilities:

- Media upload.
- Image-to-3D reconstruction.
- Video-to-3D reconstruction.
- Depth and measurement estimation.
- Scene completion.
- Scene and object queries.
- Natural-language scene commands.
- 3D asset export.
- Reconstruction job status and progress.
- Model and capability discovery.

The same API interface should be usable in three ways:

1. Hosted VIRTUAL ITG API.
2. Local VIRTUAL ITG runtime.
3. Browser-side lightweight inference where supported.

This makes the web studio a client of your own AI service rather than a hardcoded application tied to another provider.

### What can realistically remain free?

| Component | Free approach |
|---|---|
| Website | GitHub Pages |
| Source code | GitHub |
| Frontend rendering | Three.js |
| Browser physics | Rapier |
| Local inference | User's own compatible hardware |
| Model development | Open-source frameworks |
| Training | Small experiments on available hardware |
| Large-scale training | Requires substantial compute |
| Cloud GPU inference | Free quotas only where available |
| User project storage | Browser/local downloads |

Make the website completely usable in local mode, with cloud processing as an optional enhancement. That way, the project does not stop working if a free inference provider changes its limits.

Cloud GPU usage is the expensive part. Free hosting quotas can change, and a free GPU service should never be treated as a guaranteed permanent inference backend.

## 13. Evaluation and quality assurance

Build a dedicated **VIRTUAL ITG Evaluation Lab**.

| Test | Measurement |
|---|---|
| Depth accuracy | Absolute Relative Error, RMSE |
| Camera estimation | Rotation and translation error |
| 3D reconstruction | Chamfer distance, F-score |
| Surface reconstruction | Completeness and accuracy |
| Object detection | Precision, recall, mAP |
| Hidden geometry | IoU and surface distance against ground truth |
| Scale estimation | Percentage dimensional error |
| Physics | Collision and trajectory error |
| Language | Intent classification and command success rate |
| Performance | Processing time, memory and frame rate |

### Suggested initial acceptance targets

These are engineering targets to work toward, not guaranteed model performance.

- No invalid scene files.
- Every generated object has a stable ID.
- Every inferred surface has a confidence label.
- Scene coordinates remain consistent after editing.
- Physics objects have valid colliders.
- Exported GLB files reopen successfully.
- The system can process multiple photographs of one scene.
- The AI correctly distinguishes reconstruction requests from ordinary image-analysis requests.
- The user can explore a generated scene without requiring a cloud connection once its assets are downloaded.

Also create a regression suite containing previously successful reconstruction projects. Every major model update should be tested against those projects.

## 14. Complete development roadmap

Suggested order for a solo developer. Timeline depends on available hardware and implementation depth.

### Phase 1 — Foundation and Studio

**First milestone**

- Set up GitHub repository.
- Build the 3D studio.
- Implement photo and video upload.
- Create SceneIR.
- Build 3D rendering and project storage.
- Add GLB import/export.

**Deliverable:** A functional 3D workspace.

### Phase 2 — Vision and Depth Intelligence

- Integrate pretrained depth estimation.
- Add segmentation.
- Estimate camera information.
- Display depth maps.
- Implement measurement calibration.

**Deliverable:** AI-powered spatial analysis.

### Phase 3 — Reconstruction Engine

- Integrate VGGT through the optional local VIRTUAL ITG Spatial API.
- Accept a source photograph plus up to seven additional overlapping photographs.
- Estimate camera geometry and shared world-space point maps with VGGT when the local model is installed and available.
- Generate a browser-side point cloud from the Stage 2 depth map when VGGT is unavailable.
- Fuse the multi-view world-space point maps returned by VGGT, with confidence filtering.
- Extract an editable, textured, depth-derived mesh and export it as GLB.
- Inspect point clouds and export PLY.
- Preview Gaussian-style point splats and export a Gaussian-initialized PLY for later refinement.
- Keep source imagery visible in the reconstruction viewport and make the inspector responsive on small screens.

**Deliverable:** A working single-photo depth-to-3D path in the browser, plus an optional local VGGT multi-view reconstruction and world-space fusion path.

**Implementation boundary:** A single-photo mesh is a view-conditioned surface, not a complete room scan. The browser Gaussian preview and PLY export initialize isotropic splats from points; they are not a trained anisotropic Gaussian-splat reconstruction. VGGT-1B is a large model and may require substantially more memory or a supported GPU; an 8 GB CPU-only computer can use the lightweight browser reconstruction, but may not be able to run VGGT locally.

**Local engine setup:** See [local-engine/README.md](local-engine/README.md) for the FastAPI endpoint, installation instructions, health check and multi-view reconstruction request format.

### Stage 4 implementation status (current release)

The current Stage 4 browser workspace is documented in [docs/STAGE_04_WORLD_COMPLETION.md](docs/STAGE_04_WORLD_COMPLETION.md). It provides object-mask-based proxy geometry, three alternative inferred-volume hypotheses, confidence/provenance display, and GLB + SceneIR export. A Blender paired-scene generator and PyTorch depth-completion training baseline are included. The optional local API only runs learned completion after a checkpoint has been generated and trained; no pretrained Stage 4 weights are claimed.

### Phase 4 — Generative World Completion

- Build synthetic training data generator.
- Train geometry-completion models.
- Generate hidden surfaces.
- Add confidence maps.
- Implement alternative completions.

**Deliverable:** Partially occluded world reconstruction.

### Phase 5 — Spatial Intelligence

- Develop object relationship graphs.
- Implement semantic object identification.
- Estimate dimensions and spatial relationships.
- Build the natural-language intent engine.
- Implement scene editing commands.

**Deliverable:** An AI that understands and edits its 3D world.

### Stage 5 implementation status (current release)

The current Stage 5 workspace is documented in [docs/STAGE_05_SPATIAL_INTELLIGENCE.md](docs/STAGE_05_SPATIAL_INTELLIGENCE.md). It adds a semantic object inventory from existing Stage 2 masks, an image-space relationship graph, normalized size/depth-response inspection, a bounded browser-local natural-language command parser, undo, visibility and proxy-transform edits, and SceneIR/relationship JSON export. The local FastAPI service also exposes `POST /v1/spatial/relationships`.

The graph uses visible 2D masks and relative depth responses. It does not claim metric dimensions, full hidden-scene understanding, or direct deformation of the Stage 3 mesh. The local command parser is deterministic and bounded rather than a general-purpose LLM.

### Phase 6 — Physics and Exploration

- Integrate Rapier.
- Build the third-person character.
- Generate colliders.
- Add object interaction.
- Implement gravity and collisions.
- Add scene navigation.

**Deliverable:** Fully explorable and interactive worlds.

### Phase 7 — Model Training and Optimization

- Fine-tune specialized models.
- Improve geometry and depth.
- Train occlusion completion.
- Optimize inference.
- Validate across indoor and outdoor environments.

**Deliverable:** Your own coordinated spatial AI model family.

### Phase 8 — Public Release

- GitHub Pages deployment.
- Optional local inference.
- Optional cloud inference.
- Model version management.
- Documentation.
- Performance and regression testing.

**Deliverable:** Publicly accessible VIRTUAL ITG platform and API.

## 15. What to build first

Do not begin by training all nine models.

Build a minimum viable system that can demonstrate the central concept:

![Modern interior environment reference](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=85)

**First working release:**

1. Upload one photograph.
2. Estimate depth.
3. Identify major objects.
4. Generate an initial 3D scene.
5. Mark generated and inferred geometry.
6. Allow the user to edit the resulting scene.
7. Generate collision geometry.
8. Enter the scene using a third-person character.
9. Save and export the project.

Then add multi-view and video reconstruction.

This gives you a working foundation before tackling the more difficult research problems.

## 16. Final recommended technology stack

| Area | Technology |
|---|---|
| Frontend | TypeScript, React |
| 3D rendering | Three.js |
| 3D physics | Rapier |
| AI development | Python, PyTorch |
| Depth | Depth Anything V2 |
| Multi-view geometry | VGGT |
| Segmentation | SAM 2 |
| Reconstruction | COLMAP, Open3D |
| Neural rendering | Nerfstudio, gsplat |
| Synthetic data | Blender |
| Backend | FastAPI |
| API communication | REST + WebSockets |
| Model integration | Hugging Face Transformers |
| Browser inference | ONNX Runtime Web, Transformers.js |
| Scene format | Custom SceneIR + GLB |
| Local storage | IndexedDB / OPFS |
| Version control | GitHub |
| Website hosting | GitHub Pages |

## 17. Important engineering decisions

Five decisions should be non-negotiable:

1. **No fake measurements:** The AI must distinguish absolute measurements from relative depth estimates.
2. **No invisible hallucinations:** Hidden geometry must be marked as inferred.
3. **No splat-only worlds:** Interactive objects need editable geometry and collision representations.
4. **No cloud dependency:** Local mode must remain available.
5. **No monolithic AI:** Each intelligence module must be independently testable and replaceable.

Also, the system should distinguish visual damage detection from actual structural-integrity assessment. It can identify visible cracks or deformation, but it cannot certify that a real building is structurally safe from photographs.

## 18. Proposed repository architecture

Organize the repository so the actual AI research engine remains separate from its user-facing studio.

~~~text
VIRTUAL-ITG/
│
├── apps/
│   ├── web-studio/
│   ├── world-explorer/
│   └── model-viewer/
│
├── ai/
│   ├── virtual-itg-vision/
│   ├── virtual-itg-depth/
│   ├── virtual-itg-geometry/
│   ├── virtual-itg-object/
│   ├── virtual-itg-world/
│   ├── virtual-itg-spatial/
│   ├── virtual-itg-language/
│   ├── virtual-itg-physics/
│   └── virtual-itg-orchestrator/
│
├── engine/
│   ├── scene-ir/
│   ├── reconstruction/
│   ├── scene-completion/
│   ├── physics/
│   ├── navigation/
│   └── export/
│
├── training/
│   ├── datasets/
│   ├── blender-generator/
│   ├── preprocessing/
│   ├── training/
│   └── evaluation/
│
├── backend/
│   ├── api/
│   ├── workers/
│   ├── inference/
│   └── storage/
│
├── models/
├── tests/
├── docs/
└── .github/
    └── workflows/
~~~

Keep model weights and large datasets outside the normal source repository. GitHub Actions should handle testing and frontend deployment, not be treated as a permanent GPU training cluster.

## 19. The ultimate vision

![Modern architectural digital environment](https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85)

Eventually, VIRTUAL ITG could become a general-purpose spatial intelligence platform:

- Photograph to 3D.
- Video to 3D.
- Real-world environment reconstruction.
- AI-generated hidden geometry.
- Architectural scene understanding.
- Object-level measurements.
- Editable digital twins.
- Interactive character exploration.
- Physics-based simulation.
- Natural-language world editing.
- Reusable 3D assets and downloadable projects.
- A public AI API that developers can integrate into their own products.
- A local runtime that users can run on their own computers.
- A GitHub Pages browser studio that can connect to the hosted API or a local runtime.

**The most important distinction:** You are not merely building an AI that generates 3D models. You are building an AI that understands, reconstructs, represents and simulates physical environments.

## 20. Development configuration

The implementation should be configured around the available hardware, training strategy, deployment preference and development scope.

Recommended starting configuration:

- **Hardware:** Use available local hardware and optional cloud notebooks/GPU resources.
- **Model training:** Use pretrained models first, then fine-tune and train specialized models.
- **Deployment:** GitHub Pages + local AI inference, with optional cloud inference.
- **Development approach:** Build the complete modular architecture, implementing and testing one phase at a time.

The initial repository setup should include the exact dependencies, folder structure, first implementation tasks and testing requirements.

---

## Final goal — VIRTUAL ITG as an independent AI API service

The final product is an independent spatial intelligence AI service, not just a website and not merely a frontend wrapper around another company's API.

VIRTUAL ITG should provide:

1. **Its own AI model family:** Specialized vision, depth, geometry, spatial, occlusion and language models, progressively trained and fine-tuned using owned and properly licensed datasets.
2. **Its own inference API:** A stable, versioned API for image-to-3D, video-to-3D, depth, measurement, world completion, scene editing and 3D exports.
3. **Local execution:** A local runtime that can load supported model weights and process projects on a user's own computer, subject to available hardware.
4. **Browser execution:** A browser-based studio that can run lightweight models locally using supported web technologies.
5. **GitHub Pages interface:** A static, publicly accessible frontend that connects to the VIRTUAL ITG API or to a local runtime. GitHub Pages hosts the interface, not the Python inference server.
6. **Developer integration:** Other applications can consume the VIRTUAL ITG API as a service.
7. **Portable projects:** Users can save, export and reopen their 3D scenes and metadata without being permanently locked to one hosting provider.

The same scene representation, model contracts and API behavior should be shared across hosted and local execution wherever practical. This will make VIRTUAL ITG portable, extensible and independently maintainable.

**VIRTUAL ITG's ultimate mission is to transform visual information into spatial understanding — and spatial understanding into editable, explorable and physically interactive digital worlds.**
