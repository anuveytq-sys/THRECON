# Stage 5 — Spatial Intelligence

Stage 5 adds a separate spatial workspace that consumes the existing Stage 2 segmentation masks and relative-depth output. It does not replace or modify the scanner, Spatial Lab, Stage 3 reconstruction, or Stage 4 world-completion workspaces.

## Browser workspace

Select **Spatial Intelligence · Stage 05** in the left navigation after running Stage 2 Visual Analysis.

### Semantic object inventory
- Uses the existing DETR panoptic labels, confidence scores and pixel masks.
- Derives normalized image-space bounding boxes and visible mask area for up to 24 regions.
- Gives each region a stable Stage 5 object ID for this generated scene graph.
- Allows selection from either the relationship map or object list.

### Spatial relationship graph
- Estimates left/right and above/below relations from visible mask bounds.
- Identifies substantial 2D bounding-box overlap.
- Compares normalized depth response between regions without assuming its polarity is calibrated to metric near/far distance.
- Shows relationship strength as a heuristic, not a calibrated probability.
- Rebuilds relationships from the edited graph state as object bounds move or scale.

### Dimensions and scale
- Displays normalized image width, height, mask area and relative depth response.
- Does not invent centimetres or metres.
- Metric measurements require camera calibration, a depth sensor, multiple-view geometry, or a known reference dimension.

### Local natural-language command engine
The browser includes a deterministic local intent parser. It does not require a cloud LLM or API key.

Supported commands include:
- `rename chair to reading chair`
- `move chair left`, `move right`, `move forward`, `move back`
- `make bigger`, `make smaller`
- `hide`, `show`
- `reset position`
- `undo`

Select an object first, or include its detected label in the command. The parser deliberately reports unsupported or ambiguous commands rather than pretending an action succeeded. Commands edit the Stage 5 spatial proxy/graph; they do not modify the original photograph or claim to deform the Stage 3 reconstructed mesh.

### SceneIR export
Exports object identities, labels, normalized bounds, relative-depth responses, editable proxy transforms, visibility, relationships and provenance warnings as JSON.

## Local backend API

The optional FastAPI service now exposes:

- `POST /v1/spatial/relationships`

Example request:

~~~json
{
  "objects": [
    {"id": "region-01", "label": "chair", "bbox": [0.1, 0.2, 0.25, 0.5], "depth_response": 0.4, "confidence": 0.92},
    {"id": "region-02", "label": "table", "bbox": [0.45, 0.35, 0.4, 0.3], "depth_response": 0.6, "confidence": 0.88}
  ]
}
~~~

The response contains a versioned graph with image-plane relationships and depth-response ordering. The endpoint validates unique IDs and normalized bounding boxes. The browser workspace remains fully usable offline from the backend because it computes the same kind of deterministic graph locally.

## Evidence and limitations

- Object labels and masks are detector outputs, not guaranteed ground truth.
- Bounds and area are measured in image pixels then normalized.
- Depth is monocular relative output; response values are not physical distances.
- Relations are derived from visible 2D masks and estimated depth response; they are not a complete 3D scene understanding.
- The current intent engine supports a bounded command vocabulary. It is not a general-purpose conversational model.
- Scene edits apply to the Stage 5 spatial proxy graph. Full editable mesh deformation and physics-aware commands belong to later stages.

## Open-source foundations

Stage 5 reuses the existing browser stack and adds a small deterministic spatial-analysis backend rather than adding large incompatible runtime dependencies. The wider roadmap continues to identify VGGT, Depth Anything V2, SAM 2 and Nerfstudio as optional specialized model foundations. Review each model and dataset license before downloading, deploying or redistributing weights.
