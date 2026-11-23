extends Button

# A simplified copy of Richi's skin, with the same bind indices and two growth shapes.
const PET_PICK_MESH: ArrayMesh = preload("res://Scenes/Home/SetteePetPick.res")
var active_camera: Camera3D
var sofa_meshes: Array[MeshInstance3D] = []
var hat_meshes: Array[MeshInstance3D] = []
var geometry: Dictionary[Mesh, TriangleMesh] = {}
var pet: Node3D
var pillow: Node3D
var sleeping := false
var vertices: PackedVector3Array
var indices: PackedInt32Array
var bones: PackedInt32Array
var weights: PackedFloat32Array
var bind_bones := PackedInt32Array()
var posed := PackedVector3Array()
var stage := -1
var pose_frame := -1

func fit_to_settee(camera: Camera3D, settee: Node3D, cushion: Node3D, actor: Node3D, asleep: bool) -> void:
    active_camera = camera
    pet = actor
    pillow = settee.get_node("Место для вышитой подушки")
    sleeping = asleep
    if sofa_meshes.is_empty():
        sofa_meshes.assign(settee.find_children("*", "MeshInstance3D", true, false))
        sofa_meshes.append_array(cushion.find_children("*", "MeshInstance3D", true, false))
        hat_meshes.assign(pet.hat_seat.find_children("*", "MeshInstance3D", true, false))
        var skin: Skin = pet.body.skin
        for bind in skin.get_bind_count():
            bind_bones.append(pet.skeleton.find_bone(skin.get_bind_name(bind)))
    if stage != pet.age_stage:
        stage = pet.age_stage
        var arrays := PET_PICK_MESH.surface_get_arrays(0)
        vertices = arrays[Mesh.ARRAY_VERTEX] if stage == 0 else PET_PICK_MESH.surface_get_blend_shape_arrays(0)[stage-1][Mesh.ARRAY_VERTEX]
        weights = arrays[Mesh.ARRAY_WEIGHTS]
        bones = arrays[Mesh.ARRAY_BONES]
        indices = arrays[Mesh.ARRAY_INDEX]
        posed.resize(vertices.size())
    pose_frame = -1
    var viewport := camera.get_viewport().get_visible_rect()
    var bounds := Rect2(camera.unproject_position(pillow.global_position), Vector2.ZERO)
    for part in sofa_meshes:
        if part.is_visible_in_tree():
            var box := part.get_aabb()
            for i in 8:
                bounds = bounds.expand(camera.unproject_position(part.to_global(box.get_endpoint(i))))
    # The sleep camera moves into a close-up after the pet curls up. Keep its
    # face touchable throughout that move even above the backrest.
    bounds = viewport if sleeping else bounds.intersection(viewport)
    position = bounds.position
    size = bounds.size

func clear_shape() -> void:
    active_camera = null

func target_point() -> Vector2:
    if not active_camera:
        return get_global_rect().get_center()
    if sleeping:
        var head: int = pet.skeleton.find_bone("mixamorig_Head")
        var face: Vector3 = pet.skeleton.to_global(pet.skeleton.get_bone_global_pose(head).origin)
        return active_camera.unproject_position(face)
    return active_camera.unproject_position(pillow.global_position)

func _has_point(point: Vector2) -> bool:
    if not Rect2(Vector2.ZERO, size).has_point(point):
        return false
    if not active_camera:
        return true
    var pixel := point + global_position
    var origin := active_camera.project_ray_origin(pixel)
    var direction := active_camera.project_ray_normal(pixel)
    var sofa_hit := _hits_static(sofa_meshes, origin, direction)
    if not sofa_hit and not sleeping:
        return false
    if sofa_hit and sleeping:
        return true
    var pet_hit := _hits_static(hat_meshes, origin, direction) or _hits_pet(origin, direction)
    return pet_hit if sleeping else not pet_hit

func _hits_static(meshes: Array[MeshInstance3D], origin: Vector3, direction: Vector3) -> bool:
    for part in meshes:
        if not part.is_visible_in_tree() or not part.mesh:
            continue
        var local := part.global_transform.affine_inverse()
        var ray := local.basis * direction
        var start := local * origin
        if part.get_aabb().intersects_ray(start, ray) == null:
            continue
        if not geometry.has(part.mesh):
            geometry[part.mesh] = part.mesh.generate_triangle_mesh()
        if geometry[part.mesh] and not geometry[part.mesh].intersect_ray(start, ray.normalized()).is_empty():
            return true
    return false

func _hits_pet(origin: Vector3, direction: Vector3) -> bool:
    var skeleton: Skeleton3D = pet.skeleton
    if pose_frame != Engine.get_process_frames():
        var transforms: Array[Transform3D] = []
        var skin: Skin = pet.body.skin
        for bind in bind_bones.size():
            transforms.append(skeleton.get_bone_global_pose(bind_bones[bind]) * skin.get_bind_pose(bind))
        for i in vertices.size():
            var point := Vector3.ZERO
            for j in 4:
                var k := 4*i+j
                if weights[k] > 0.0:
                    point += (transforms[bones[k]] * vertices[i]) * weights[k]
            posed[i] = point
        pose_frame = Engine.get_process_frames()
    var local := skeleton.global_transform.affine_inverse()
    var start := local * origin
    var ray := (local.basis * direction).normalized()
    for tri in range(0, indices.size(), 3):
        if Geometry3D.ray_intersects_triangle(start, ray, posed[indices[tri]], posed[indices[tri+1]], posed[indices[tri+2]]) != null:
            return true
    return false
