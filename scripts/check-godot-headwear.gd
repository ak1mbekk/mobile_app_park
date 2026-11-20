extends SceneTree

const RICHI = preload("res://Scenes/Characters/Richi.tscn")
const GROWTH = preload("res://Art/Characters/RichiGrowth.res")
const AGES := {1: "Baby", 4: "Juvenile", 10: "Adult"}
const HATS := {"cap": "Околыш", "ranger": "Поля", "crown": "Венец"}
const POSES := {
    "rest": [0.25, 0.55, 0.80],
    "eat": [0.22, 0.40, 0.62],
    "sleep": [0.80, 1.30, 1.80],
}
const EAR_VERTEX_MARGIN := 0.003

var failures := 0


func _initialize() -> void:
    _run.call_deferred()


func _run() -> void:
    var actor = RICHI.instantiate()
    root.add_child(actor)
    actor.gaze.enabled = false
    var bounds: Node3D = actor.hat_seat.get_node("../Clearance")

    for level in AGES:
        actor.set_age_level(level, GROWTH)
        var ears: Node3D = bounds.get_node(AGES[level])
        var protected: Array[MeshInstance3D] = [
            ears.get_node("LeftEar"),
            ears.get_node("RightEar"),
            bounds.get_node("HeadCore"),
        ]
        var support: MeshInstance3D = bounds.get_node("SeatContact")
        var ear_vertices := _sample_ear_vertices(actor, bounds)
        for pose in POSES:
            for time: float in POSES[pose]:
                _set_pose(actor, pose, time)
                await process_frame
                await process_frame
                var ear_points := _skin_ear_vertices(actor, bounds, ear_vertices)
                _expect(ear_points.size() >= 50, "the actual ear surface requires samples")
                for style in HATS:
                    actor.wear_hat(style)
                    var hat: Node3D = actor.hat_seat.get_node(style)
                    var label := "%d/%s %.2f/%s" % [level, pose, time, style]
                    _check_fit(hat, style, protected, support, ear_points, bounds, label)
                    if pose == "rest" and time == 0.55:
                        _check_displaced(hat, style, protected, support, bounds.global_basis, label)
        print("FIT ", AGES[level], ": 3 samples each in rest with head turn, eating and curled sleep")

    actor.queue_free()
    await process_frame
    if failures == 0:
        print("PASS 81 wear checks with skinned ear vertices, plus 36 deliberate misfits")
    quit(failures)


func _set_pose(actor: Node3D, pose: String, time: float) -> void:
    match pose:
        "rest":
            actor.idle_in_home()
            actor.player.seek(time, true)
            # Pose the bone directly so the CPU skin and the attachment use the same turn.
            var skeleton: Skeleton3D = actor.skeleton
            var head := skeleton.find_bone("mixamorig_Head")
            var head_pose := skeleton.get_bone_global_pose(head)
            var yaw := deg_to_rad(-7.5 if time < 0.5 else 7.5)
            head_pose.basis = Basis(Vector3.UP, yaw) * head_pose.basis
            skeleton.set_bone_global_pose(head, head_pose)
        "eat":
            actor.offer_apple()
            actor.accept_apple()
            actor.player.seek(time * actor.player.current_animation_length, true)
        "sleep":
            actor.sleep_on_bed(false)
            actor.player.seek(time, true)
    actor.player.pause()


func _check_fit(
        hat: Node3D, style: String, protected: Array[MeshInstance3D], support: MeshInstance3D,
        ear_points: PackedVector3Array, bounds: Node3D, label: String) -> void:
    var meshes := hat.find_children("*", "MeshInstance3D", true, false)
    var seat_mesh := hat.find_children(HATS[style], "MeshInstance3D", true, false)
    var clearance := _intersections(meshes, protected)
    _expect(clearance.is_empty(), label + " intersects " + str(clearance))
    _expect(seat_mesh.size() == 1, label + " requires one seating mesh")
    _expect(_touches_volume(seat_mesh, support), label + " misses the seat contact")
    _expect(not _touches_ear_vertices(meshes, bounds, ear_points), label + " touches the skinned ear surface")


func _check_displaced(
        hat: Node3D, style: String, protected: Array[MeshInstance3D],
        support: MeshInstance3D, axes: Basis, label: String) -> void:
    var meshes := hat.find_children("*", "MeshInstance3D", true, false)
    var seat_mesh := hat.find_children(HATS[style], "MeshInstance3D", true, false)
    var original := hat.global_transform
    hat.global_position = original.origin + axes * Vector3(-0.11, 0.0, -0.115)
    _expect(_touches_volume(meshes, protected[0]), label + " left ear collision must be found")
    hat.global_position = original.origin + axes * Vector3(0.11, 0.0, -0.115)
    _expect(_touches_volume(meshes, protected[1]), label + " right ear collision must be found")
    hat.global_position = original.origin + axes * Vector3(0.0, -0.18, 0.0)
    _expect(_touches_volume(meshes, protected[2]), label + " deep skull collision must be found")
    hat.global_position = original.origin + axes * Vector3(0.0, 0.32, 0.0)
    _expect(not _touches_volume(seat_mesh, support), label + " floating brim must be found")
    hat.global_transform = original


