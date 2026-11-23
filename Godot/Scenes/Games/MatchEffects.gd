extends Control

const COLORS := [Color("b9435b"), Color("b5c65e"), Color("df9b48"), Color("b88a56"), Color("8a70a6")]
var bursts: Array = []
var flights: Array = []
var message_time := 0.0

func announce(text: String) -> void:
    $ComboBurst.text = text
    $ComboBurst.size = Vector2(size.x, 50)
    $ComboBurst.position = Vector2(0, size.y * 0.35 - 25)
    $ComboBurst.modulate.a = 1.0
    $ComboBurst.show()
    message_time = 0.85

func clear() -> void:
    bursts.clear()
    flights.clear()
    message_time = 0.0
    $ComboBurst.hide()
    queue_redraw()

func burst(at: Vector2, kind: int, strong: bool) -> void:
    bursts.append({"at": at - global_position, "age": 0.0, "color": COLORS[kind], "strong": strong})

func collect(at: Vector2, target: Vector2, texture: Texture2D) -> void:
    flights.append({"from": at - global_position, "to": target - global_position, "age": 0.0, "texture": texture})

func _process(delta: float) -> void:
    if not is_visible_in_tree() or (bursts.is_empty() and flights.is_empty() and message_time <= 0):
        return
    message_time = maxf(0.0, message_time - delta)
    $ComboBurst.visible = message_time > 0.0
    $ComboBurst.modulate.a = minf(1.0, message_time / 0.20)
    for item in bursts:
        item.age += delta
    for item in flights:
        item.age += delta
    bursts = bursts.filter(func(item): return item.age < 0.48)
    flights = flights.filter(func(item): return item.age < 0.58)
    queue_redraw()

func _draw() -> void:
    for item in bursts:
        var progress: float = item.age / 0.48
        var color: Color = item.color
        color.a = 1.0 - progress
        var radius := (13.0 if item.strong else 8.0) + progress * 24.0
        draw_arc(item.at, radius, 0, TAU, 24, Color(0.96, 0.80, 0.43, color.a * 0.55), 2, true)
        for ray in 7:
            var direction := Vector2.from_angle(float(ray) * TAU / 7.0 + 0.25)
            var dot: Vector2 = item.at + direction * radius + Vector2(0, progress * progress * 14)
            draw_circle(dot, (3.2 if item.strong else 2.5) * (1 - progress), color, true, -1, true)
    for item in flights:
        var progress: float = smoothstep(0.0, 1.0, item.age / 0.58)
        var at: Vector2 = item.from.lerp(item.to, progress) + Vector2(22 * sin(PI * progress), -35 * sin(PI * progress))
        var side := lerpf(28, 13, progress)
        draw_texture_rect(item.texture, Rect2(at - Vector2.ONE * side * 0.5, Vector2.ONE * side), false, Color(1, 1, 1, 1 - progress * 0.65))
