# THRECON Stage 1 — Sci-Fi Studio

## Included
- One-screen, no-page-scroll studio layout with compact HUD panels.
- Dark glass interface, cyan/violet accents and responsive desktop/mobile layout.
- Eight environment destinations in the navigation rail.
- Live Three.js viewport with orbit, zoom, sample geometry, selection and grid/wireframe controls.
- Scene graph, primitive creation, transform inspector, color selection and deletion.
- IndexedDB local save/restore and JSON project import/export.
- WebGL unavailable fallback and help overlay.
- GitHub Actions typecheck, unit test, build and Pages deployment workflow.
- Shared Pages deployment concurrency group with queue:max.

## Stage 1 scope
The eight destinations are module navigation. Stage 1 implements the shared studio shell and working workshop viewport. Photo reconstruction, physics, playable characters, portals and GLB export belong to later stages. Project JSON export is not 3D asset export.

## Verification checklist
1. Open Pages after the workflow succeeds.
2. Orbit/zoom; select scene objects.
3. Add cube, sphere and torus; transform, recolor and delete.
4. Toggle grid, lighting and wireframe.
5. Save, refresh and confirm local restore.
6. Export and re-import project JSON.
7. Check mobile layout and confirm the page itself does not scroll.
