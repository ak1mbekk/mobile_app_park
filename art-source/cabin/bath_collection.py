"""Build the three workshop baths and render the shop and room WebPs with Blender 5.

Run with blender -b -t 6 -P art-source/cabin/bath_collection.py.
The water surface in Bathroom.tscn is circular, radius .505 at Y .304–.313.
The local origin for each asset is the floor at the centre of that water surface.
"""
from math import cos, sin, tau, pi
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil

import bpy
import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art-source/cabin"
FURNITURE = ROOT / "Godot/Art/TrailHouse/Furniture"
SHOP = ROOT / "Godot/Scenes/Shop/Art"
WEB = ROOT / "public/demo/assets"


def linear(value):
    return value / 12.92 if value < .04045 else ((value + .055) / 1.055) ** 2.4


def rgb(code):
    return np.array([int(code[i:i+2], 16) / 255 for i in (0, 2, 4)])


def material(name, color, metal=0, rough=.42):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = tuple(linear(v) for v in rgb(color)) + (1,)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    return mat


def texture(mat, name, colors, directory, normal=False):
    height, width = colors.shape[:2]
    tile = bpy.data.images.new(name, width=width, height=height, alpha=False)
    if normal:
        tile.colorspace_settings.name = "Non-Color"
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(colors, 0, 1)
    tile.pixels.foreach_set(rgba.ravel())
    tile.filepath_raw = str(directory / (name + ".png"))
    tile.file_format = "PNG"
    tile.save()
    tile.pack()
    tile.filepath_raw = "//" + name + ".png"
    graph = mat.node_tree
    image = graph.nodes.new("ShaderNodeTexImage")
    image.image = tile
    shader = graph.nodes["Principled BSDF"]
    if normal:
        node = graph.nodes.new("ShaderNodeNormalMap")
        node.inputs["Strength"].default_value = .68
        graph.links.new(image.outputs["Color"], node.inputs["Color"])
        graph.links.new(node.outputs["Normal"], shader.inputs["Normal"])
    else:
        graph.links.new(image.outputs["Color"], shader.inputs["Base Color"])


def grid(w, h):
    y, x = np.mgrid[0:h, 0:w]
    return (x + .5) / w, (y + .5) / h


def blend(a, b, weight):
    return a * (1 - weight[..., None]) + b * weight[..., None]


def oak_grain(mat, directory):
    x, y = grid(384, 256)
    phase = x + .006 * np.sin(tau * (2*x+y)) + .0035*np.sin(tau*(4*x-2*y))
    grain = .051*np.sin(tau*(16*phase)) + .037*np.sin(tau*39*phase)
    grain += .018*np.sin(tau*(99*phase+y))
    planks = np.floor(4*x).astype(int)
    grain += np.array([.035,-.024,.006,-.04])[planks]
    for cx, cy, strength in ((.17,.37,.057),(.69,.60,.038)):
        distance = np.sqrt(((x-cx)/.065)**2 + ((y-cy)/.31)**2)
        grain += np.sin(21*distance) * np.exp(-1.7*distance) * strength
    groove = np.abs(np.sin(pi*4*x))
    grain -= .20*np.exp(-groove**2/.002)
    grain += .014*np.sin(tau*(119*x+5*y)) + .008*np.sin(tau*(87*x-11*y))
    colors = rgb("ad7441") + grain[..., None] * np.array([1,.88,.58])
    texture(mat, "Quarter-sawn honey oak", colors, directory)


def copper_planishing(mat, directory):
    x, y = grid(320, 256)
    rng = np.random.default_rng(1962)
    dent = np.zeros_like(x)
    for row in range(8):
        for col in range(10):
            cx = (col + .5 * (row % 2) + rng.uniform(-.26,.26)) / 10
            cy = (row + .5 + rng.uniform(-.23,.23)) / 8
            dx, dy = (x-cx+.5)%1-.5, (y-cy+.5)%1-.5
            distance = (dx/rng.uniform(.055,.079))**2+(dy/rng.uniform(.073,.094))**2
            dent += np.maximum(1-distance,0)**2 * rng.uniform(.55,1)
    dx = (np.roll(dent, -1, 1)-np.roll(dent, 1, 1)) * 3.7
    dy = (np.roll(dent, -1, 0)-np.roll(dent, 1, 0)) * 3.7
    normals = np.stack((dx,dy,np.ones_like(dx)), axis=-1)
    normals /= np.linalg.norm(normals, axis=-1)[..., None]
    texture(mat, "Planished indentations", normals*.5+.5, directory, normal=True)
    patina = .5+.5*np.sin(tau*(3*x + .63*np.cos(tau*y)))*np.sin(tau*(2*y+x))
    colors = blend(rgb("b86d46"), rgb("d59771"), .15 + .30*dent + .25*patina)
    colors += (.009*np.sin(tau*(29*x+64*y)))[...,None]
    texture(mat, "Warm burnished copper", colors, directory)


