"""Render the three mobile room studies from the project's actual textured GLBs.

blender -b -P art-source/cabin/render_rooms.py -- OUTPUT_DIRECTORY [home|kitchen|wash] [draft]
blender -b -t 8 -P art-source/cabin/render_rooms.py -- OUTPUT_DIRECTORY finishes

The finishes preset writes the nine browser backgrounds as 540 × 960 PNGs.
To render only a named frame, append its filename without the extension.
The web copies use RGB WebP (Pillow quality=85, method=6).
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

project = Path(__file__).resolve().parents[2]
assets = {path.stem: path for path in (project / "models").rglob("*.glb")}
assets["richi"] = project / "Godot/Art/Characters/Richi.glb"
args = sys.argv[sys.argv.index("--") + 1:]
destination = Path(args[0]).resolve()
destination.mkdir(parents=True, exist_ok=True)
draft = "draft" in args
clean = "clean" in args


def aim(obj, at):
    obj.rotation_euler = (Vector(at) - obj.location).to_track_quat("-Z", "Y").to_euler()


def light(name, location, at, energy, size, tint):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.size, data.color = energy, size, tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(lamp)
    lamp.location = location
    aim(lamp, at)


def prop(key, xy, base, *, width=None, dims=None, height=None, angle=0, pose=None):
    scene = bpy.context.scene
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(assets[key]))
    items = set(scene.objects) - before
    if pose:
        rig = next(o for o in items if o.type == "ARMATURE")
        data = rig.animation_data
        action = next((a for a in bpy.data.actions if a.name == pose or a.name.startswith(pose + "_")), None)
        if not action:
            raise ValueError(f"Pose {pose} unavailable: {[a.name for a in bpy.data.actions]}")
        for track in data.nla_tracks:
            track.mute = True
        data.action = action
        if action.slots:
            data.action_slot = action.slots[0]
    scene.frame_set((24 if pose=="Eat_Apple" else 12) if pose else scene.frame_current)
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in items:
        if obj.type == "MESH" and (not pose or obj.name.startswith("output_unwrapped")):
            evaluated = obj.evaluated_get(graph)
            if pose:
                points.extend(evaluated.matrix_world @ v.co for v in evaluated.data.vertices)
            else:
                points.extend(evaluated.matrix_world @ Vector(c) for c in evaluated.bound_box)
    low = Vector([min(v[i] for v in points) for i in range(3)])
    high = Vector([max(v[i] for v in points) for i in range(3)])
    span = high - low
    pivot = Vector(((low.x + high.x)/2, (low.y + high.y)/2, low.z))
    if dims:
        scale = Vector([dims[i]/max(span[i], .00001) for i in range(3)])
    else:
        factor = width/span.x if width else height/span.z
        scale = Vector((factor, factor, factor))
    root = bpy.data.objects.new(key + " · placement", None)
    scene.collection.objects.link(root)
    # Everything within an imported GLB retains its hierarchy, skeleton and materials.
    for obj in items:
        if obj.parent not in items:
            obj.parent = root
    root.scale = scale
    root.rotation_euler.z = math.radians(angle)
    root.location = Vector((*xy, base)) - root.rotation_euler.to_matrix() @ (scale * pivot)
    if pose=="Eat_Apple":
        bpy.context.view_layer.update()
        def placed(key, origin, orient, size):
            old=set(scene.objects)
            bpy.ops.import_scene.gltf(filepath=str(project/"Godot/Art/TrailHouse/Dining"/(key+".glb")))
            new=set(scene.objects)-old
            placement = (Matrix.Translation(origin) @ root.rotation_euler.to_matrix().to_4x4() @
                         Euler(tuple(math.radians(v) for v in orient)).to_matrix().to_4x4() @
                         Matrix.Scale(scale.x*size,4))
            for part in new:
                if part.parent not in new:
                    part.matrix_world=placement @ part.matrix_world
        def bone(name):
            return rig.matrix_world @ rig.pose.bones["mixamorig:"+name].head
        placed("bib",bone("Neck")+root.matrix_world.to_3x3()@Vector((0,-.31,-.055)),(-12,0,0),1.23)
        for key,hand,angle_y in [("fork","LeftHand",26),("spoon","RightHand",-25)]:
            grip=bone(hand).lerp(bone(hand+"Middle1"),.91)
            placed(key,grip,(10,angle_y,0),1.15)
    return base + span.z * scale.z


def window_view(x, y, z, width, height):
    bpy.ops.mesh.primitive_plane_add(location=(x,y,z), rotation=(math.pi/2,0,0))
    pane = bpy.context.object
    pane.name = "Берёзовая тропа за окном"
    pane.scale = (width/2,height/2,1)
    mat = bpy.data.materials.new("Берёзовая тропа")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    img = nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(str(project/"Godot/Art/Textures/BirchTrail.jpg"), check_existing=True)
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = .83
    links.new(img.outputs["Color"], emit.inputs[0])
    links.new(emit.outputs[0], nodes.get("Material Output").inputs["Surface"])
    pane.data.materials.append(mat)


def close_window_joint(side):
    jamb = bpy.data.objects[side + " jamb"]
    bpy.context.view_layer.update()
    corners = [jamb.matrix_world @ Vector(point) for point in jamb.bound_box]
    low = Vector([min(point[i] for point in corners) for i in range(3)])
    high = Vector([max(point[i] for point in corners) for i in range(3)])
    edge_x = high.x + .014 if side == "Right" else low.x - .014
    bpy.ops.mesh.primitive_cube_add(size=1, location=(edge_x, low.y + .049, (low.z + high.z) / 2))
    trim = bpy.context.object
    trim.name = side + " · дубовый наличник"
    trim.scale = (.057, .100, high.z - low.z + .037)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = trim.modifiers.new("Кромка наличника", "BEVEL")
    bevel.width, bevel.segments = .009, 3
    trim.modifiers.new("Нормали", "WEIGHTED_NORMAL")
    trim.data.materials.append(jamb.data.materials[0])


def solid_material(name, color, roughness, metallic=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


def wall_plane(name, center, width, height):
    bpy.ops.mesh.primitive_plane_add(location=center, rotation=(math.pi / 2, 0, 0))
    panel = bpy.context.object
    panel.name = name
    panel.scale = (width / 2, height / 2, 1)
    return panel


def kitchen_timber_backing():
    backing = wall_plane("Деревянная подложка за венцами", (0, 1.548, 1.62), 4.96, 3.28)
    backing.data.materials.append(solid_material("Натуральная древесина в стыке", (.21, .088, .036), .88))


def finish_plane(texture, name, center, dimensions, repeat, roughness):
    panel = wall_plane(name, center, *dimensions)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    texture_node = nodes.new("ShaderNodeTexImage")
    texture_node.image = bpy.data.images.load(str(project / "Godot/Art/TrailHouse/Care" / texture), check_existing=True)
    uv = nodes.new("ShaderNodeTexCoord")
    tiling = nodes.new("ShaderNodeVectorMath")
    tiling.operation = "MULTIPLY"
    tiling.inputs[1].default_value = (*repeat, 1)
    links.new(uv.outputs["UV"], tiling.inputs[0])
    links.new(tiling.outputs[0], texture_node.inputs["Vector"])
    shader = nodes["Principled BSDF"]
    links.new(texture_node.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = roughness
    panel.data.materials.append(material)


def mint_cabinet():
    # Preserve the proportions and finishes of KitchenFixtures.tscn at the web camera's scale.
    corner_x, corner_y, scale = .53, 1.05, .80
    oak = solid_material("Натёртый дуб", (.25, .12, .051), .64)
    counter = solid_material("Каменная столешница", (.84, .77, .62), .66)
    mint = solid_material("Мятная краска", (.42, .62, .51), .80)
    brass = solid_material("Латунь", (.75, .64, .34), .36, .68)

    def part(name, position, size, material, bevel_width=.012):
        x, z, depth = position
        width, height, thickness = size
        location = (corner_x + x * scale, corner_y - depth * scale, z * scale)
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
        piece = bpy.context.object
        piece.name = name
        piece.scale = (width * scale, thickness * scale, height * scale)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel = piece.modifiers.new("Скругление кромки", "BEVEL")
        bevel.width, bevel.segments = bevel_width, 3
        piece.modifiers.new("Нормали", "WEIGHTED_NORMAL")
        piece.data.materials.append(material)

    part("Корпус", (0, .286, 0), (.493, .532, .33), oak)
    part("Столешница", (0, .571, .012), (.556, .055, .402), counter)
    for side in (-1, 1):
        part("Рама", (side * .12, .303, .177), (.226, .428, .038), mint)
        part("Филёнка", (side * .12, .303, .204), (.175, .352, .021), mint, .006)
        part("Ручка", (side * .047, .371, .233), (.021, .073, .020), brass, .008)


def stage(room, *, clean_scene=clean, finish="plain", filename=None, samples=24):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 5 if draft else samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.resolution_x, scene.render.resolution_y = (324,576) if draft else (540,960)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.world = bpy.data.worlds.new("Мягкий свет")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.72,.78,.9,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .28
    # Actual timber modules wrap round the three sets. All positions are in metres.
    for x in (-1.76,0,1.76):
        prop("floorboards",(x,-.8),-.08,dims=(1.76,5.7,.08))
    if room == "wash":
        bpy.ops.mesh.primitive_plane_add(location=(0,1.505,1.6),rotation=(math.pi/2,0,0))
        wall=bpy.context.object
        wall.name="Известковая штукатурка"
        wall.scale=(2.6,1.7,1)
        mat=bpy.data.materials.new("Серовато-зелёная известь")
        mat.use_nodes=True
        tex=mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image=bpy.data.images.load(str(project/"Godot/Art/Textures/Limewash.jpg"))
        mix=mat.node_tree.nodes.new("ShaderNodeMixRGB")
        mix.blend_type="MULTIPLY"
        mix.inputs[0].default_value=.68
        mix.inputs[2].default_value=(.39,.62,.54,1)
        mat.node_tree.links.new(tex.outputs[0],mix.inputs[1])
        mat.node_tree.links.new(mix.outputs[0],mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
        wall.data.materials.append(mat)
        prop("timber-wall",(0,1.44),0,dims=(4.7,.09,.69))
    else:
        for x in (-1.62,0,1.62):
            prop("timber-wall",(x,1.48),0,dims=(1.62,.09,3.25))
    if room == "kitchen":
        if finish in ("wallpaper", "furnished"):
            finish_plane("kitchen-wallpaper.png", "Обои кухни", (0, 1.424, 1.57), (4.65, 3.18), (14, 9), .88)
        else:
            kitchen_timber_backing()
    elif room == "wash" and finish == "tile":
        finish_plane("bath-tiles.png", "Плитка ванной", (0, 1.368, .435), (4.65, .87), (17, 3), .31)
    window_x = {"home":-.57,"kitchen":-.43,"wash":.48}[room]
    prop("window-with-curtains",(window_x,1.22),1.03,dims=(1.61,.21,1.35))
    window_view(window_x,1.335,1.70,1.43,1.19)
    if room == "kitchen":
        close_window_joint("Right")
        close_window_joint("Left")
    if room == "home":
        prop("fleece-bed",(-.43,.53),.002,width=.72,angle=12)
        prop("toy-chest",(.51,.53),.002,width=.54,angle=-12)
        if not clean_scene:prop("richi",(-.02,-.34),.004,height=.89,angle=-9,pose="Idle")
    elif room == "kitchen":
        if finish in ("cabinet", "furnished"):
            mint_cabinet()
        top = prop("bench",(-.44,.85),.002,width=1.18)
        prop("fruit-dish",(-.46,.84),top-.001,width=.47)
        prop("shelf-plants-and-jars",(.57,1.15),1.00,width=.69)
        prop("first-rug",(.13,-.13),.002,width=1.26,angle=-8)
        prop("bench",(.084,.062),.021,dims=(.47,.30,.134),angle=-9)
        prop("food-bowl",(-.10,-.54),.022,width=.34)
        if not clean_scene:prop("richi",(.08,-.08),.024,height=1.0,angle=-9,pose="Eat_Apple")
    else:
        prop("bath-chair-with-towel",(-.62,.61),.003,width=.48,angle=10)
        prop("wash-pitcher",(-.49,.68),.003,height=.29,angle=15)
        if not clean_scene:
            bath_tub()
            prop("richi",(-.35,-.42),.003,height=.85,angle=20,pose="Idle")
    loc = {"home":(.14,-4.05,1.42),"kitchen":(.16,-3.63,1.27),"wash":(-.24,-3.98,1.61)}[room]
    camera = bpy.data.objects.new("Портретная камера",bpy.data.cameras.new("Телефон"))
    scene.collection.objects.link(camera)
    scene.camera=camera
    camera.location=loc
    camera.data.lens=44
    camera.data.sensor_fit="VERTICAL"
    camera.data.sensor_height=32
    aim(camera,(0,.16,.80 if room=="kitchen" else .89))
    light("Свет от окна",(-1.6,.44,2.38),(0,-.42,.16),155,1.28,(1,.86,.68))
    light("Отражение пола",(.55,-2.4,2.0),(0,.27,.65),108,3.2,(.91,.93,1))
    light("Свет сквозь занавеску",(1.30,.42,2.65),(0,.12,.40),70,1.85,(1,.92,.80))
    scene.render.filepath=str(destination / ((filename or room) + ".png"))
    bpy.ops.render.render(write_still=True)


def bath_tub():
        top = prop("wooden-wash-tub",(.32,.32),.004,width=.96)
        bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.385,depth=.012,
                                          location=(.32,.32,top-.082))
        water=bpy.context.object
        water.name="Вода"
        mat=bpy.data.materials.new("Вода с отражением дерева")
        mat.use_nodes=True
        shader=mat.node_tree.nodes["Principled BSDF"]
        shader.inputs["Base Color"].default_value=(.11,.36,.32,1)
        shader.inputs["Roughness"].default_value=.17
        shader.inputs["Metallic"].default_value=.17
        water.data.materials.append(mat)
        prop("golden-sponge",(.51,.32),top-.08,width=.12)


if "finishes" in args:
    kitchen_variants = {
        "plain": ("kitchen-room", "kitchen-hungry"),
        "wallpaper": ("kitchen-wallpaper", "kitchen-wallpaper-hungry"),
        "cabinet": ("kitchen-cabinet", "kitchen-cabinet-hungry"),
        "furnished": ("kitchen-furnished", "kitchen-furnished-hungry"),
    }
    frames = {
        name: ("kitchen", finish, index == 0)
        for finish, names in kitchen_variants.items()
        for index, name in enumerate(names)
    }
    frames["wash-tile-room"] = ("wash", "tile", True)
    requested = set(args[1:]) - {"finishes", "draft"}
    if requested - frames.keys():
        raise ValueError("Unknown finish frame: " + ", ".join(sorted(requested - frames.keys())))
    for name, (room, finish, clean_scene) in frames.items():
        if not requested or name in requested:
            stage(room, clean_scene=clean_scene, finish=finish, filename=name, samples=10)
else:
    for room in ("home", "kitchen", "wash"):
        if len(args) == 1 or room in args or not any(name in args for name in ("home", "kitchen", "wash")):
            stage(room)
