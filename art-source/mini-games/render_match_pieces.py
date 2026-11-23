"""Render individual pieces from the shipped orchard models. Run with Blender -b -P."""
from pathlib import Path
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
output = root / ".tmp" / "orchard-pieces"
output.mkdir(parents=True, exist_ok=True)

for index, name in enumerate(("raspberry", "pear", "apple", "hazelnut", "plum")):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root / "models/match-three" / (name + ".glb")))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    corners = [obj.matrix_world @ Vector(p) for obj in meshes for p in obj.bound_box]
    center = Vector([(min(p[i] for p in corners) + max(p[i] for p in corners))/2 for i in range(3)])
    extent = max(max(p[i] for p in corners) - min(p[i] for p in corners) for i in range(3))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("Soft daylight")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .72
    for direction, strength, diameter in [((-2,-3,4),330,3), ((2,1,3),135,2)]:
        bpy.ops.object.light_add(type="AREA",location=center + Vector(direction)*extent)
        light = bpy.context.object
        light.rotation_euler = (center-light.location).to_track_quat("-Z","Y").to_euler()
        light.data.energy = strength * extent**2
        light.data.size = diameter * extent
    bpy.ops.object.camera_add(location=center+Vector((.28,-2.8,1.6))*extent)
    camera=bpy.context.object
    camera.rotation_euler=(center-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type="ORTHO"
    camera.data.ortho_scale=1.36*extent
    camera.data.clip_start=.001
    scene.camera=camera
    scene.render.filepath=str(output / f"piece-{index}.png")
    bpy.ops.render.render(write_still=True)

