extends SkeletonModifier3D

var player: AnimationPlayer
var clapping := false

@onready var rig := get_skeleton()
@onready var left_arm := rig.find_bone("mixamorig_LeftArm")
@onready var right_arm := rig.find_bone("mixamorig_RightArm")
@onready var left_forearm := rig.find_bone("mixamorig_LeftForeArm")
@onready var right_forearm := rig.find_bone("mixamorig_RightForeArm")
@onready var left_palm := rig.find_bone("mixamorig_LeftHandMiddle1")
@onready var right_palm := rig.find_bone("mixamorig_RightHandMiddle1")

func _process_modification_with_delta(_delta: float) -> void:
    if not player:
        return
    var left := rig.get_bone_global_pose(left_palm).origin
    var right := rig.get_bone_global_pose(right_palm).origin
    if player.current_animation == &"Idle":
        _aim_arm(left_arm, left, left + Vector3(0.025, 0.06, 0.13), 0.75)
        _aim_arm(right_arm, right, right + Vector3(-0.025, 0.06, 0.13), 0.75)
    elif clapping and player.current_animation == &"Stand_Clap_and_Sit_Down":
        _clap(left, right)

func _clap(left: Vector3, right: Vector3) -> void:
    var gap := left - right
    # Retarget the contact phase to the raccoon's shorter arms.
    var weight := 1.0 - smoothstep(0.24, 0.43, gap.length())
    if is_zero_approx(weight):
        return
    var contact := left.lerp(right, 0.5) + Vector3(0.0, -0.08, 0.10)
    var spacing := gap.normalized() * 0.04
    _aim_arm(left_arm, left, contact + spacing, weight)
    _aim_arm(right_arm, right, contact - spacing, weight)
    _aim_arm(left_forearm, rig.get_bone_global_pose(left_palm).origin, contact + spacing, weight * 0.8)
    _aim_arm(right_forearm, rig.get_bone_global_pose(right_palm).origin, contact - spacing, weight * 0.8)

func _aim_arm(arm: int, palm: Vector3, contact: Vector3, weight: float) -> void:
    var pose := rig.get_bone_global_pose(arm)
    var turn := Quaternion((palm - pose.origin).normalized(), (contact - pose.origin).normalized())
    pose.basis = Basis(Quaternion.IDENTITY.slerp(turn, weight)) * pose.basis
    rig.set_bone_global_pose(arm, pose)