def cobalt_paint(mat, directory):
    x, y = grid(512, 256)
    colors = blend(rgb("f4e9c9"), rgb("fffae6"), .3+.25*np.cos(tau*y))
    blue, pale = rgb("285185"), rgb("6c94ad")
    def ink(mask, color=blue):
        nonlocal colors
        colors = blend(colors, color, np.clip(mask, 0, 1))

    def stroke(ax, ay, bx, by, width, color=blue):
        dx, dy = bx-ax, by-ay
        t = np.clip(((x-ax)*dx + (y-ay)*dy)/(dx*dx+dy*dy), 0, 1)
        distance = np.hypot(x-ax-t*dx, y-ay-t*dy)
        ink((width-distance)*260+.5, color)

    def leaf(cx, cy, length, width, angle, color):
        along = (x-cx)*cos(angle)+(y-cy)*sin(angle)
        across = -(x-cx)*sin(angle)+(y-cy)*cos(angle)
        outline = np.maximum(0,1-(np.abs(along)/length)**1.6)
        ink((outline*width-np.abs(across))*235+.5 -
            np.maximum(0,np.abs(along)-length)*260, color)

    for cy, width in ((.12,.012),(.15,.004),(.84,.016),(.885,.005)):
        ink((width-np.abs(y-cy))*230+.5)
    wave = .204+.037*np.cos(tau*3*x)
    ink((.006-np.abs(y-wave))*225+.5,pale)
    for cx in (.0,.50,1.):
        # Two spreading willow branches with individually painted lanceolate leaves.
        for sign in (-1,1):
            last = (cx,.263)
            for i in range(1,10):
                t = i/9
                point = (cx+sign*(.225*t), .263+.278*t+.038*sin(t*pi))
                stroke(*last,*point,.0055,pale)
                last = point
                if i in (3,5,7,9):
                    leaf(point[0]-sign*.008,point[1]+.035,.049,.014,
                         pi*.60 if sign==1 else pi*.4, blue)
                    leaf(point[0]+sign*.018,point[1]-.014,.039,.013,
                         -.22 if sign==1 else pi+.22,pale)
        stroke(cx,.27,cx,.61,.008)
        leaf(cx-.025,.47,.052,.019,2.28,pale)
        leaf(cx+.029,.52,.052,.018,.68,blue)
        for p in range(8):
            a = tau*p/8
            leaf(cx+.041*cos(a),.651+.051*sin(a),.041,.018,a,blue if p%2 else pale)
        ink((.018-np.hypot(x-cx,(y-.651)*.82))*240+.5)
    texture(mat,"Wheel-painted cobalt willow",colors,directory)


def mesh(name, vertices, faces, mats):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for mat in mats:
        data.materials.append(mat)
    for face in data.polygons:
        face.use_smooth = True
    return obj


def vessel(name, profile, mats, repeats=1, flutes=0, sides=96, capped=True):
    """(radius, z, flute depth, material above this ring) listed along the cross section."""
    verts, faces, slots, coords = [], [], [], []
    for r,z,flute,_ in profile:
        for i in range(sides):
            a=tau*i/sides
            radial = r + flute*(.5+.5*cos(flutes*a))
            verts.append((radial*cos(a), radial*sin(a), z))
    for row in range(len(profile)-1):
        for i in range(sides):
            j = (i+1)%sides
            faces.append((row*sides+i,row*sides+j,(row+1)*sides+j,(row+1)*sides+i))
            slots.append(profile[row][3])
            lo, hi = .012, .316
            v0,v1 = [(profile[k][1]-lo)/(hi-lo) for k in (row,row+1)]
            u0,u1 = repeats*i/sides,repeats*(i+1)/sides
            coords.append(((u0,v0),(u1,v0),(u1,v1),(u0,v1)))
    for row, rev in (((0,True),(len(profile)-1,False)) if capped else ()):
        end = [row*sides+i for i in range(sides)]
        faces.append(tuple(reversed(end)) if rev else tuple(end))
        slots.append(profile[row][3])
        coords.append([(verts[i][0]+.5, verts[i][1]+.5) for i in faces[-1]])
    obj = mesh(name, verts, faces, mats)
    uv = obj.data.uv_layers.new(name="Wheel")
    for face,slot,quad in zip(obj.data.polygons,slots,coords):
        face.material_index = slot
        for i,co in zip(face.loop_indices,quad):
            uv.data[i].uv = co
    return obj


