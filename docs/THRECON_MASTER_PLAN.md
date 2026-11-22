# THRECON — Master Architecture & Six-Stage Development Plan

> **Vision:** Turn a single photograph into an editable, explorable 3D environment; combine environments into connected worlds; simulate interactions; and export assets for game-development workflows.
>
> **Input policy:** Still photographs only. Video upload and video-based reconstruction are out of scope.

## 1. Product definition

THRECON is an AI-powered spatial creation studio, not merely a photo viewer or one-click mesh converter.

**Photograph → visual understanding → depth and geometry → 3D scene → editable spatial layers → connected environments → interactive simulation → export.**

A single photograph cannot reveal hidden sides or occluded surfaces. THRECON must distinguish:
- **Observed/reconstructed content:** supported by image evidence and model output.
- **Inferred content:** estimated geometry or textures for unseen regions.
- **Creator-authored content:** objects and edits explicitly added by the user.

The interface must not imply unseen areas are known with certainty. Show confidence/provenance and let users edit inferred regions.

## 2. Seven-layer engine architecture

1. **Photo Input Core** — still-image capture/import, validation, orientation, quality checks and metadata.
2. **Visual Intelligence** — segmentation, object recognition, monocular depth, surface hints, confidence and provenance.
3. **3D Reconstruction** — depth-to-point-cloud/mesh, texture projection, single-object reconstruction and optional Gaussian-splat representation.
4. **Spatial World Engine** — scene graph, transforms, materials, lighting, collision shapes, physics and environment settings.
5. **Nexus Workshop** — multi-world layout, independent editable layers, linking, portals, alignment, cloning and version history.
6. **Reality Simulator** — first-/third-person navigation, characters, collision-aware movement, object pickup/place and interactions.
7. **Universe Export Engine** — GLB/glTF first, OBJ where supported, project bundle, validation and game-engine handoff.

These are logical modules with explicit interfaces, not seven disconnected applications.

## 3. Six-stage delivery plan

### Stage 1 — Foundation & Sci-Fi Studio

**Goal:** Establish a stable application shell and a real 3D workspace before expensive AI.

**Build**
- React + TypeScript + Vite foundation.
- Dark sci-fi design system: deep black, cyan/blue/violet accents, restrained glow, glass panels and responsive layout.
- Main environments: Reality Scanner, Spatial Laboratory, Nexus Workshop, Layer Architect, Reality Explorer, Character Laboratory, Physics Laboratory and Universe Forge.
- Central Three.js viewport with camera controls, grid, axes, selection outline, transform gizmos and sample scene.
- Project create/open/save using IndexedDB; project JSON import/export.
- Accessible controls, keyboard shortcuts, loading/error/empty states and reduced-motion support.
- Scroll-based panel assembly is presentation only; core controls never depend on scroll animation.

**Tools**
- React, TypeScript, Vite.
- Three.js, React Three Fiber, Drei.
- Tailwind CSS OR CSS modules (choose after repository audit; do not add competing styling systems).
- Zustand only if the existing app has no suitable state manager.
- IndexedDB via Dexie, or native IndexedDB if dependency cost is not justified.
- Vitest, React Testing Library and Playwright.

**Exit checks**
- Clean install and production build.
- Main routes load; viewport renders on supported desktop and mobile browsers.
- Save/reload works after refresh.
- WebGL/WebGPU failure shows a useful fallback, not a blank screen.
- Existing working features remain intact.

### Stage 2 — Photo Intake & Visual Intelligence

**Goal:** Make a photograph produce inspectable spatial evidence.

**Build**
- Still-image upload and camera capture; reject video formats and video MIME types.
- Validate file size, dimensions, format and decode errors.
- Preview, crop/rotate, orientation correction and quality checks.
- Segmentation/object masks where supported.
- Monocular depth, normal/surface hints where supported, object labels and confidence.
- Spatial Laboratory views: original, masks, depth, normals, point-cloud preview and comparisons.
- Save outputs with model name/version, settings and provenance.

