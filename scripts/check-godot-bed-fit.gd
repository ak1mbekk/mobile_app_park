extends SceneTree

# Compare the curled, skinned character (including the active growth morph) to the furniture footprint.
func _initialize() -> void:
    check.call_deferred()

func skin_bounds(actor: Node3D) -> AABB:
    var skeleton: Skeleton3D = actor.skeleton
    var skin: Skin = actor.body.skin
    var mesh: ArrayMesh = actor.body.mesh
    var surface := mesh.surface_get_arrays(0)
    var points: PackedVector3Array = surface[Mesh.ARRAY_VERTEX]
    if actor.age_stage > 0:
        points = mesh.surface_get_blend_shape_arrays(0)[actor.age_stage - 1][Mesh.ARRAY_VERTEX]
    var bones: PackedInt32Array = surface[Mesh.ARRAY_BONES]
    var weights: PackedFloat32Array = surface[Mesh.ARRAY_WEIGHTS]
    var stride := int(bones.size() / points.size())
    var transforms: Array[Transform3D] = []
    for bind in skin.get_bind_count():
        var index := skeleton.find_bone(skin.get_bind_name(bind))
        if index < 0:
            index = skin.get_bind_bone(bind)
        transforms.append(skeleton.global_transform * skeleton.get_bone_global_pose(index) * skin.get_bind_pose(bind))
    var bounds := AABB()
    for i in points.size():
        var world := Vector3.ZERO
        for k in stride:
            var index := i * stride + k
            if weights[index] > 0:
                world += (transforms[bones[index]] * points[i]) * weights[index]
        bounds = AABB(world, Vector3.ZERO) if i == 0 else bounds.expand(world)
    return bounds

func check() -> void:
    var home = load("res://Scenes/Levels/Home.tscn").instantiate()
    root.add_child(home)
    home.hosted = true
    home.set_process_input(false)
    var success := true
    for level in [1, 4, 10]:
        for item in ["bed","settee"]:
            home.richi.set_age_level(level, home.growth_mesh)
            home._apply_furniture({"placed":[item]})
            home.night = true
            home._finish_sleep_movement()
            for frame in 6:
                await process_frame
            var pet := skin_bounds(home.richi)
            var furniture: Node3D = home.bedroom.get_node("Лежанка" if item == "bed" else "Диван")
            var meshes := furniture.find_children("*", "MeshInstance3D", true, false)
            var footprint := AABB()
            for i in meshes.size():
                var bounds: AABB = meshes[i].global_transform * meshes[i].get_aabb()
                footprint = bounds if i == 0 else footprint.merge(bounds)
            var gap := Vector4(pet.position.x-footprint.position.x, footprint.end.x-pet.end.x,
                    pet.position.z-footprint.position.z, footprint.end.z-pet.end.z)
            print("SLEEP FIT level=",level," ",item," pet=",pet," furniture=",footprint," margins=",gap)
            if gap[gap.min_axis_index()] < -0.005:
                success = false
            home.night = false
            home._finish_sleep_movement()
    quit(0 if success else 1)