def tube(name, points, radius, mat, closed=False, sides=8):
    verts, faces=[],[]
    points=[Vector(p) for p in points]
    for i,p in enumerate(points):
        if closed:
            axis = points[(i+1)%len(points)]-points[(i-1)%len(points)]
        else:
            axis = points[min(i+1,len(points)-1)]-points[max(0,i-1)]
        axis.normalize()
        normal = axis.cross(Vector((0,0,1)) if abs(axis.z)<.85 else Vector((1,0,0))).normalized()
        # Keep the cross section continuous across steep bends.
        if i and normal.dot(prev)<0:
            normal.negate()
        prev = normal
        binormal = axis.cross(normal)
        for k in range(sides):
            a=tau*k/sides
            verts.append(p+radius*(normal*cos(a)+binormal*sin(a)))
    for i in range(len(points) if closed else len(points)-1):
        j=(i+1)%len(points)
        for k in range(sides):
            h=(k+1)%sides
            faces.append((i*sides+k,i*sides+h,j*sides+h,j*sides+k))
    if not closed:
        faces.extend((tuple(reversed(range(sides))),tuple(range(len(verts)-sides,len(verts)))))
    return mesh(name,verts,faces,[mat])


def band(name, r, z, mat, radius, sides=80, flute=0, count=0):
    pts=[]
    for i in range(sides):
        a=tau*i/sides
        q=r+flute*(.5+.5*cos(count*a))
        pts.append((q*cos(a),q*sin(a),z))
    return tube(name,pts,radius,mat,True,8)


def turned(name, sections, mat, x=0, y=0, segments=32, capped=True):
    obj=vessel(name,[(r,z,0,0) for r,z in sections],[mat],sides=segments,capped=capped)
    obj.location=(x,y,0)
    return obj


def knob(name, position, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=7,location=position)
    obj=bpy.context.object
    obj.name=name
    obj.scale=scale
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth=True
    return obj


def relief_leaf(name, a, z, r, turn, length, width, mat):
    """Carved, ridged leaf bending around the cylindrical front of an oak stave."""
    verts=[]
    for j in range(7):
        t=j/6
        for k in (-1,0,1):
            h=k*width*sin(pi*t)**.7
            s=length*(t-.5)
            ang=a+(s*cos(turn)-h*sin(turn))/r
            height=z+s*sin(turn)+h*cos(turn)
            radial=r+.0025+(.010 if k==0 else .0005)*sin(pi*t)
            verts.append((radial*cos(ang),radial*sin(ang),height))
    faces=[]
    for j in range(6):
        for k in range(2):
            i=3*j+k
            faces.append((i,i+3,i+4,i+1))
    obj=mesh(name,verts,faces,[mat])
    # Rows run along the leaf, the middle vertex of each row is its tangible carving ridge.
    for face in obj.data.polygons:
        face.use_smooth=False


