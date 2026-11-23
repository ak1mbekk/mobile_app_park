"""Build the veranda cushion using the embroidered face shown in its shop card."""
from pathlib import Path
from math import sin, pi
import bpy
import numpy as np

root = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
photo = bpy.data.images.load(str(root / "public/demo/assets/shop-cushion.webp"))
# Blender may otherwise embed WebP bytes under a JPEG MIME type.
from tempfile import TemporaryDirectory
work = TemporaryDirectory()
png = str(Path(work.name) / "Embroidered flax.png")
bpy.context.scene.view_settings.view_transform = "Standard"
bpy.context.scene.render.image_settings.file_format = "PNG"
photo.save_render(png, scene=bpy.context.scene)
photo = bpy.data.images.load(png)
W, H = photo.size
pixels = np.empty(W*H*4, dtype=np.float32)
photo.pixels.foreach_get(pixels)
alpha = pixels.reshape(H,W,4)[:,:,3]
front = bpy.data.materials.new("Flax and madder cross stitch")
front.use_nodes=True
nodes=front.node_tree.nodes
cloth=nodes.get("Principled BSDF")
cloth.inputs["Roughness"].default_value=.94
image=nodes.new("ShaderNodeTexImage")
image.image=photo
front.node_tree.links.new(image.outputs["Color"],cloth.inputs["Base Color"])
back=bpy.data.materials.new("Unbleached linen underside")
back.diffuse_color=(.54,.35,.19,1)
n=30
verts=[]
coords=[]
faces=[]
mats=[]
for side in (1,-1):
    for j in range(n+1):
        v=.025+.95*j/n
        row=np.flatnonzero(alpha[round(v*(H-1))]>.85)
        left,right=(row[0]+1)/W,(row[-1]-1)/W
        for i in range(n+1):
            u=left+(right-left)*i/n
            dome=(max(0,sin(pi*i/n)*sin(pi*j/n)))**.54
            verts.append(((u-.5)*.34,(v-.5)*.30,side*(.003+.045*dome)))
            coords.append((u,v))
    start=0 if side==1 else (n+1)**2
    for j in range(n):
        for i in range(n):
            k=start+j*(n+1)+i
            quad=(k,k+1,k+n+2,k+n+1)
            faces.append(quad if side==1 else quad[::-1])
            mats.append(0 if side==1 else 1)
rim=list(range(n+1))+[j*(n+1)+n for j in range(1,n+1)]+[n*(n+1)+i for i in range(n-1,-1,-1)]+[j*(n+1) for j in range(n-1,0,-1)]
offset=(n+1)**2
for i,k in enumerate(rim):
    end=rim[(i+1)%len(rim)]
    faces.append((k,k+offset,end+offset,end))
    mats.append(1)
mesh=bpy.data.meshes.new("Sewn envelope")
mesh.from_pydata(verts,[],faces)
mesh.materials.append(front)
mesh.materials.append(back)
uv=mesh.uv_layers.new(name="Embroidered face")
for poly,mat in zip(mesh.polygons,mats):
    poly.material_index=mat
    poly.use_smooth=True
    for loop in poly.loop_indices:
        uv.data[loop].uv=coords[mesh.loops[loop].vertex_index]
obj=bpy.data.objects.new("Embroidered linen cushion",mesh)
bpy.context.collection.objects.link(obj)
target=root / "Godot/Art/TrailHouse/Furniture/embroidered-cushion.glb"
bpy.ops.export_scene.gltf(filepath=str(target),export_image_format="AUTO")

