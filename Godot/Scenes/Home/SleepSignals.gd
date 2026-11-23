extends Control
## Three vector Zs follow the sleeping head; no font or particle assets are needed.
var home: Node3D
var elapsed := 0.0
var anchor := Vector2.ZERO
var reduced_motion := false
var head_bone := -1

func _ready() -> void:
    mouse_filter = Control.MOUSE_FILTER_IGNORE
    z_index = 8
    if OS.has_feature("web"):
        reduced_motion = JavaScriptBridge.eval("matchMedia('(prefers-reduced-motion: reduce)').matches") == true
    hide()

func _process(delta: float) -> void:
    if not is_instance_valid(home):
        hide()
        return
    var showing: bool = home.night and home.richi.sleeping_on_furniture and not home.sleep_moving and home.richi.is_visible_in_tree()
    visible = showing
    if not showing:
        elapsed = 0.0
        return
    elapsed += delta
    var actor = home.richi
    if head_bone < 0:
        head_bone = actor.skeleton.find_bone("mixamorig_Head")
    if head_bone < 0:
        hide()
        return
    var point: Vector3 = actor.skeleton.to_global(actor.skeleton.get_bone_global_pose(head_bone).origin)
    anchor = home.room_camera.unproject_position(point + Vector3(0.08, 0.14, 0))
    queue_redraw()

func _draw() -> void:
    var viewport := get_viewport_rect().size
    var unit := clampf(viewport.x / 390.0, 0.8, 1.6)
    for index in 3:
        var phase := float(index) / 3.0 if reduced_motion else fposmod(elapsed / 2.8 + float(index) / 3.0, 1.0)
        var alpha := 0.75 if reduced_motion else sin(PI * phase) * 0.88
        var width := (9.0 + 6.0 * phase) * unit
        var origin := anchor + Vector2(phase * 29.0, -phase * 69.0) * unit
        origin.x = clampf(origin.x, 12, viewport.x - width - 12)
        origin.y = maxf(origin.y, viewport.y * 0.17)
        var shape := PackedVector2Array([origin, origin + Vector2(width, 0), origin + Vector2(0, width), origin + Vector2(width, width)])
        draw_polyline(shape, Color(0.10, 0.17, 0.19, alpha * 0.65), 4.8 * unit, true)
        draw_polyline(shape, Color(0.94, 0.95, 0.85, alpha), 2.2 * unit, true)
