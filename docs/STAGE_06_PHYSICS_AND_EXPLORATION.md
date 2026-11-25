# Stage 6 — Physics and Exploration

Stage 6 adds a dedicated playable workspace to VIRTUAL ITG. It consumes the active Stage 2 photograph, relative-depth output and segmentation masks without replacing the existing scanner, reconstruction, completion or scene-graph workspaces.

## Runtime

- Three.js renders a photo-textured, depth-displaced relief surface and an explorable environment.
- Rapier 3D (`@dimforge/rapier3d-compat`) provides gravity, rigid bodies, collision geometry and the character collision controller.
- The third-person player uses keyboard controls on desktop and an on-screen directional pad, jump, run and pickup/drop controls on touch devices.
- The camera follows the player; pointer/touch dragging changes the view.
- Segmentation masks become individual textured object proxies with physics colliders. These are explicitly approximate because 2D masks and monocular depth do not reveal complete hidden object geometry.
- If no masks are available, generic interaction props are created so the physics and pickup loop can still be exercised.
- PICK UP raycasts from the view reticle and grabs a nearby proxy. DROP returns it to a dynamic rigid body so gravity and collisions resume.
- The world includes a walkable ground collider, raised platforms, perimeter collision pillars, lighting, shadows, fog and a photo-derived relief wall.

## Landscape and exit behavior

The player taps **ENTER GAME · LANDSCAPE** to request fullscreen and `screen.orientation.lock('landscape')` where supported. If the browser cannot lock orientation, the game surface uses a CSS landscape-rotation fallback while the device remains physically portrait. **EXIT WORLD** requests orientation unlock and fullscreen exit, returning to the normal studio.

Mobile browser support varies; orientation locking is not universally available, especially in iOS browser contexts. The fallback is therefore part of the design, not a guarantee that the operating system itself rotates.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD / arrow keys | Direction pad |
| Look | Drag on game view | Drag on game view |
| Jump | Space | JUMP |
| Run | Shift | Hold RUN |
| Pick up / drop | PICK UP button | PICK UP / DROP |

## Evidence and limitations

- The photo-derived relief is built from relative depth; it is not a surveyed metric mesh.
- Detected object cards use segmentation crops and proxy colliders. Their backs, interiors, mass and exact dimensions are not recovered from one photograph.
- Physics behavior is simulated locally in the browser; it is not a real-world engineering simulation.
- Stage 6 currently plays the active scan. A future scene-linking workflow is needed to merge multiple saved scans into one continuous map.

## Verification

CI validates TypeScript, unit tests, local Python syntax and the production Vite build. Real-device checks are still needed for iOS Safari fullscreen/orientation behavior, touch ergonomics and GPU performance.