def carved(directory):
    wood=material("Quarter-sawn oak", "ad7441", rough=.63)
    oak_grain(wood,directory)
    polished=material("Carved end grain", "b47c47",rough=.48)
    cuts=material("Dark wax in the tooling", "744823",rough=.61)
    bright=material("Cut oak facets", "c39358",rough=.55)
    hoop=material("Oil-blackened iron","484641",.56,.46)
    rivet=material("Forged bronze nails","bd9254",.53,.39)
    vessel("Coopered staves and the hollow basin",[
        (.411,.012,0,0),(.433,.017,0,1),(.453,.039,0,0),(.487,.094,0,0),
        (.510,.166,0,0),(.526,.245,0,0),(.531,.296,0,1),(.550,.302,0,1),
        (.554,.319,0,1),(.545,.331,0,1),(.508,.331,0,1),(.498,.323,0,0),
        (.495,.298,0,0),(.474,.198,0,0),(.417,.086,0,0),(.388,.067,0,1)
    ],[wood,polished],repeats=6)
    for r,z in ((.472,.071),(.529,.265)):
        turned("Flat forged hoop",[(r-.009,z-.013),(r+.002,z-.010),(r+.006,z+.008),
               (r+.004,z+.014)],hoop,segments=80,capped=False)
        for i in range(12):
            a=tau*(i+.5)/12
            knob("Bronze hoop nail",((r+.007)*cos(a),(r+.007)*sin(a),z),(.007,.007,.007),rivet)
    for i in range(12):
        a=tau*(i+.5)/12
        # Each scalloped stave has an oak sprig and a hand-tooled enclosing arch.
        arch=[]
        for j in range(19):
            t=j/18
            ang=a+(t-.5)*.40
            z=.128+.111*sin(pi*t)**.61
            radius=.500+(z-.128)*.24
            arch.append((radius*cos(ang),radius*sin(ang),z))
        tube("Gouged stave arch",arch,.0035,cuts,sides=6)
        for sign in (-1,1):
            relief_leaf("Faceted oak leaf",a+sign*.036,.180,.516,pi*.29 if sign==1 else pi*.71,.076,.013,bright)
        relief_leaf("Sprig terminal",a,.203,.520,pi*.5,.061,.011,polished)
    for sign in (-1,1):
        pts=[]
        for j in range(23):
            t=pi*j/22
            pts.append((sign*(.515+.032*sin(t)),-.090*cos(t),.304+.071*sin(t)))
        tube("Carved rising ear",pts,.018,polished,sides=10)
        for y in (-.09,.09):
            knob("Ear tenon",(sign*.519,y,.294),(.019,.024,.039),polished)


def copper(directory):
    metal=material("Hand-planished rose copper","c1805c",.72,.33)
    copper_planishing(metal,directory)
    lining=material("Tin-lined satin interior","b5a999",.60,.39)
    bronze=material("Aged bronze hardware","977144",.67,.34)
    highlight=material("Burnished brass caps","d7ac6c",.65,.30)
    vessel("Hand-raised cauldron with tinned inner wall",[
        (.319,.050,0,0),(.370,.057,0,0),(.433,.080,0,0),(.478,.119,0,0),
        (.508,.167,0,0),(.533,.214,0,0),(.543,.256,0,0),(.540,.280,0,0),
        (.521,.303,0,0),(.537,.313,0,0),(.549,.316,0,0),(.551,.325,0,0),
        (.541,.333,0,1),(.509,.330,0,1),(.498,.322,0,1),(.495,.301,0,1),
        (.503,.269,0,1),(.503,.231,0,1),(.469,.160,0,1),(.407,.102,0,1),(.328,.081,0,1)
    ],[metal,lining],repeats=6)
    band("Rolled copper rim",.541,.322,highlight,.008)
    for r,z in ((.508,.165),(.530,.214)):
        band("Fine spun shoulder bead",r+.001,z,bronze,.004)
    for a in (tau*i/4+pi/4 for i in range(4)):
        x,y=cos(a),sin(a)
        turned("Bronze foot with turned toe",[(.034,.001),(.046,.005),(.047,.012),(.033,.021),
                  (.026,.036),(.029,.049),(.041,.071),(.048,.081)],bronze,.367*x,.367*y,24)
        knob("Soldered shoe",(.35*x,.35*y,.061),(.050,.050,.016),metal)
    for sign in (-1,1):
        for y in (-.095,.095):
            knob("Forged oval mounting plate",(sign*.524,y,.252),(.022,.034,.051),bronze)
            knob("Domed handle rivet",(sign*.550,y,.256),(.011,.018,.018),highlight)
        pts=[]
        for j in range(37):
            t=pi*j/36
            pts.append((sign*(.542+.072*sin(t)),-.093*cos(t),.262-.048*sin(t)))
        tube("Swing bail",pts,.0115,highlight,sides=10)
    for i in range(32):
        a=tau*(i+.5)/32
        knob("Tiny shoulder rivet",(.541*cos(a),.541*sin(a),.281),(.005,.005,.005),bronze)


