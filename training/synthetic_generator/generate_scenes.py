"""Generate paired synthetic room renders for VIRTUAL ITG Stage 4.

Run with:
  blender -b --python training/synthetic_generator/generate_scenes.py -- --output ./synthetic-data --count 100 --seed 7

Each sample stores a complete scene, a camera RGB render, a second occluded render,
and metric Z / object-index passes. These are synthetic training assets, not a trained model.
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="./synthetic-data")
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--seed", type=int, default=7)
    return parser.parse_args(values)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def material(name, color, roughness=0.75):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1.0)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return mat


def cube(name, location, scale, mat, index):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.pass_index = index
    return obj


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def configure_passes(scene, folder):
    view_layer = bpy.context.view_layer
    view_layer.use_pass_z = True
    view_layer.use_pass_object_index = True
    scene.use_nodes = True
    tree = scene.node_tree
    tree.nodes.clear()
    render = tree.nodes.new("CompositorNodeRLayers")
    depth = tree.nodes.new("CompositorNodeOutputFile")
    depth.base_path = str(folder)
    depth.file_slots[0].path = "depth_"
    depth.format.file_format = "OPEN_EXR"
    depth.format.color_depth = "32"
    tree.links.new(render.outputs["Depth"], depth.inputs[0])
    labels = tree.nodes.new("CompositorNodeOutputFile")
    labels.base_path = str(folder)
    labels.file_slots[0].path = "object_index_"
    labels.format.file_format = "OPEN_EXR"
    labels.format.color_depth = "32"
    tree.links.new(render.outputs["IndexOB"], labels.inputs[0])


def render_sample(root, index, rng):
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.color_depth = "8"

    palette = [material("Surface_%02d" % i, (rng.uniform(.08, .8), rng.uniform(.08, .8), rng.uniform(.08, .8))) for i in range(8)]
    floor = cube("Room_Floor", (0, 0, -.12), (6, 6, .2), material("Floor", (.22, .27, .3)), 1)
    objects = [floor]
    for i in range(rng.randint(4, 9)):
        kind = rng.choice(("cube", "sphere", "cylinder"))
        x, y = rng.uniform(-2.2, 2.2), rng.uniform(-1.8, 1.8)
        width, height, depth = rng.uniform(.35, 1.1), rng.uniform(.4, 1.7), rng.uniform(.35, 1.0)
        idx = i + 2
        mat = rng.choice(palette)
        if kind == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=(x, y, height / 2))
            obj = bpy.context.object
            obj.scale = (width / 2, depth / 2, height / 2)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        elif kind == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1, depth=1, location=(x, y, height / 2))
            obj = bpy.context.object
            obj.dimensions = (width, depth, height)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        else:
            obj = cube("Object_%02d" % idx, (x, y, height / 2), (width, depth, height), mat, idx)
        obj.name = "Object_%02d_%s" % (idx, kind)
        obj.data.materials.append(mat)
        obj.pass_index = idx
        objects.append(obj)

    bpy.ops.object.camera_add(location=(rng.uniform(-5, 5), -rng.uniform(6, 9), rng.uniform(3, 5)))
    camera = bpy.context.object
    camera.data.lens = rng.uniform(32, 55)
    look_at(camera, (0, 0, .8))
    scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(0, -3, 6))
    light = bpy.context.object
    light.data.energy = 900
    light.data.shape = "DISK"
    light.data.size = 5
    look_at(light, (0, 0, 0))

    folder = root / ("scene_%06d" % index)
    folder.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(folder / "complete_rgb.png")
    configure_passes(scene, folder)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder / "ground_truth.blend"))
    bpy.ops.render.render(write_still=True)

    # Add a foreground occluder after saving the complete scene and render a paired view.
    occluder = cube("Synthetic_Occluder", (rng.uniform(-.6, .6), -2.3, rng.uniform(.7, 1.5)),
                    (rng.uniform(1.0, 2.0), .25, rng.uniform(1.0, 2.0)),
                    material("Occluder", (.08, .12, .17)), 99)
    scene.render.filepath = str(folder / "occluded_rgb.png")
    bpy.ops.render.render(write_still=True)
    with (folder / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump({
            "sample": index,
            "seed": rng.randint(0, 2**31 - 1),
            "complete_rgb": "complete_rgb.png",
            "occluded_rgb": "occluded_rgb.png",
            "depth_and_object_index": "EXR passes emitted by compositor",
            "ground_truth_scene": "ground_truth.blend",
            "object_count": len(objects) - 1,
            "occluder_present": True,
            "coordinate_units": "Blender units",
            "purpose": "paired visible/occluded synthetic scene completion training data"
        }, handle, indent=2)


def main():
    options = args()
    rng = random.Random(options.seed)
    root = Path(options.output).resolve()
    root.mkdir(parents=True, exist_ok=True)
    for index in range(max(1, options.count)):
        render_sample(root, index, rng)
        print("Generated scene %d/%d" % (index + 1, options.count))


if __name__ == "__main__":
    main()
