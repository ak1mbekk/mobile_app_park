"""Render four basket-fill frames from the game's props. blender -b -P SCRIPT -- OUTPUT_DIR"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

repo = Path(__file__).resolve().parents[2]
output = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def load_prop(name, width, tilt=0.0):
    bpy.ops.import_scene.gltf(filepath=str(repo / "models/first-meeting" / (name + ".glb")))
    parts = list(bpy.context.selected_objects)
    root = bpy.data.objects.new(name, None)
    scene.collection.objects.link(root)
    for part in parts:
        if part.parent not in parts:
            part.parent = root
    root.rotation_euler.x = math.radians(tilt)
    bpy.context.view_layer.update()
    points = [part.matrix_world @ v.co for part in parts if part.type == "MESH" for v in part.data.vertices]
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    scale = width / (high.x - low.x)
    root.scale = (scale,) * 3
    root.location = -scale * Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    return root, parts


# The prop in the cottage rests on its side. Stand the same weave on its base.
load_prop("wicker-basket", 1.0, -78)
fruit = []
for x, y, z, width, turn in [
    (-0.16, 0.04, 0.54, 0.36, 0.2),
    (0.16, 0.01, 0.52, 0.34, -0.9),
    (0.01, 0.19, 0.65, 0.31, 1.8),
]:
    root, parts = load_prop("drag-apple", width)
    root.location += Vector((x, y, z))
    root.rotation_euler.z = turn
    fruit.append(parts)

camera = bpy.data.cameras.new("Harvest")
view = bpy.data.objects.new("Harvest", camera)
scene.collection.objects.link(view)
view.location = (0.1, -4, 2.55)
aim(view, (0, 0, 0.45))
camera.type, camera.ortho_scale = "ORTHO", 1.24
scene.camera = view
for name, pos, energy, size, color in [
    ("Morning", (-2.1, -3, 4.3), 310, 3, (1.0, 0.89, 0.72)),
    ("Sky", (2, -1, 2), 95, 3, (0.8, 0.9, 1.0)),
    ("Rim", (1, 2, 3), 160, 2, (1, 0.9, 0.69)),
]:
    lamp = bpy.data.lights.new(name, "AREA")
    lamp.energy, lamp.shape, lamp.size, lamp.color = energy, "DISK", size, color
    obj = bpy.data.objects.new(name, lamp)
    scene.collection.objects.link(obj)
    obj.location = pos
    aim(obj, (0, 0, 0.45))

scene.render.engine = "CYCLES"
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = 216, 216
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
for count in range(4):
    for index, parts in enumerate(fruit):
        for part in parts:
            part.hide_render = index >= count
    scene.render.filepath = str(output / f"basket-{count}.png")
    bpy.ops.render.render(write_still=True)
