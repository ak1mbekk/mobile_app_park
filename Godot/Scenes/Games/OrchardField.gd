extends Control

const APPLE = preload("res://Scenes/Games/Art/fruit.webp")
const CONE = preload("res://Scenes/Games/Art/pine-cone.webp")
const RELEASE := 0.23
@export var basket_atlas: Texture2D

var fruit_x := 0.5
var basket_x := 0.5
var basket_tilt := 0.0
var harvest := 0
var fall := 0.0
var cone := false
var fruit_visible := false
var flash := 0.0
var effect := ""
var landing_x := 0.5
var landing_basket_x := 0.5


func _draw() -> void:
    var basket_width := minf(size.y * 0.24, clampf(size.x * 0.24, 82, 156))
    var basket := Vector2(basket_x * size.x, size.y - basket_width * 0.67)
    var pulse := 1.0 - flash
    var tilt := basket_tilt if fruit_visible else basket_tilt * flash
    var squash := Vector2.ONE
    if flash > 0.0:
        if effect == "catch":
            basket.y += sin(pulse * TAU) * flash * 13.0
            squash = Vector2(1.0 + flash * 0.1, 1.0 - flash * 0.12)
        elif effect == "rattle":
            tilt += sin(pulse * TAU * 2.5) * flash * 0.21
    _draw_landing(basket, pulse)
    var anchor := Vector2(fruit_x * size.x, maxf(49.0, size.y * 0.13))
    var width := clampf(size.x * 0.141, 44, 75)
    if fruit_visible:
        var texture := CONE if cone else APPLE
        var fall_phase := clampf(inverse_lerp(RELEASE, 1.0, fall), 0, 1)
        _draw_twig(anchor, width)
        var center := anchor.lerp(Vector2(anchor.x, basket.y - 12), fall_phase * fall_phase)
        var angle := sin(fall * 27.0) * 0.12 if fall < RELEASE else (1.0 if fruit_x < 0.5 else -1.0) * fall_phase * TAU * 0.86
        _draw_fruit(texture, center, width, angle, 1.0)
    var tile := float(basket_atlas.get_height())
    var source := Rect2(mini(harvest, 3) * tile, 0, tile, tile)
    draw_set_transform(basket, tilt, squash)
    draw_texture_rect_region(basket_atlas, Rect2(-basket_width * 0.5, -basket_width * 0.32, basket_width, basket_width), source)
    draw_set_transform(Vector2.ZERO)


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
    var mouth := Vector2(landing_basket_x * size.x, basket.y - 18)
    if effect == "catch":
        var color := Color(1.0, 0.93, 0.52, flash)
        for index in 5:
            var direction := Vector2.from_angle(-PI + (index + 1) * PI / 6.0)
            var spark := mouth + direction * lerpf(18.0, 61.0, pulse)
            draw_circle(spark, lerpf(3.6, 1.0, pulse), color, true, -1.0, true)
        _draw_fruit(APPLE, mouth + Vector2(0, 13.0 * pulse), 42.0 * flash, pulse, flash)
    elif effect == "rattle":
        _draw_fruit(CONE, mouth + Vector2(12.0 * pulse, -sin(PI * pulse) * 38.0), 43.0, 4.0 * pulse, flash)
    else:
        var ground := Vector2(landing_x * size.x, size.y * 0.947)
        draw_line(ground - Vector2(12 + 24 * pulse, 0), ground + Vector2(12 + 24 * pulse, 0),
            Color(0.99, 0.66, 0.4, flash), 3.0, true)
        _draw_fruit(APPLE, ground + Vector2(21.0 * pulse, -sin(PI * pulse) * 26.0), 43.0, pulse * TAU, flash)


func _draw_fruit(texture: Texture2D, center: Vector2, width: float, angle: float, opacity: float) -> void:
    var height := texture.get_height() * width / texture.get_width()
    var fruit_size := Vector2(width, height)
    draw_set_transform(center, angle)
    draw_texture_rect(texture, Rect2(-fruit_size / 2.0, fruit_size), false, Color(1.0, 1.0, 1.0, opacity))
    draw_set_transform(Vector2.ZERO)
