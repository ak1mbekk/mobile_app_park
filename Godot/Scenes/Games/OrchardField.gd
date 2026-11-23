extends Control

const APPLE = preload("res://Scenes/Games/Art/fruit.webp")
const CONE = preload("res://Scenes/Games/Art/pine-cone.webp")
const RELEASE := 0.23
const LANDING_TURNS := 0.86
# The opening spans x=30..186 in each 216 px basket render. At impact the
# sprites are rotated: these are their opaque left/right extents, in widths
# from the sprite's centre (first pair falls on the left side of the field).
const MOUTH_HALF := 78.0 / 216.0
const APPLE_LANDING := [Vector2(-0.494, 0.449), Vector2(-0.428, 0.455)]
const CONE_LANDING := [Vector2(-0.386, 0.285), Vector2(-0.417, 0.481)]
@export var ground_shadow: Texture2D
@onready var catcher = %Walker

var fruit_x := 0.5
var fall := 0.0
var cone := false
var fruit_visible := false
var flash := 0.0
var effect := ""
var landing_x := 0.5
var landing_height := 0.0


func _fruit_width(field: Vector2) -> float:
    return clampf(field.x * 0.141, 44, 75)

func overlaps_mouth(drop_x: float, is_cone: bool) -> bool:
    var field: Vector2 = catcher.size if catcher.size.x > 0.0 else get_viewport_rect().size
    var opening: float = catcher.basket_width() * MOUTH_HALF
    var extent: Vector2 = (CONE_LANDING if is_cone else APPLE_LANDING)[0 if drop_x < 0.5 else 1]
    var dx: float = drop_x * field.x - catcher.mouth_center().x
    return dx + extent.x * _fruit_width(field) < opening and dx + extent.y * _fruit_width(field) > -opening

func _draw() -> void:
    var basket: Vector2 = catcher.mouth_center()
    var pulse := 1.0 - flash
    var ground_y := size.y * 0.95
    _draw_landing(basket, pulse)
    var anchor := Vector2(fruit_x * size.x, maxf(49.0, size.y * 0.13))
    var width := _fruit_width(size)
    if fruit_visible:
        var texture := CONE if cone else APPLE
        var fall_phase := clampf(inverse_lerp(RELEASE, 1.0, fall), 0, 1)
        if fall_phase > 0.35:
            _draw_shadow(Vector2(anchor.x, ground_y), width * (1.12 - fall_phase * 0.31), fall_phase * 0.8)
        _draw_twig(anchor, width)
        var center := anchor.lerp(Vector2(anchor.x, basket.y), fall_phase * fall_phase)
        var angle := sin(fall * 27.0) * 0.12 if fall < RELEASE else (1.0 if fruit_x < 0.5 else -1.0) * fall_phase * TAU * LANDING_TURNS
        _draw_fruit(texture, center, width, angle, 1.0)


func _draw_shadow(center: Vector2, width: float, opacity: float) -> void:
    var span := Vector2(width, width * 0.19)
    draw_texture_rect(ground_shadow, Rect2(center - span * 0.5, span), false, Color(1, 1, 1, opacity))


func _draw_twig(anchor: Vector2, width: float) -> void:
    var tip := anchor - Vector2(0, width * 0.33)
    var origin := Vector2(tip.x + (12.0 if fruit_x < 0.5 else -12.0), 0)
    var joint := origin.lerp(tip, 0.7)
    draw_line(origin, joint, Color("#553d23"), 6.0, true)
    draw_line(joint, tip, Color("#7d6135"), 4.0, true)
    for side in [-1.0, 1.0]:
        var leaf := joint + Vector2(side * 23.0, -9.0)
        draw_colored_polygon(PackedVector2Array([
            joint, joint + Vector2(side * 12.0, -13.0), leaf,
            joint + Vector2(side * 12.0, 2.0),
        ]), Color("#718141") if side < 0 else Color("#a6a34d"))
        draw_line(joint, leaf, Color("#b4a970"), 1.2, true)


func _draw_landing(basket: Vector2, pulse: float) -> void:
    if flash <= 0.0:
        return
    var mouth := basket
    if effect == "catch":
        var color := Color(1.0, 0.93, 0.52, flash)
        for index in 5:
            var direction := Vector2.from_angle(-PI + (index + 1) * PI / 6.0)
            var spark := mouth + direction * lerpf(18.0, 61.0, pulse)
            draw_circle(spark, lerpf(3.6, 1.0, pulse), color, true, -1.0, true)
    elif effect == "rattle":
        _draw_fruit(CONE, mouth + Vector2(12.0 * pulse, -sin(PI * pulse) * 38.0), 43.0, 4.0 * pulse, flash)
    else:
        var width := _fruit_width(size)
        var floor_y := size.y * 0.95 - width * 0.4
        var bounce := clampf((pulse - 0.55) / 0.45, 0.0, 1.0)
        var drop_y := lerpf(landing_height, floor_y, minf(pulse / 0.55, 1.0))
        var center := Vector2(landing_x * size.x, drop_y - sin(bounce * PI) * width * 0.26)
        var angle := (1.0 if landing_x < 0.5 else -1.0) * TAU * (LANDING_TURNS + 0.25 * pulse)
        _draw_fruit(CONE if effect == "pass" else APPLE, center, width, angle, 1.0 - bounce)


func _draw_fruit(texture: Texture2D, center: Vector2, width: float, angle: float, opacity: float) -> void:
    var height := texture.get_height() * width / texture.get_width()
    var fruit_size := Vector2(width, height)
    draw_set_transform(center, angle)
    draw_texture_rect(texture, Rect2(-fruit_size / 2.0, fruit_size), false, Color(1.0, 1.0, 1.0, opacity))
    draw_set_transform(Vector2.ZERO)