def faience(directory):
    painted=material("Cobalt painted under transparent glaze","eee6c9",rough=.27)
    cobalt_paint(painted,directory)
    ivory=material("Pooled ivory glaze","f5eeda",rough=.23)
    cobalt=material("Deep cobalt glaze","315582",rough=.24)
    mid=material("Cornflower glaze","7195b4",rough=.27)
    vessel("Hand-thrown scalloped bowl",[
        (.320,.045,.002,0),(.348,.055,.003,0),(.390,.083,.005,0),
        (.423,.113,.006,0),(.456,.143,.007,0),(.494,.181,.008,0),
        (.516,.219,.007,0),(.520,.254,.006,0),(.509,.279,.003,1),
        (.516,.294,.003,1),(.537,.304,.008,1),(.545,.314,.012,1),
        (.542,.328,.012,1),(.529,.335,.005,1),(.506,.333,0,1),(.498,.322,0,1),
        (.496,.302,0,1),(.480,.257,0,1),(.449,.201,0,1),(.395,.129,0,1),(.331,.089,0,1)
    ],[painted,ivory],repeats=8,flutes=16,sides=128)
    band("Brush-dipped scalloped lip",.544,.323,cobalt,.0075,sides=128,flute=.012,count=16)
    band("Fine painted upper fillet",.522,.293,mid,.003)
    turned("Thrown pedestal foot",[(.333,.002),(.356,.005),(.360,.015),(.352,.026),
           (.329,.039),(.317,.056),(.330,.069)],ivory,segments=80)
    for r,z in ((.354,.013),(.340,.033)):
        band("Cobalt foot ring",r,z,cobalt,.006)
    for sign in (-1,1):
        pts=[]
        for j in range(33):
            t=pi*j/32
            pts.append((sign*(.503+.079*sin(t)),-.081*cos(t),.268+.046*sin(t)))
        tube("Pierced porcelain scroll handle",pts,.017,ivory,sides=12)
        for y in (-.080,.080):
            knob("Cobalt shell at handle foot",(sign*.506,y,.267),(.024,.033,.036),mid)
        tube("Blue brushstroke on handle",[(sign*(.518+.078*sin(pi*j/32)),-.081*cos(pi*j/32),
             .270+.047*sin(pi*j/32)) for j in range(3,30)],.0035,cobalt,sides=6)


def camera_and_lights():
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.samples=20
    scene.cycles.use_denoising=True
    scene.render.threads_mode="FIXED"
    scene.render.threads=6
    scene.world=bpy.data.worlds.new("Studio skylight")
    scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value=(.78,.84,.95,1)
    bg.inputs["Strength"].default_value=.42
    def aim(obj,point):
        obj.rotation_euler=(Vector(point)-obj.location).to_track_quat("-Z","Y").to_euler()
    def softbox(name,place,color,energy,size):
        light=bpy.data.lights.new(name,"AREA")
        light.energy=energy
        light.shape="DISK"
        light.size=size
        light.color=color
        obj=bpy.data.objects.new(name,light)
        scene.collection.objects.link(obj)
        obj.location=place
        aim(obj,(0,0,.16))
    softbox("Broad window",(-1.6,-1.8,2.8),(1,.87,.68),135,2.25)
    softbox("Cool fill",(1.55,-.85,1.1),(.72,.85,1),63,1.65)
    softbox("Copper edge light",(1.0,1.5,1.8),(1,.76,.54),125,1.2)
    cam_data=bpy.data.cameras.new("Portrait")
    cam_data.type="ORTHO"
    cam=bpy.data.objects.new("Portrait",cam_data)
    scene.collection.objects.link(cam)
    scene.camera=cam
    # The legacy room cutout occupies roughly y .32–.88: leave headroom for Richi.
    cam.location=(1.12,-3.2,1.15)
    aim(cam,(0,0,.29))
    cam.data.ortho_scale=1.47
    cam.data.shift_y=.072
    scene.render.resolution_x=377
    scene.render.resolution_y=427
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="WEBP"
    scene.render.image_settings.quality=94
    scene.view_settings.view_transform="AgX"
    return cam


