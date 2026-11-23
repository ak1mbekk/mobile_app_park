"""Make the three window seats. Run with Blender -b -t 6 -P art-source/cabin/bed_collection.py.

Blender +Y points to the window (Godot -Z). One unit is a metre. Meshes, palette and
woven patterns are authored here. The source .blend retains each part and packed maps.
"""
import shutil
import sys
from math import cos, pi, sin, tau
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
import numpy as np
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from bath_collection import (FURNITURE, ROOT, SHOP, SOURCE, WEB, camera_and_lights,
                             grid, knob, material, mesh, rgb, studio_floor, tube, turned)


def fabric(name, color, folder, pattern="linen"):
    """A tileable two-ply weave baked into a compact sRGB map; the middle of the seat stays clear."""
    mat = material(name, color, rough=.79)
    x, y = grid(256, 256)
    tone = .035*np.cos(tau*64*x) + .041*np.cos(tau*64*y)*np.cos(tau*32*x)
    tone += .013*np.sin(tau*(13*x+7*y)) + .01*np.sin(tau*(7*x-5*y))
    if pattern == "check":
        tone += .09*((x % .25 < .055).astype(float)+(y % .25 < .055).astype(float))
        tone -= .04*((x % .25 < .012).astype(float)+(y % .25 < .012).astype(float))
    if pattern == "oak":
        phase = y + .009*np.sin(tau*(2*x+y)) + .006*np.cos(tau*(x-3*y))
        tone = .064*np.sin(tau*13*phase)+.028*np.sin(tau*35*phase)+.013*np.cos(tau*(67*phase+x))
        distance = np.hypot((x-.36)/.19, (y-.53)/.055)
        tone += .046*np.cos(13*distance)*np.exp(-distance)
    colorfield = rgb(color)[None,None,:] + tone[:,:,None]
    pixels = np.ones((256,256,4), dtype=np.float32)
    pixels[:,:,:3] = np.clip(colorfield,0,1)
    image = bpy.data.images.new(name + " weave" if pattern != "oak" else name + " grain",256,256,alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    image.file_format = "PNG"
    image.filepath_raw = str(folder / (name + ".png"))
    image.save()
    image.pack()
    image.filepath_raw = "//" + name + ".png"
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"],mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    return mat


def unwrap(obj):
    """Planar grain runs along X on rails, along Z on posts and across linen on cushions."""
    uv = obj.data.uv_layers.new(name="Workshop weave")
    span = [max(v.co[n] for v in obj.data.vertices)-min(v.co[n] for v in obj.data.vertices) for n in range(3)]
    for face in obj.data.polygons:
        normal_axis = max(range(3),key=lambda n:abs(face.normal[n]))
        axes = [n for n in range(3) if n != normal_axis]
        axes.sort(key=lambda n:-span[n])
        for loop in face.loop_indices:
            p = obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv = (p[axes[0]]*2.2 + .37, p[axes[1]]*3.6 + .19)


def cushion(name, width, depth, bottom, top, mat, shape=3.8, x=0, y=0):
    """Rounded soft volume with a nearly level support area and rolled edge."""
    verts, faces = [], []
    count = 64
    for radial,h in ((.78,0),(.945,.05),(1,.31),(1,.59),(.965,.82),(.87,.965),(.66,1),(.34,1)):
        for i in range(count):
            a = tau*i/count
            verts.append((width*.5*radial*superaxis(cos(a),shape),depth*.5*radial*superaxis(sin(a),shape),
                          bottom+(top-bottom)*h))
    for row in range(7):
        for i in range(count):
            j=(i+1)%count
            faces.append((row*count+i,row*count+j,(row+1)*count+j,(row+1)*count+i))
    faces.extend((tuple(reversed(range(count))),tuple(range(7*count,8*count))))
    obj=mesh(name,verts,faces,[mat])
    obj.location=(x,y,0)
    unwrap(obj)
    return obj


def superaxis(n,shape):
    return (1 if n >= 0 else -1) * abs(n)**(2/shape)


def piping(name,width,depth,z,mat,shape=3.8,r=.005,x=0,y=0):
    pts=[(x+width*.5*superaxis(cos(a),shape),y+depth*.5*superaxis(sin(a),shape),z)
         for a in [tau*i/80 for i in range(80)]]
    return tube(name,pts,r,mat,True,sides=6)


def board(name, outline, cy, thickness, mat, bevel=.006):
    """A timber or upholstered panel extruded from its side elevation in the XZ plane."""
    count=len(outline)
    verts=[(x,cy+y,z) for y in (-thickness/2,thickness/2) for x,z in outline]
    faces=[tuple(range(count)),tuple(reversed(range(count,2*count)))]
    for i in range(count):
        j=(i+1)%count
        faces.append((i,i+count,j+count,j))
    obj=mesh(name,verts,faces,[mat])
    for p in obj.data.polygons:
        p.use_smooth=False
    bpy.context.view_layer.objects.active=obj
    edge=obj.modifiers.new("Rounded joinery","BEVEL")
    edge.width=bevel
    edge.segments=3
    bpy.ops.object.modifier_apply(modifier=edge.name)
    normals=obj.modifiers.new("Broad flat faces","WEIGHTED_NORMAL")
    bpy.ops.object.modifier_apply(modifier=normals.name)
    unwrap(obj)
    return obj


def willow(folder):
    straw=[material("Braided willow "+n,c,rough=.67) for n,c in
           (("saffron","c7924e"),("amber","ab723f"),("sunlit bark","d6a965"),("russet","98623c"))]
    ticking=fabric("Sage checked ticking","a7aa87",folder,"check")
    cream=material("Oatmeal piping","e6d4aa",rough=.82)
    cushion("Firm basket bottom",.67,.46,.009,.061,straw[1],shape=2.7)
    cushion("Sage checked duck feather pad",.705,.50,.042,.102,ticking,shape=2.7)
    piping("Double sewn ticking edge",.696,.495,.071,cream,2.7)
    # At the foot the wall dips to ease entry. Individual stakes pass alternately
    # inside and outside each weaver, including at the two short ends.
    def point(a,t,delta=0):
        h=.123+.052*sin(a)+.016*cos(2*a)
        return ((.35+.043*t+delta)*superaxis(cos(a),2.65),
                (.248+.042*t+delta)*superaxis(sin(a),2.65),.014+t*h)
    for i in range(36):
        a=tau*i/36
        pts=[point(a,j/8) for j in range(9)]
        tube("Split upright %02d"%i,pts,.0066,straw[(i+1)%3],sides=6)
    for row in range(9):
        t=(row+.38)/9.2
        pts=[point(a,t,.0058*cos(18*a+row*pi)) for a in [tau*i/144 for i in range(144)]]
        tube("Alternating wicker course %02d"%row,pts,.0078,straw[row%4],True,sides=6)
    for braid in range(2):
        pts=[]
        for i in range(216):
            a=tau*i/216
            px,py,pz=point(a,1,.0054*cos(36*a+pi*braid))
            pts.append((px,py,pz+.0054*sin(36*a+pi*braid)))
        tube("Twisted rim %d"%braid,pts,.0067,straw[2*braid],True,sides=6)


def feet(width,depth,z,wood,accent):
    for x in (-width/2,width/2):
        for y in (-depth/2,depth/2):
            turned("Turned hardwood foot",[(.026,0),(.029,.009),(.023,.021),(.021,.034),
                (.032,z*.53),(.037,z*.63),(.034,z*.72),(.031,z*.8),(.035,z)],wood,x,y,segments=16)
            turned("Foot collar",[(.033,z*.66),(.035,z*.69),(.034,z*.73)],accent,x,y,segments=16)


def spindle(name,x,y,low,high,mat):
    shape=((.015,0),(.022,.02),(.021,.11),(.011,.18),(.009,.32),(.018,.44),(.021,.49),
           (.018,.54),(.01,.66),(.011,.79),(.020,.87),(.021,.99),(.017,1))
    return turned(name,[(r,low+(high-low)*t) for r,t in shape],mat,x,y,segments=14)


def pillow(name,center,width,height,cloth,edge,stitch):
    """Soft back pillow with piped welt and a red, eight-pointed flax-flower embroidery."""
    from mathutils import Euler
    rot=Euler((1.16,-.10,-.14)).to_matrix()
    parts=[]
    body=cushion(name,width,height,-.036,.038,cloth,3.1)
    parts.append(body)
    parts.append(piping("Linen cord on "+name,width*.993,height*.995,0,edge,3.1,r=.0033))
    for k in range(8):
        a=tau*k/8+pi/8
        pts=[]
        for along,across in ((.008,0),(.035,.009),(.060,0),(.035,-.009),(.008,0)):
            pts.append((along*cos(a)-across*sin(a),along*sin(a)+across*cos(a),.039))
        parts.append(tube("Embroidered flax petal",pts,.0029,stitch,sides=5))
    for part in parts:
        part.rotation_euler=rot.to_euler()
        part.location=center


def oak(folder):
    oakwood=fabric("Oiled quarter-sawn oak","915d36",folder,"oak")
    honey=fabric("Carved oak highlights","b17b48",folder,"oak")
    pale=fabric("Oatmeal embroidered linen","dbc6a2",folder)
    warm=fabric("Madder cushion cover","ac6552",folder)
    berry=material("Cranberry needlework","973f3a",rough=.84)
    inlay=material("Wheat chip-carving","d7aa69",rough=.6)
    feet(.93,.47,.14,oakwood,honey)
    cushion("Rounded seat frame",1.065,.592,.111,.176,oakwood,shape=8)
    cushion("Terracotta linen mattress",.955,.541,.157,.229,warm,shape=5)
    piping("Twisted flax mattress edge",.952,.54,.184,pale,5,r=.0056)
    # Through-cut scallops leave an airy, unmistakably timber silhouette.
    crown=[(-.515,.390),(-.515,.460),(-.467,.473),(-.410,.464),(-.34,.478),(-.28,.497),
           (-.21,.504),(-.156,.489),(-.104,.503),(-.044,.539),(0,.548),(.044,.539),(.104,.503),
           (.156,.489),(.21,.504),(.28,.497),(.34,.478),(.410,.464),(.467,.473),(.515,.46),(.515,.39)]
    board("Scalloped oak crest",list(reversed(crown)),.255,.054,honey)
    for i,x in enumerate((-.472,-.37,-.267,-.16,0,.16,.267,.37,.472)):
        spindle("Hand-turned gallery spindle %d"%i,x,.255,.16,.412,oakwood)
    for side in (-1,1):
        x=side*.508
        turned("Front arm post",[(.031,.128),(.03,.20),(.022,.24),(.019,.276),(.028,.300),(.030,.312)],
               oakwood,x,-.208,segments=18)
        for y in (-.10,.012,.13):
            spindle("Side gallery baluster",x,y,.166,.299+.092*(y+.10),honey)
        rail=[(x,-.226+.49*i/20,.313+.084*(i/20)**1.5) for i in range(21)]
        tube("Polished continuous arm rail",rail,.022,honey,sides=12)
    # Eye-shaped facets radiate from a central cut circle on the crown.
    for k in range(8):
        a=tau*k/8
        p=[]
        for length,offset in ((.004,0),(.023,.006),(.043,0),(.023,-.006)):
            p.append((length*cos(a)-offset*sin(a),.225,.468+length*sin(a)+offset*cos(a)))
        petal=mesh("Eight-petal chip carving",p,[(0,1,2,3)],[inlay])
        petal.data.polygons[0].use_smooth=False
    pillow("Flax-flower pillow",(.293,.152,.304),.228,.202,pale,inlay,berry)


def daybed(folder):
    blue=fabric("Blueberry brushed wool","456182",folder)
    denim=fabric("Midnight blue upholstery","354e70",folder)
    flax=fabric("Undyed flax","d7c6a8",folder)
    red=material("Lingonberry velvet cord","a34d61",rough=.7)
    warm=fabric("Smoked birch rails","845535",folder,"oak")
    brass=material("Patinated brass","b69254",metal=.44,rough=.44)
    feet(.955,.47,.134,warm,brass)
    cushion("Polished timber plinth",1.093,.61,.099,.158,warm,shape=8)
    cushion("Berry blue upholstered apron",1.078,.592,.132,.205,denim,shape=6)
    cushion("Blueberry seat cushion",.986,.542,.179,.255,blue,shape=4.2,y=-.012)
    piping("Cranberry welt on seat",.983,.541,.212,red,4.2,r=.007,y=-.012)
    # A fan of individual padded channels follows the arch and catches light at phone scale.
    def crown(x):
        return .605-.120*(abs(x)/.522)**1.65
    profile=[(-.526,.177),(.526,.177)]
    profile += [(x,crown(x)) for x in np.linspace(.526,-.526,39)]
    board("Arched back underlay",profile,.256,.075,denim,bevel=.016)
    for i in range(9):
        x=(i-4)*.111
        pad=[(x-.055,.215),(x+.055,.215),(x+.055,crown(x+.055)-.018),
             (x+.024,crown(x+.024)-.007),(x-.024,crown(x-.024)-.007),(x-.055,crown(x-.055)-.018)]
        board("Upholstered back channel %02d"%i,pad,.212,.066,blue,bevel=.018)
        if i%2==0 and i not in (0,8):
            knob("Fabric-covered button",(x,.176,.427),(.011,.008,.011),denim)
    crest=[(x,.204,crown(x)) for x in np.linspace(-.52,.52,55)]
    tube("Berry cord on the arched back",crest,.008,red,sides=8)
    for side in (-1,1):
        x=.506*side
        # Serpentine sides rise smoothly from the front scroll to meet the back.
        span=[(-.251,.174),(.279,.174),(.279,.493),(.231,.516),(.161,.483),(.105,.423),
              (.033,.370),(-.078,.335),(-.167,.344),(-.22,.365),(-.249,.357),(-.268,.321)]
        arm=board("Sculpted upholstered wing",span,0,.087,blue,.020)
        arm.rotation_euler.z=pi/2
        arm.location.x=x
        rail=[(x,y,z) for y,z in reversed(span[3:])]
        tube("Berry wing welt",rail,.007,red,sides=8)
    pillow("Flax cushion",(-.32,.137,.347),.207,.192,flax,flax,red)


def portrait(key,maker,folder):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    maker(folder)
    camera=camera_and_lights()
    scene=bpy.context.scene
    props=[obj for obj in scene.objects if obj.type=="MESH"]
    # The wider camera on the two settlements shows their sides and the aperture beneath each seat.
    camera.location=(1.04,-2.21,1.16 if key=="willow" else 1.09)
    center=Vector((0,0,{"willow":.082,"oak":.238,"daybed":.274}[key]))
    camera.rotation_euler=(center-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.shift_y=0
    camera.data.ortho_scale={"willow":.92,"oak":1.31,"daybed":1.33}[key]
    scene.render.resolution_x=410
    scene.render.resolution_y=330
    scene.render.image_settings.quality=90
    scene.render.film_transparent=True
    scene.render.image_settings.color_mode="RGBA"
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/("bed-"+key+".blend")),compress=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in props:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=props[0]
    bpy.ops.object.join()
    prop=bpy.context.object
    prop.name="Window seat - "+key
    # Bake root transforms into the mesh so the Godot import has an unscaled floor origin.
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    target=FURNITURE/("bed-"+key+".glb")
    bpy.ops.export_scene.gltf(filepath=str(target),export_format="GLB",use_selection=True,
        export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
    shutil.copyfile(target,ROOT/"models/home"/target.name)
    scene.render.filepath=str(WEB/("room-bed-"+key+".webp"))
    bpy.ops.render.render(write_still=True)
    studio_floor()
    scene.render.film_transparent=False
    scene.render.image_settings.color_mode="RGB"
    scene.render.resolution_x=318
    scene.render.resolution_y=360
    camera.data.ortho_scale *= 1.23
    scene.render.filepath=str(SHOP/("shop-bed-"+key+".webp"))
    bpy.ops.render.render(write_still=True)
    shutil.copyfile(scene.render.filepath,WEB/Path(scene.render.filepath).name)


if __name__=="__main__":
    scratch = ROOT / ".tmp"
    scratch.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=scratch) as directory:
        for key,maker in (("willow",willow),("oak",oak),("daybed",daybed)):
            portrait(key,maker,Path(directory))