**AI/model candidates**
- Depth Anything V2 or another maintained monocular depth model for relative depth.
- Segment Anything 2 (SAM 2) or a browser-compatible segmentation model for masks.
- ONNX Runtime Web for compatible browser inference; WebGPU only after feature detection and testing.
- Optional lightweight object detector only if it supports a real editing workflow.

**Fallbacks**
- If WebGPU is unavailable, try WASM/WebGL where the model supports it.
- If browser inference is too slow, offer an optional remote inference adapter.
- If no model loads, retain image intake and allow manual scene setup; never fake results.
- Cache model assets only when licensing, storage size and browser limits permit.

**Exit checks**
- Photo-only input is enforced.
- Unsupported formats and oversized images fail gracefully.
- Depth/mask outputs are inspectable and saved with provenance.
- CPU/WASM fallback and model-unavailable states are tested.
- No API key is shipped in frontend code.

### Stage 3 — Single-Photo 3D Reconstruction

**Goal:** Convert visual evidence into an explorable 3D representation.

**Build**
- Convert depth maps into point clouds and textured mesh surfaces.
- Camera/FOV assumptions and user-adjustable scale.
- Mesh cleanup: normals, decimation, UV/texture handling and bounds.
- Optional single-object reconstruction for selected objects.
- Optional Gaussian-splat viewer for visual fidelity, kept separate from editable mesh geometry.
- Label observed, inferred and user-created geometry.
- Quality controls: detail, texture resolution, mesh density and performance mode.
- Store source photo, model/version, settings and output asset references.

**AI/model candidates**
- TripoSR or Stable Fast 3D for single-object image-to-3D experiments, subject to current status, runtime and license review.
- Depth Anything V2 for image-to-depth.
- Gaussian Splatting as an optional scene representation, not a replacement for editable meshes.
- A model-adapter interface so models can be replaced without rewriting the editor.

**Scope boundary**
A single photograph can produce a plausible view-conditioned scene, but cannot guarantee accurate unseen sides. First prioritize a convincing viewable scene with depth-based geometry and editable inferred regions. Multi-photo fusion may be added later; the input workflow remains photographs only.

**Exit checks**
- A test photo generates a real point cloud or mesh, not a decorative placeholder.
- User can orbit, pan, zoom and inspect it.
- Exported GLB opens in an independent glTF viewer.
- Inferred areas are visibly labelled.
- Heavy work uses workers or an optional backend and does not freeze the UI.

### Stage 4 — Layer Architect & Multi-World Nexus Workshop

**Goal:** Make reconstructed environments editable and composable.

**Build**
- Scene graph with named environments, collections and nested objects.
- Independent layers for geometry, objects, materials, lighting, atmosphere, collision/physics and interaction metadata.
- Select, move, rotate, scale, duplicate, hide, lock, group and delete.
- Multi-environment 3D workshop: arrange worlds side by side, above/below or at user-defined coordinates.
- World connectors and portal objects with editable entry/exit transforms.
- Alignment, snapping, grid, coordinates and transform reset.
- Clone environment, undo/redo history, autosave and project version snapshots.
- Distinguish linking scenes from physically merging their geometry.

**Tools**
- Three.js scene graph and transform controls.
- Existing state manager or Zustand.
- IndexedDB for project documents and asset metadata.
- glTF Transform for asset inspection/optimization when compatible.
- Typed scene/project schema with migrations and validation.

**Exit checks**
- Two or more independently reconstructed scenes coexist in one project.
- Moving one scene does not corrupt another.
- Layers toggle and edit independently.
- Portals preserve configured destinations and transforms.
- Undo/redo, autosave and reload preserve the scene graph.

### Stage 5 — Reality Explorer, Characters & Physics

**Goal:** Enter the created world and interact with it.