def studio_floor():
    mat=material("Amber cabin table","865835",rough=.78)
    graph=mat.node_tree
    tex=graph.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value=2.6
    tex.inputs["Detail"].default_value=3
    tex.inputs["Roughness"].default_value=.75
    texcoord=graph.nodes.new("ShaderNodeTexCoord")
    scale=graph.nodes.new("ShaderNodeVectorMath")
    scale.operation="MULTIPLY"
    scale.inputs[1].default_value=(1.8,24,1)
    graph.links.new(texcoord.outputs["Object"],scale.inputs[0])
    graph.links.new(scale.outputs[0],tex.inputs["Vector"])
    ramp=graph.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color=(.088,.045,.022,1)
    ramp.color_ramp.elements[1].color=(.24,.132,.068,1)
    graph.links.new(tex.outputs["Fac"],ramp.inputs[0])
    graph.links.new(ramp.outputs[0],graph.nodes["Principled BSDF"].inputs["Base Color"])
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001))
    bpy.context.object.data.materials.append(mat)


def preview_water():
    water=material("Preview bathing water","62a09d",metal=.08,rough=.15)
    shader=water.node_tree.nodes["Principled BSDF"]
    shader.inputs["Transmission Weight"].default_value=.33
    shader.inputs["IOR"].default_value=1.333
    turned("Preview waterline",[(.489,.294),(.498,.303),(.498,.306)],water,segments=96)
    glint=material("Bright edge of ripple","a9d5c9",metal=.17,rough=.21)
    for cx,cy,r,a0,arc in ((-.27,.14,.10,-.7,2.4),(.22,-.12,.082,2.4,2.8),
                            (.22,-.12,.103,3.2,1.5),(-.12,-.18,.063,-1.7,2)):
        pts=[(cx+r*cos(a0+arc*i/20),cy+r*sin(a0+arc*i/20),.307) for i in range(21)]
        tube("Fine ripple highlight",pts,.0019,glint,sides=6)


def shop_bubbles():
    soap=material("Translucent soap film","d7e2df",metal=.10,rough=.12)
    shader=soap.node_tree.nodes["Principled BSDF"]
    shader.inputs["Transmission Weight"].default_value=.63
    shader.inputs["Coat Weight"].default_value=.4
    shader.inputs["Thin Film Thickness"].default_value=380
    for x,y,r,z in ((-.31,.12,.034,.312),(-.28,.14,.048,.325),(-.23,.15,.026,.318),
                     (-.34,.10,.019,.313),(-.31,.14,.024,.379),(-.25,.15,.016,.408)):
        knob("Bubble in shop portrait",(x,y,z),(r,r,r),soap)


def build(key,maker,directory):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    maker(directory)
    cam=camera_and_lights()
    props=[obj for obj in bpy.context.scene.objects if obj.type=="MESH"]
    # Source retains separate staves, feet, handles, and carvings for the artist.
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/("bath-"+key+".blend")),compress=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in props:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=props[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=key.title()+" bath"
    model = FURNITURE / ("bath-" + key + ".glb")
    bpy.ops.export_scene.gltf(filepath=str(model),export_format="GLB",
        use_selection=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
    shutil.copyfile(model, ROOT / "models/bath-toys" / model.name)
    scene=bpy.context.scene
    preview_water()
    scene.render.film_transparent=True
    scene.render.image_settings.color_mode="RGBA"
    scene.render.filepath=str(WEB/("room-bath-"+key+".webp"))
    bpy.ops.render.render(write_still=True)
    studio_floor()
    shop_bubbles()
    scene.render.film_transparent=False
    scene.render.image_settings.color_mode="RGB"
    # The shop artwork is viewed at 159×180. Render 2x to retain carved detail at high DPI.
    scene.camera.location.z+=.11
    direction=Vector((0,0,.21))-cam.location
    cam.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()
    cam.data.ortho_scale=1.46
    cam.data.shift_y=.015
    scene.render.resolution_x=318
    scene.render.resolution_y=360
    target=SHOP/("shop-bath-"+key+".webp")
    scene.render.filepath=str(target)
    bpy.ops.render.render(write_still=True)
    shutil.copyfile(target,WEB/target.name)


if __name__ == "__main__":
    with TemporaryDirectory() as tmp:
        for key,maker in (("carved",carved),("copper",copper),("faience",faience)):
            build(key,maker,Path(tmp))
