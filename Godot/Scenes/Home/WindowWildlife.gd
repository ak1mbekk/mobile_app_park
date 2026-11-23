extends Node3D
## Scenery only. Hidden rooms stop their tweens and retain no running timer.
@export_enum("Fish", "Swallow") var wildlife := 0
@export var interval := Vector2(9.0, 17.0)
var sequence: Tween
var direction := 1.0
var path_y := 0.0

func _ready() -> void:
    visibility_changed.connect(_restart)
    _restart()

func _restart() -> void:
    if sequence:
        sequence.kill()
    $Animal.hide()
    if has_node("Wake"):
        $Wake.hide()
    if not is_inside_tree() or not is_visible_in_tree():
        return
    sequence = create_tween()
    sequence.tween_interval(randf_range(1.2, 3.8))
    sequence.tween_callback(_begin)

func _begin() -> void:
    direction = -1.0 if randf() < 0.5 else 1.0
    path_y = randf_range(-0.035, 0.035)
    var duration := 3.6 if wildlife == 0 else 2.55
    sequence = create_tween()
    sequence.tween_method(_sample, 0.0, duration, duration)
    sequence.tween_callback($Animal.hide)
    sequence.tween_interval(randf_range(interval.x, interval.y))
    sequence.tween_callback(_begin)

func _sample(t: float) -> void:
    if wildlife == 1:
        var u := t / 2.55
        $Animal.visible = u < 1.0
        $Animal.position = Vector3(direction * lerpf(-.66, .66, u), path_y + .055*sin(PI*u), 0)
        $Animal.scale.x = direction
        $Animal/Wing.rotation.z = direction * .12 + .45 * sin(t*23.0)
        $Animal/Wing.scale.y = .12 + .88*cos(t*23.0)
        return
    var jump := clampf((t-1.1)/.76, 0, 1)
    var landing_x := .10 * direction
    $Animal.visible = t < 1.86
    $Animal.position = Vector3(direction * (lerpf(-.24, -.06, minf(t/1.1, 1)) + .16*jump), path_y + .12*sin(PI*jump), 0)
    $Animal.scale = Vector3(direction, lerpf(.48, 1., smoothstep(1.05,1.26,t)), 1)
    $Animal.rotation.z = direction * .6*cos(PI*jump)*smoothstep(1.05,1.24,t)
    $Animal.modulate = Color(.84,.94,.9, lerpf(.48,1.,smoothstep(.96,1.18,t)))
    var ripple := clampf((t-1.86)/1.74,0,1)
    $Wake.position = Vector3(landing_x,path_y,.002)
    $Wake.visible = t >= 1.86 and ripple < 1.
    $Wake.scale = Vector3.ONE * lerpf(.15,1.0,sqrt(ripple))
    $Wake.modulate.a = (1.-ripple)*.95

