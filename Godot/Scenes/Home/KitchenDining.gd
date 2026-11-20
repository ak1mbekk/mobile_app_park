extends Node3D

const LIBRARY := &"Dining"
const WAITING_CLIP := &"Dining/Offer_Apple"

@export var seated: AnimationLibrary
@export_range(0.0, 2.0, 0.01) var waiting_time := 0.66
@export_range(0.0, 45.0, 1.0) var placing_lean_degrees := 19.0
@onready var bib: Node3D = $Mounts/Bib
@onready var spoon: Node3D = $Mounts/Spoon
@onready var fork: Node3D = $Mounts/Fork
@onready var bib_pose := bib.transform
@onready var spoon_pose := spoon.transform
@onready var fork_pose := fork.transform

var actor: Node3D
var chest: BoneAttachment3D
var right_paw: BoneAttachment3D
var left_paw: BoneAttachment3D
var motion: Tween
var state := &"hidden"


func bind_actor(pet: Node3D) -> void:
    actor = pet
    actor.player.add_animation_library(LIBRARY, seated)
    chest = _attachment("Spine2")
    right_paw = _attachment("RightHandMiddle1")
    left_paw = _attachment("LeftHandMiddle1")
    bib.reparent(chest, false)
    spoon.reparent(right_paw, false)
    fork.reparent(left_paw, false)
    clear()


func _attachment(bone: String) -> BoneAttachment3D:
    var anchor := BoneAttachment3D.new()
    anchor.name = "Столовая " + bone
    anchor.bone_name = "mixamorig_" + bone
    actor.skeleton.add_child(anchor)
    return anchor


func wait_for_food() -> void:
    if state != &"hidden":
        return
    state = &"waiting"
    actor.reach_for_ball()
    actor.player.play(WAITING_CLIP, 0.0)
    actor.player.seek(waiting_time, true)
    actor.player.pause()
    actor.skeleton.force_update_all_bone_transforms()
    if spoon.get_parent() != right_paw:
        spoon.reparent(right_paw, false)
        fork.reparent(left_paw, false)

    var width := 1.0 + 0.035 * int(actor.age_stage)
    _pose_attachment(bib, chest, bib_pose.scaled_local(Vector3(width, 1, 1)))
    _pose_attachment(spoon, right_paw, spoon_pose)
    _pose_attachment(fork, left_paw, fork_pose)
    bib.show()
    spoon.show()
    fork.show()


func _pose_attachment(prop: Node3D, anchor: BoneAttachment3D, target: Transform3D) -> void:
    var bone: int = actor.skeleton.find_bone(anchor.bone_name)
    prop.transform = actor.skeleton.get_bone_global_pose(bone).affine_inverse() * target


func put_down(on_finished: Callable) -> void:
    state = &"stowing"
    var skeleton: Skeleton3D = actor.skeleton
    var spine := skeleton.find_bone("mixamorig_Spine")
    var rest := skeleton.get_bone_pose_rotation(spine)
    var parent := skeleton.get_bone_global_pose(skeleton.get_bone_parent(spine)).basis.get_rotation_quaternion()
    var lean := parent.inverse() * Quaternion(Vector3.RIGHT, deg_to_rad(placing_lean_degrees)) * parent * rest
    motion = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    motion.tween_method(_turn_spine.bind(spine), rest, lean, 0.28)
    motion.tween_callback(_move_to_floor.bind(spine, lean, rest, on_finished))


func _turn_spine(rotation: Quaternion, spine: int) -> void:
    actor.skeleton.set_bone_pose_rotation(spine, rotation)


func _move_to_floor(spine: int, lean: Quaternion, rest: Quaternion, on_finished: Callable) -> void:
    spoon.reparent(self, true)
    fork.reparent(self, true)
    motion = create_tween().set_parallel(true).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    motion.tween_property(spoon, "global_transform", $SpoonRest.global_transform, 0.31)
    motion.tween_property(fork, "global_transform", $ForkRest.global_transform, 0.31)
    motion.chain().tween_method(_turn_spine.bind(spine), lean, rest, 0.24)
    motion.chain().tween_callback(_finish_placing.bind(on_finished))


func _finish_placing(on_finished: Callable) -> void:
    state = &"set"
    motion = null
    on_finished.call()

func finish_meal() -> void:
    bib.hide()


func clear() -> void:
    if motion:
        motion.kill()
        motion = null
    state = &"hidden"
    bib.hide()
    spoon.hide()
    fork.hide()