**Build**
- First-person and third-person camera modes.
- Starter character controller: walk, run, jump and collision-aware movement.
- Character selection from a small, legally usable starter set; import support later.
- Rapier physics for rigid bodies, colliders, gravity and collision events.
- Interaction system: focus/highlight, pick up, carry, drop and place.
- Placement validation, snap-back to original transform and reset.
- Doors, switches and simple triggers as reusable components.
- Environment settings: lighting/time-of-day presets, fog and gravity controls.
- Touch controls for mobile; keyboard/mouse for desktop.
- Performance settings for low-memory devices.

**Tools**
- Rapier (JavaScript/WASM).
- Three.js / React Three Fiber.
- glTF character assets with verified redistribution rights.
- Playwright for interaction flows; unit tests for interaction state.

**Exit checks**
- Character moves without passing through configured colliders.
- Object pickup/drop/place works and persists.
- Mobile and desktop controls are usable.
- Physics can be disabled or simplified for weaker devices.
- Do not claim realistic physics where collision geometry is missing.

### Stage 6 — AI Scene Assistant, Export Forge & Release

**Goal:** Make THRECON a usable creator tool and prepare stable releases.

**Build**
- Constrained commands such as “move selected scene left”, “create a portal to Environment B” and “hide lighting layer”.
- Assistant previews structured actions; user confirms destructive or multi-object edits.
- Optional natural-language scene description through a configurable provider adapter. Core editor works without an AI key.
- Project templates and starter worlds.
- GLB/glTF export as primary format; OBJ only for compatible geometry workflows.
- Export validation, missing-texture warnings, polygon/texture statistics and size estimates.
- Game-engine handoff guide and sample import project; no claimed direct integration until tested.
- Accessibility, performance, browser compatibility, security and documentation pass.

**Tools**
- Provider-neutral AI adapter; no provider-specific calls inside UI components.
- Optional OpenRouter-compatible backend adapter or another provider selected only after availability, terms, model access and budget are checked.
- Python + FastAPI only if remote model inference is actually needed.
- GitHub Actions for lint, typecheck, tests, build and GitHub Pages deployment.
- Playwright smoke tests and a documented device matrix.

**Exit checks**
- Assistant actions use an allow-listed schema and confirmation for risky edits.
- Exported GLB validates and opens in a separate viewer.
- App remains usable with optional AI providers disconnected.
- GitHub Actions checks pass and deployed Pages site is verified.
- Known limitations and tested browser/device support are documented.

## 4. Technology and AI inventory

| Area | Candidate | Role / fallback |
|---|---|---|
| App | React + TypeScript + Vite | Static GitHub Pages frontend |
| 3D rendering | Three.js + React Three Fiber + Drei | WebGL baseline; feature-detect WebGPU |
| Shaders | GLSL | Effects with a low-effects mode |
| Depth | Depth Anything V2 | Browser ONNX if compatible; optional backend |
| Segmentation | SAM 2 | Optional model; manual layer editing remains available |
| Image-to-3D | TripoSR / Stable Fast 3D | Model adapter; depth-to-mesh fallback |
| Scene representation | Editable meshes + optional Gaussian splats | Mesh export independent of splat rendering |
| Physics | Rapier | Disable/reduce physics on low-power devices |
| Model runtime | ONNX Runtime Web | WASM/WebGL fallback where supported |
| Background work | Web Workers | Keep UI responsive |
| Local persistence | IndexedDB / Dexie | Exportable project bundle |
| 3D exchange | glTF / GLB; optional OBJ | Validate assets and textures |
| Asset optimization | glTF Transform | Use after compatibility checks |
| Testing | Vitest, Testing Library, Playwright | Manual device smoke tests |
| CI/CD | GitHub Actions + GitHub Pages | Static deployment; backend separate |
| Optional backend | Python + FastAPI | Only for models too large for browser |
| Optional language AI | Provider-neutral adapter | Never required for core editing/export |

**Model selection rule:** These are candidates, not assumptions that every model is browser-ready, free to host, commercially redistributable or compatible with every device. Before integration, check repository activity, license, model weights, memory/VRAM, runtime, download size, input/output contract and hosting limits. Pin tested versions and record decisions in docs/AI_MODEL_REGISTER.md.

