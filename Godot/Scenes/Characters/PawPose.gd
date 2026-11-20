@tool
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
        _relax_arm(left_arm, left_forearm, left_palm, left, 1.0)
        _relax_arm(right_arm, right_forearm, right_palm, right, -1.0)
    elif clapping and player.current_animation == &"Stand_Clap_and_Sit_Down":
        _clap(left, right)

func _relax_arm(arm: int, forearm: int, palm: int, resting_palm: Vector3, side: float) -> void:
    var elbow := rig.get_bone_global_pose(forearm).origin
    var relaxed_elbow := elbow + Vector3(0.065 * side, 0.035, 0.11)
    var relaxed_palm := resting_palm + Vector3(0.06 * side, 0.14, 0.25)
    _aim_arm(arm, elbow, relaxed_elbow, 0.9)
    _aim_arm(forearm, rig.get_bone_global_pose(palm).origin, relaxed_palm, 0.91)

func _clap(left: Vector3, right: Vector3) -> void:
    var gap := left - right
    # Retarget the contact phase to the raccoon's shorter arms.
    var weight := 1.0 - smoothstep(0.24, 0.43, gap.length())
    if is_zero_approx(weight):
        return
    var contact := left.lerp(right, 0.5) + Vector3(0.0, -0.08, 0.08)
    var spacing := gap.normalized() * 0.034
    _aim_arm(left_arm, left, contact + spacing, weight)
    _aim_arm(right_arm, right, contact - spacing, weight)
    _aim_arm(left_forearm, rig.get_bone_global_pose(left_palm).origin, contact + spacing, weight * 0.84)
    _aim_arm(right_forearm, rig.get_bone_global_pose(right_palm).origin, contact - spacing, weight * 0.84)

func _aim_arm(arm: int, palm: Vector3, contact: Vector3, weight: float) -> void:
    var pose := rig.get_bone_global_pose(arm)
    var turn := Quaternion((palm - pose.origin).normalized(), (contact - pose.origin).normalized())
    pose.basis = Basis(Quaternion.IDENTITY.slerp(turn, weight)) * pose.basis
    rig.set_bone_global_pose(arm, pose)
