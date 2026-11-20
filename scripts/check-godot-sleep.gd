extends SceneTree

var failures := PackedStringArray()

func _initialize() -> void:
    run.call_deferred()

func require(condition: bool, reason: String) -> void:
    if not condition:
        failures.append(reason)
        push_error(reason)

func landmark(rig: Skeleton3D, bone: String) -> Vector3:
    var index := rig.find_bone(bone)
    require(index >= 0, "Missing sleep landmark: " + bone)
    return rig.get_bone_global_pose(index).origin if index >= 0 else Vector3.ZERO

func run() -> void:
    var actor = load("res://Scenes/Characters/Richi.tscn").instantiate()
    root.add_child(actor)
    actor.idle_in_home()
    await create_timer(0.9).timeout
    var rig: Skeleton3D = actor.skeleton
    var hips := "mixamorig_Hips"
    var head := "mixamorig_Head"
    var tail_tip := "Bone_017"
    var awake_length := landmark(rig, hips).distance_to(landmark(rig, head))
    var awake_tail_gap := landmark(rig, tail_tip).distance_to(landmark(rig, head))

    for animate in [true, false]:
        actor.sleep_on_bed(animate)
        if animate:
            await create_timer(1.4).timeout
        else:
            await process_frame
        require(actor.gaze.suspended, "Touch should not steer sleeping eyes")
        require(float(actor.gaze.surface.get_shader_parameter("eyelids")) > 0.95, "Sleeping eyelids should close")
        var sleep_head := landmark(rig, head)
        require(sleep_head.distance_to(landmark(rig, hips)) < awake_length * 0.82, "The spine should curl")
        require(sleep_head.distance_to(landmark(rig, tail_tip)) < awake_tail_gap * 0.60, "The tail should wrap towards the face")
        require(actor.player.is_playing(), "Sleep breathing should remain animated")
        actor.idle_in_home()
        await create_timer(1.0).timeout
        require(not actor.gaze.suspended, "Wake should release the eye target")
        require(float(actor.gaze.surface.get_shader_parameter("eyelids")) < 0.2, "Waking should open the eyes")
        require(landmark(rig, head).distance_to(landmark(rig, hips)) > awake_length * 0.9, "Wake should restore the upright pose")
    if failures.is_empty():
        print("PASS curled spine, wrapped tail, sleeping eyelids and wake on live and restored entry")
    quit(0 if failures.is_empty() else 1)
