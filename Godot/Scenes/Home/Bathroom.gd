extends Node3D

signal rinse_available
signal washed

const NO_POINTER := -2
const MOUSE := -1

@onready var soap: MeshInstance3D = $Губка
@onready var foam: Node3D = $Пена
@onready var animation: AnimationPlayer = $AnimationPlayer
@onready var soap_rest := soap.position

var actor: Node3D
var pointer := NO_POINTER
var previous := Vector2.ZERO
var scrub_distance := 0.0
var ready_to_rinse := false

func _ready() -> void:
    set_process_unhandled_input(false)
    animation.animation_finished.connect(_on_animation_finished)

func start(richi: Node3D) -> void:
    actor = richi
    scrub_distance = 0.0
    ready_to_rinse = false
    soap.position = soap_rest
    soap.show()
    foam.hide()
    animation.play("float")
    set_process_unhandled_input(true)

func close() -> void:
    pointer = NO_POINTER
    set_process_unhandled_input(false)
    animation.stop()

func show_appearance(enamel: bool) -> void:
    $"Купель/Деревянная купель".visible = not enamel
    $"Купель/Эмалированная купель".visible = enamel

func preview() -> void:
    close()
    soap.hide()
    foam.hide()

func rinse() -> void:
    if not ready_to_rinse:
        return
    ready_to_rinse = false
    soap.hide()
    animation.play("rinse")

func navigation_checkpoint() -> Dictionary:
    var width := get_viewport().get_visible_rect().size.x
    var phase := "scrub"
    if ready_to_rinse or animation.current_animation == &"rinse":
        phase = "ready"
    elif not soap.visible:
        phase = "done"
    return {"phase": phase, "scrub": scrub_distance / maxf(1.0, width)}

func restore_navigation(checkpoint: Dictionary) -> String:
    var phase := str(checkpoint.get("phase", "scrub"))
    var scrub := clampf(float(checkpoint.get("scrub", 0.0)), 0.0, 0.51)
    scrub_distance = scrub * get_viewport().get_visible_rect().size.x
    ready_to_rinse = phase == "ready"
    foam.visible = phase != "done" and (ready_to_rinse or scrub >= 0.12)
    soap.visible = phase != "done"
    set_process_unhandled_input(not ready_to_rinse and phase != "done")
    return phase

func _on_animation_finished(clip: StringName) -> void:
    if clip == &"rinse":
        foam.hide()
        washed.emit()
        animation.play("float")

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventScreenTouch:
        if event.pressed and not event.canceled:
            _grab(event.position, event.index)
        elif pointer == event.index:
            _release()
    elif event is InputEventScreenDrag and pointer == event.index:
        _scrub(event.position)
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            _grab(event.position, MOUSE)
        elif pointer == MOUSE:
            _release()
    elif event is InputEventMouseMotion and pointer == MOUSE:
        _scrub(event.position)

func _grab(point: Vector2, id: int) -> void:
    if pointer != NO_POINTER or ready_to_rinse:
        return
    var camera := get_viewport().get_camera_3d()
    if camera and camera.unproject_position(soap.global_position).distance_to(point) <= 46:
        pointer = id
        previous = point
        get_viewport().set_input_as_handled()

func _scrub(point: Vector2) -> void:
    var camera := get_viewport().get_camera_3d()
    if not camera:
        return
    var torso := actor.global_position + Vector3(0, 0.36, 0.05)
    var reach := get_viewport().get_visible_rect().size.x
    var depth := (camera.global_position - torso).dot(camera.global_basis.z)
    soap.global_position = camera.project_position(point, maxf(0.1, depth - 0.42))
    if camera.unproject_position(torso).distance_to(point) <= reach * 0.22:
        scrub_distance += minf(previous.distance_to(point), reach * 0.1)
        if scrub_distance >= reach * 0.12:
            foam.show()
        if scrub_distance >= reach * 0.51:
            ready_to_rinse = true
            _release()
            set_process_unhandled_input(false)
            rinse_available.emit()
    previous = point
    get_viewport().set_input_as_handled()

func _release() -> void:
    pointer = NO_POINTER
    soap.position = soap_rest

func _notification(what: int) -> void:
    if is_node_ready() and what in [NOTIFICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT]:
        _release()
