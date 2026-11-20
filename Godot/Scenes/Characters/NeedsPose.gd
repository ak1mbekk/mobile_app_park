extends SkeletonModifier3D

var presenter: Node3D
var full := 0.0
var stretch := 0.0
var mood := 0.0

@onready var rig := get_skeleton()
@onready var spine := rig.find_bone("mixamorig_Spine")
@onready var left_arm := rig.find_bone("mixamorig_LeftArm")
@onready var right_arm := rig.find_bone("mixamorig_RightArm")
@onready var left_elbow := rig.find_bone("mixamorig_LeftForeArm")
@onready var right_elbow := rig.find_bone("mixamorig_RightForeArm")
@onready var left_palm := rig.find_bone("mixamorig_LeftHandMiddle1")
@onready var right_palm := rig.find_bone("mixamorig_RightHandMiddle1")

func _process_modification_with_delta(_delta: float) -> void:
    if not presenter or (full < 0.001 and stretch < 0.001 and absf(mood) < 0.001):
        return
    var torso := rig.get_bone_global_pose(spine)
    var angle := -0.13 * full - 0.095 * stretch - 0.08 * mood
    torso.basis = Basis(Vector3.RIGHT,angle) * torso.basis
    rig.set_bone_global_pose(spine,torso)
    if full > 0.001:
        var sweep := sin(presenter.reaction_time * 5.5) * 0.09
        var belly := torso.origin + Vector3(-0.02 + sweep,0.25,0.56 + 0.025 * cos(presenter.reaction_time * 5.5))
        _reach(right_arm,right_elbow,right_palm,belly,full)
    if stretch > 0.001:
        _reach(left_arm,left_elbow,left_palm,torso.origin + Vector3(0.58,0.78,0.24),stretch * 0.86)
        _reach(right_arm,right_elbow,right_palm,torso.origin + Vector3(-0.57,0.72,0.21),stretch * 0.89)

func _reach(arm: int, elbow: int, palm: int, target: Vector3, amount: float) -> void:
    _aim(arm,rig.get_bone_global_pose(palm).origin,target,amount * 0.84)
    _aim(elbow,rig.get_bone_global_pose(palm).origin,target,amount * 0.64)

func _aim(bone: int, end: Vector3, target: Vector3, amount: float) -> void:
    var pose := rig.get_bone_global_pose(bone)
    var turn := Quaternion((end - pose.origin).normalized(),(target - pose.origin).normalized())
    pose.basis = Basis(Quaternion.IDENTITY.slerp(turn,amount)) * pose.basis
    rig.set_bone_global_pose(bone,pose)
