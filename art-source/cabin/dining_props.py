"""Author the dining accessories. Origin is the grip or the collar in all exports."""
import json
import math
import struct
import tempfile
from pathlib import Path
import bpy

out = Path(__file__).resolve().parents[2]/"Godot/Art/TrailHouse/Dining"
out.mkdir(parents=True, exist_ok=True)


def paint(name, rgb, metallic=0, roughness=.65):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*rgb,1)
    mat.use_nodes=True
    shader=mat.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value=(*rgb,1)
    shader.inputs["Roughness"].default_value=roughness
    shader.inputs["Metallic"].default_value=metallic
    return mat


def surface(name, vertices, faces, material):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    for f in mesh.polygons:
        f.use_smooth=True
    return obj


def use_cabin_texture(obj, reference, image_name, uv_scale):
    """Reuse the actual cabin linen and timber. The tiny embedded texture travels with the prop."""
    path = Path(__file__).resolve().parents[2] / "models/first-meeting" / (reference + ".glb")
    glb = path.read_bytes()
    json_size = struct.unpack_from("<I", glb, 12)[0]
    document = json.loads(glb[20:20 + json_size])
    image = next(item for item in document["images"] if item["name"] == image_name)
    view = document["bufferViews"][image["bufferView"]]
    start = 28 + json_size + view.get("byteOffset", 0)
    with tempfile.TemporaryDirectory() as temp:
        source = Path(temp) / "surface.png"
        source.write_bytes(glb[start:start + view["byteLength"]])
        tile = bpy.data.images.load(str(source))
        tile.name = image_name
        tile.scale(128, 128)
        tile.filepath_raw = str(Path(temp) / "dining-tile.png")
        tile.file_format = "PNG"
        tile.save()
        tile.pack()
    material = obj.data.materials[0]
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = tile
    material.node_tree.links.new(texture.outputs["Color"], material.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    uv = obj.data.uv_layers.new(name="Surface")
    for loop in obj.data.loops:
        p = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (p.x * uv_scale[0], p.z * uv_scale[1])


def line(name, points, r, mat):
    data=bpy.data.curves.new(name,"CURVE")
    data.dimensions="3D"
    data.bevel_depth=r
    data.bevel_resolution=2
    data.resolution_u=2
    data.use_fill_caps=True
    spline=data.splines.new("POLY")
    spline.points.add(len(points)-1)
    for node,co in zip(spline.points,points):node.co=(*co,1)
    obj=bpy.data.objects.new(name,data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)


def handle(name, rings, mat, sides=12):
    verts,faces=[],[]
    for z,w,d,cy in rings:
        for i in range(sides):
            a=2*math.pi*i/sides
            verts.append((w*math.cos(a),cy+d*math.sin(a),z))
    for j in range(len(rings)-1):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(len(verts)-sides,len(verts))))
    return surface(name,verts,faces,mat)


def utensil(key):
    wood=paint("Точёная ручка · морёная берёза",(.37,.16,.073))
    metal=paint("Матовая сталь",(.55,.65,.66),.64,.28)
    grip = handle("Берёзовая рукоять",[(-.108,.005,.004,0),(-.103,.019,.013,0),(-.085,.023,.015,0),
           (.045,.015,.012,0),(.075,.013,.010,0)],wood)
    use_cabin_texture(grip, "bench", "Bench Honey oak-albedo", (3, 3))
    handle("Шейка",[(.062,.014,.010,0),(.078,.014,.010,0),(.086,.010,.005,0),(.139,.013,.005,0)],metal)
    if key=="spoon":
        n=28; rings=7; verts=[(0,.020,.184)]; faces=[]
        for j in range(1,rings+1):
            r=j/rings
            for i in range(n):
                a=2*math.pi*i/n
                verts.append((.045*r*math.cos(a)*(1+.13*r*math.sin(a)),.020*(1-r*r),.184+.062*r*math.sin(a)))
        for i in range(n): faces.append((0,1+i,1+(i+1)%n))
        for j in range(rings-1):
            for i in range(n):
                a=1+j*n+i;b=1+j*n+(i+1)%n
                faces.append((a,a+n,b+n,b))
        bowl=surface("Чашечка ложки",verts,faces,metal)
        mod=bowl.modifiers.new("Толщина края","SOLIDIFY");mod.thickness=.003
    else:
        handle("Плечики вилки",[(.122,.012,.005,0),(.142,.033,.006,-.001),(.166,.037,.006,-.004)],metal)
        for i,x in enumerate((-.028,-.0095,.0095,.028)):
            z=.232 if i in (0,3) else .239
            prong=handle("Закруглённый зубец",[(.158,.0075,.0045,-.004),(.178,.0065,.004,-.007),
                         (z-.006,.004,.003,-.014),(z,.002,.0018,-.014)],metal,8)
            prong.location.x=x


def bib():
    linen=paint("Молочный лён",(.83,.70,.47),roughness=.96)
    piping=paint("Тесьма · клюква",(.36,.055,.043),roughness=.85)
    warp=paint("Небелёная нить",(.72,.49,.28))
    rows=[(0,.091),(-.029,.149),(-.078,.165),(-.15,.169),(-.225,.164),(-.285,.141),(-.316,.079),(-.324,.012)]
    def coord(x,z,width):
        return (x,-.057*math.sin(math.pi*min(1,-z/.34))+.052*(x/width)**2,z)
    verts=[]; faces=[]; cols=13
    for j,(z,width) in enumerate(rows):
        for i in range(cols):
            verts.append(coord(width*(i/(cols-1)*2-1),z,width))
            if j and i:
                a=j*cols+i;faces.append((a-cols-1,a-1,a,a-cols))
    piece=surface("Нагрудник",verts,faces,linen)
    use_cabin_texture(piece, "bench-runner", "Unbleached flax fringe-albedo", (5, 5))
    mod=piece.modifiers.new("Двойной лён","SOLIDIFY");mod.thickness=.004
    contour=[verts[i*cols] for i in range(len(rows))]+list(reversed([verts[(i+1)*cols-1] for i in range(len(rows))]))
    line("Обтачка",contour+[contour[0]],.004,piping)
    for cx in [-.072,0,.072]:
        line("Вышитый ромб",[(cx+dx,-.062,z) for dx,z in [(0,-.196),(.022,-.218),(0,-.241),(-.022,-.218),(0,-.196)]],.0035,piping)
    for x in [-.115,-.061,-.007,.047,.101]:
        line("Стежок",[(x,-.05,-.268),(x+.021,-.05,-.268)],.0025,warp)
    for sign in [-1,1]:
        line("Льняная завязка",[(sign*.086,.042,-.001),(sign*.125,.098,.019),(sign*.114,.170,.045),
             (sign*.06,.199,.034)],.009,linen)


for name in ["bib","spoon","fork"]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if name=="bib":bib()
    else:utensil(name)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active=next(iter(bpy.context.selected_objects))
    bpy.ops.object.convert(target="MESH")
    bpy.ops.export_scene.gltf(filepath=str(out/(name+".glb")), export_format="GLB",
                              use_selection=True,export_apply=True,export_animations=False)