func _sample_ear_vertices(actor: Node3D, bounds: Node3D) -> Array[Dictionary]:
    var skeleton: Skeleton3D = actor.skeleton
    var head := skeleton.find_bone("mixamorig_Head")
    var rest_to_bounds := (skeleton.get_bone_global_rest(head) * bounds.transform).affine_inverse()
    var mesh: ArrayMesh = actor.body.mesh
    var surface := mesh.surface_get_arrays(0)
    var positions: PackedVector3Array = surface[Mesh.ARRAY_VERTEX]
    if actor.age_stage > 0:
        positions = mesh.surface_get_blend_shape_arrays(0)[actor.age_stage - 1][Mesh.ARRAY_VERTEX]
    var binds: PackedInt32Array = surface[Mesh.ARRAY_BONES]
    var weights: PackedFloat32Array = surface[Mesh.ARRAY_WEIGHTS]
    var stride := int(binds.size() / positions.size())
    var samples: Array[Dictionary] = []
    for index in positions.size():
        var point := rest_to_bounds * positions[index]
        if absf(point.x) >= 0.175 and point.y >= 0.012 and point.z >= -0.10 and point.z <= 0.12:
            var start := index * stride
            samples.append({
                "position": positions[index],
                "binds": binds.slice(start, start + stride),
                "weights": weights.slice(start, start + stride),
            })
    return samples


func _skin_ear_vertices(actor: Node3D, bounds: Node3D, samples: Array[Dictionary]) -> PackedVector3Array:
    var skeleton: Skeleton3D = actor.skeleton
    var skin: Skin = actor.body.skin
    var skeleton_to_bounds := bounds.global_transform.affine_inverse() * skeleton.global_transform
    var poses: Array[Transform3D] = []
    for bind in skin.get_bind_count():
        var bone := skeleton.find_bone(skin.get_bind_name(bind))
        if bone < 0:
            bone = skin.get_bind_bone(bind)
        poses.append(skeleton_to_bounds * skeleton.get_bone_global_pose(bone) * skin.get_bind_pose(bind))
    var points := PackedVector3Array()
    for sample in samples:
        var point := Vector3.ZERO
        for joint in sample.binds.size():
            var weight: float = sample.weights[joint]
            if weight > 0.0:
                point += (poses[sample.binds[joint]] * sample.position) * weight
        points.append(point)
    return points


func _touches_ear_vertices(meshes: Array[Node], bounds: Node3D, ear_points: PackedVector3Array) -> bool:
    var to_bounds := bounds.global_transform.affine_inverse()
    for instance: MeshInstance3D in meshes:
        var to_head := to_bounds * instance.global_transform
        var mesh_box := (to_head * instance.get_aabb()).grow(EAR_VERTEX_MARGIN)
        var nearby := PackedVector3Array()
        for point in ear_points:
            if mesh_box.has_point(point):
                nearby.append(point)
        if nearby.is_empty():
            continue
        var faces := instance.mesh.get_faces()
        for index in range(0, faces.size(), 3):
            var a := to_head * faces[index]
            var b := to_head * faces[index + 1]
            var c := to_head * faces[index + 2]
            var face_box := AABB(a, Vector3.ZERO).expand(b).expand(c).grow(EAR_VERTEX_MARGIN)
            for point in nearby:
                if face_box.has_point(point) and _touches_unit_sphere(
                        (a - point) / EAR_VERTEX_MARGIN, (b - point) / EAR_VERTEX_MARGIN,
                        (c - point) / EAR_VERTEX_MARGIN):
                    return true
    return false


func _intersections(meshes: Array[Node], volumes: Array[MeshInstance3D]) -> Array[StringName]:
    var result: Array[StringName] = []
    for volume in volumes:
        if _touches_volume(meshes, volume):
            result.append(volume.name)
    return result


func _touches_volume(meshes: Array[Node], volume: MeshInstance3D) -> bool:
    var sphere := volume.mesh as SphereMesh
    var dimensions := Vector3(sphere.radius, sphere.height * 0.5, sphere.radius)
    var inverse := volume.global_transform.scaled_local(dimensions).affine_inverse()
    var unit_box := AABB(-Vector3.ONE, Vector3.ONE * 2.0)
    for instance: MeshInstance3D in meshes:
        var to_sphere := inverse * instance.global_transform
        # The face test is exact in the normalized frame of the editable ellipsoid.
        if not (to_sphere * instance.get_aabb()).intersects(unit_box):
            continue
        var faces := instance.mesh.get_faces()
        for index in range(0, faces.size(), 3):
            if _touches_unit_sphere(
                    to_sphere * faces[index], to_sphere * faces[index + 1],
                    to_sphere * faces[index + 2]):
                return true
    return false


func _touches_unit_sphere(a: Vector3, b: Vector3, c: Vector3) -> bool:
    if (
        Geometry3D.get_closest_point_to_segment(Vector3.ZERO, a, b).length_squared() < 1.0
        or Geometry3D.get_closest_point_to_segment(Vector3.ZERO, b, c).length_squared() < 1.0
        or Geometry3D.get_closest_point_to_segment(Vector3.ZERO, c, a).length_squared() < 1.0
    ):
        return true
    var normal := (b - a).cross(c - a)
    var area_squared := normal.length_squared()
    if area_squared <= 0.0000001:
        return false
    var distance := normal.dot(a)
    if distance * distance >= area_squared:
        return false
    var projection := normal * (distance / area_squared)
    return (
        normal.dot((b - a).cross(projection - a)) >= 0.0
        and normal.dot((c - b).cross(projection - b)) >= 0.0
        and normal.dot((a - c).cross(projection - c)) >= 0.0
    )


func _expect(condition: bool, message: String) -> void:
    if not condition:
        failures += 1
        push_error(message)
