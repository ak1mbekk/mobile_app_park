extends SkeletonModifier3D

var presenter: Node3D
var full := 0.0
var stretch := 0.0
var mood := 0.0
var meal_contact := Vector3.ZERO

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
    var angle := 0.03 * full - 0.095 * stretch - 0.08 * mood
    torso.basis = Basis(Vector3.RIGHT,angle) * torso.basis
    rig.set_bone_global_pose(spine,torso)
    if full > 0.001:
        # One short arc on the upper outer belly. Leave room for the full-belly
        # shader and the thickness of the palm instead of aiming inside the coat.
        var phase := smoothstep(0.65, 1.55, presenter.reaction_time)
        var arc := sin(PI * phase)
        var coat_clearance: float = [0.0, 0.012, 0.035][clampi(presenter.actor.age_stage, 0, 2)]
        var contact := torso.origin + Vector3(-0.24 + 0.10 * arc, 0.275 - 0.065 * phase, 0.405 + coat_clearance + 0.018 * arc)
        var resting := rig.get_bone_global_pose(right_palm).origin
        meal_contact = resting.lerp(contact, full) + Vector3(-0.17 * sin(PI * full), 0, 0)
        var shoulder := rig.get_bone_global_pose(right_arm)
        shoulder.origin += Vector3(0, 0, (0.10 + coat_clearance) * full)
        rig.set_bone_global_pose(right_arm, shoulder)
        _solve_arm(right_arm, right_elbow, right_palm, meal_contact)
    if stretch > 0.001:
        _reach(left_arm,left_elbow,left_palm,torso.origin + Vector3(0.58,0.78,0.24),stretch * 0.86)
        _reach(right_arm,right_elbow,right_palm,torso.origin + Vector3(-0.57,0.72,0.21),stretch * 0.89)

func _reach(arm: int, elbow: int, palm: int, target: Vector3, amount: float) -> void:
    _aim(arm,rig.get_bone_global_pose(palm).origin,target,amount * 0.84)
    _aim(elbow,rig.get_bone_global_pose(palm).origin,target,amount * 0.64)

func _solve_arm(arm: int, elbow: int, palm: int, target: Vector3) -> void:
    var shoulder := rig.get_bone_global_pose(arm).origin
    var hinge := rig.get_bone_global_pose(elbow).origin
    var end := rig.get_bone_global_pose(palm).origin
    var upper := shoulder.distance_to(hinge)
    var lower := hinge.distance_to(end)
    var direction := (target - shoulder).normalized()
    var distance := clampf(shoulder.distance_to(target), absf(upper - lower) + 0.001, upper + lower - 0.002)
    var along := (upper * upper - lower * lower + distance * distance) / (2.0 * distance)
    var bend := sqrt(maxf(0.0, upper * upper - along * along))
    var pole := Vector3(-1.0, 0.05, 0.45)
    var outward := (pole - direction * pole.dot(direction)).normalized()
    var desired_hinge := shoulder + direction * along + outward * bend
    _aim(arm, hinge, desired_hinge, 1.0)
    _aim(elbow, rig.get_bone_global_pose(palm).origin, shoulder + direction * distance, 1.0)

func _aim(bone: int, end: Vector3, target: Vector3, amount: float) -> void:
    var pose := rig.get_bone_global_pose(bone)
    var turn := Quaternion((end - pose.origin).normalized(),(target - pose.origin).normalized())
    pose.basis = Basis(Quaternion.IDENTITY.slerp(turn,amount)) * pose.basis
    rig.set_bone_global_pose(bone,pose)
