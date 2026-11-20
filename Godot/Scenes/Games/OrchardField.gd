extends Control

const APPLE = preload("res://Scenes/Games/Art/fruit.webp")
const CONE = preload("res://Scenes/Games/Art/pine-cone.webp")

var fruit_x := 0.5
var basket_x := 0.5
var fall := 0.0
var cone := false
var fruit_visible := false
var flash := 0.0
var success := false


func _draw() -> void:
    var basket := Vector2(basket_x * size.x, size.y * 0.935)
    if flash > 0.01:
        var ring := Color(0.92, 1.0, 0.70, flash) if success else Color(1.0, 0.61, 0.36, flash)
        draw_arc(basket, lerpf(56, 33, flash), 0, TAU, 48, ring, 3.0, true)
    draw_arc(basket - Vector2(0, 3), 23, PI, TAU, 25, Color("#59391d"), 8, true)
    draw_arc(basket - Vector2(0, 4), 23, PI, TAU, 25, Color("#df9e55"), 4, true)
    var outline := PackedVector2Array([basket + Vector2(-36, -6), basket + Vector2(36, -6),
        basket + Vector2(27, 23), basket + Vector2(-27, 23)])
    draw_colored_polygon(outline, Color("#a66e38"))
    for row in 4:
        var half_width := 33.0 - row * 2.0
        var offset := Vector2(0, row * 7)
        draw_line(basket + offset - Vector2(half_width, 0), basket + offset + Vector2(half_width, 0), Color("#dfad65"), 3, true)
    draw_line(basket + Vector2(-35, -6), basket + Vector2(35, -6), Color("#f0bf7b"), 6, true)

    if fruit_visible:
        var texture := CONE if cone else APPLE
        var width := clampf(size.x * 0.14, 44, 75)
        var height := texture.get_height() * width / texture.get_width()
        var center := Vector2(fruit_x * size.x, fall * fall * size.y * 0.88 + 22)
        draw_texture_rect(texture, Rect2(center - Vector2(width, height) / 2.0, Vector2(width, height)), false)
