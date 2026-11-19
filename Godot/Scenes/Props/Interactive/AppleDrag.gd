extends MeshInstance3D

signal picked_up
signal returned_to_floor

@export var first_bite: ArrayMesh
@export var second_bite: ArrayMesh
@export var raccoon: Node3D
@export_range(0.03, 0.16, 0.005) var drop_radius := 0.09

const NO_POINTER := -2
const MOUSE := -1
var pointer := NO_POINTER
var floor_position: Vector3
var grab_offset: Vector2
var pressed_at: Vector2
var delivered := false
var bite_stage := 0
var settling := false
var settle_from: Vector3
var settle_time := 0.0
@onready var initial_scale := scale

func _ready() -> void:
    floor_position = global_position
    set_process(false)

func _input(event: InputEvent) -> void:
    if raccoon == null or delivered:
        return
    if event is InputEventScreenTouch:
        if event.canceled and pointer == event.index:
            release(false)
        elif event.pressed:
            try_grab(event.position, event.index)
        elif event.index == pointer:
            drop_at(event.position)
    elif event is InputEventScreenDrag and event.index == pointer:
        drag_to(event.position)
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            try_grab(event.position, MOUSE)
        elif pointer == MOUSE:
            drop_at(event.position)
    elif event is InputEventMouseMotion and pointer == MOUSE:
        drag_to(event.position)

func center_offset() -> Vector3:
    return global_basis * mesh.get_aabb().get_center()

func palm_center() -> Vector3:
    return raccoon.apple_grip() + Vector3.UP * center_offset().y * 0.32

func try_grab(screen: Vector2, id: int) -> void:
    if pointer != NO_POINTER or settling:
        return
    var cam := get_viewport().get_camera_3d()
    if cam == null:
        return
    var center := global_position + center_offset()
    var projected := cam.unproject_position(center)
    var rim := cam.unproject_position(center + cam.global_basis.x * mesh.get_aabb().size.x * global_basis.x.length() * 0.52)
    if screen.distance_to(projected) > maxf(24.0, projected.distance_to(rim)):
        return
    pressed_at = screen
    grab_offset = projected - screen
    pointer = id
    picked_up.emit()
    get_viewport().set_input_as_handled()

func drag_to(screen: Vector2) -> void:
    var cam := get_viewport().get_camera_3d()
    var offset := center_offset()
    var from := floor_position + offset
    var start := cam.unproject_position(from)
    var path := cam.unproject_position(palm_center()) - start
    var finger := screen + grab_offset
    var along := clampf((finger-start).dot(path) / maxf(path.length_squared(), 1.0), 0.0, 1.0)
    var height := lerpf(from.y, palm_center().y, smoothstep(0.58, 1.0, along))
    var hit = Plane(Vector3.UP, height).intersects_ray(cam.project_ray_origin(finger), cam.project_ray_normal(finger))
    if hit is Vector3 and global_position.distance_to(hit) < 2.2:
        global_position = hit - offset
    get_viewport().set_input_as_handled()

func drop_at(screen: Vector2) -> void:
    drag_to(screen)
    var target := get_viewport().get_camera_3d().unproject_position(palm_center())
    var radius := get_viewport().get_visible_rect().size.x * drop_radius
    release(screen.distance_to(pressed_at) >= 15.0 and (screen + grab_offset).distance_to(target) <= radius)

func release(success: bool) -> void:
    pointer = NO_POINTER
    delivered = success
    settle_from = global_position
    settle_time = 0.0
    settling = true
    set_process(true)

func _process(delta: float) -> void:
    if delivered and not settling:
        var phase: float = raccoon.meal_phase()
        if phase >= 0.73:
            hide()
            set_process(false)
            return
        var stage := int(phase >= 0.45) + int(phase >= 0.59)
        if stage != bite_stage:
            bite_stage = stage
            mesh = first_bite if stage == 1 else second_bite
        var remaining := 1.0 - 0.16 * smoothstep(0.45, 0.49, phase) - 0.22 * smoothstep(0.59, 0.63, phase)
        scale = initial_scale * remaining
        global_position = palm_center() - center_offset()
        return
    settle_time = minf(1.0, settle_time + delta / 0.22)
    var destination := palm_center() - center_offset() if delivered else floor_position
    global_position = settle_from.lerp(destination, smoothstep(0.0, 1.0, settle_time))
    if settle_time >= 1.0:
        settling = false
        if delivered:
            raccoon.accept_apple()
        else:
            returned_to_floor.emit()
        set_process(delivered)

func _notification(what: int) -> void:
    if what == NOTIFICATION_APPLICATION_FOCUS_OUT and pointer != NO_POINTER:
        release(false)

func restore_eaten() -> void:
    delivered = true
    settling = false
    set_process(false)
    hide()