## 5. Reliability plan — avoid unavailable-tool dead ends

1. **Audit first:** inspect existing files, package manager, framework, deployment workflow, features and branch state before changing code.
2. **Capability registry:** optional models/providers expose available, loading, ready, unavailable and error states.
3. **Provider adapters:** providers are replaceable modules behind typed interfaces.
4. **No secret leakage:** API keys never live in committed frontend code; remote credentials stay in server environment variables.
5. **Honest progress:** progress reflects real task states; never fabricate scan percentages or reconstruction results.
6. **Fallback by design:** depth-to-mesh is the first dependable reconstruction path; advanced image-to-3D and splat modes are enhancements.
7. **Device support:** detect WebGL/WebGPU and worker support; show clear fallbacks.
8. **Dependency discipline:** install only needed packages, pin compatible versions, keep lockfile, verify package names and peer dependencies.
9. **License review:** check code, model, dataset, texture, character and font licenses before redistribution.
10. **Resource limits:** file-size limits, worker cancellation, memory cleanup, texture limits and scene complexity warnings.
11. **Test gates:** lint, typecheck, unit tests, production build, browser smoke tests, export validation and deployment verification at every stage.
12. **Additive changes:** preserve existing behavior; isolate new systems behind modules/feature flags where appropriate.

## 6. Deployment architecture

- **GitHub Pages:** serves the React/Vite static frontend and client-side editor.
- **Browser:** handles UI, scene editing, project persistence and compatible lightweight inference.
- **Optional inference service:** handles large model weights or GPU-heavy reconstruction when configured. It is not required to open projects or use the editor.
- **Project files:** local by default; user explicitly exports/shares a project bundle.
- **Secrets:** backend environment variables only; never commit .env, tokens or provider secrets.

GitHub Pages cannot run a Python inference server. If remote inference is necessary, deploy it separately and keep the frontend functional when it is offline.

## 7. Repository workflow and release gates

Before implementation:
- Inspect the actual main branch and repository contents; do not assume its framework or existing state.
- Record baseline commit, build status, workflows, deployment URL and existing behavior.
- Confirm the available build/deploy path and required permissions.
- Add architecture/roadmap documentation without replacing existing project files.

For each stage:
1. Implement one coherent slice.
2. Run install/lockfile checks, lint, typecheck, unit tests and production build.
3. Run browser smoke tests for changed flows.
4. Inspect the diff for unrelated changes and accidental feature removal.
5. Commit to main with a focused message, following the repository's established workflow.
6. Verify GitHub Actions and deployment before calling the stage complete.
7. Record tested features, limitations and next stage.

Never report a deployment as successful until the workflow and deployed site have both been checked.

## 8. Initial acceptance checklist

- [ ] Photograph-only input; video is rejected.
- [ ] Real image analysis with visible provenance.
- [ ] Depth-to-point-cloud/mesh reconstruction.
- [ ] Observed vs inferred geometry is distinguishable.
- [ ] 3D viewport supports navigation and selection.
- [ ] Multiple environments coexist in one workshop.
- [ ] Independent scene layers and transforms work.
- [ ] Portals connect configured environments.
- [ ] First-/third-person exploration works.
- [ ] Object pickup, drop and placement work.
- [ ] Physics and interaction settings are editable.
- [ ] Projects save locally and reopen correctly.
- [ ] GLB/glTF export validates in an independent viewer.
- [ ] Optional AI outages do not disable core editing.
- [ ] GitHub Actions and GitHub Pages deployment are verified.

## 9. Definition of success

THRECON succeeds when a user can import a still photograph, obtain an honest and inspectable 3D reconstruction, edit spatial layers, combine environments, enter and interact with the world, save the project and export a valid 3D asset — without requiring a paid AI provider for the core editor.

**Build order:** stable editor → real image intelligence → reconstruction → world composition → simulation → AI assistance, export and release hardening.
