extends SceneTree

const ORCHARD := preload("res://Scenes/Games/Orchard.tscn")
var failures := 0
var cases := 0

func _initialize() -> void:
    _run.call_deferred()

# Measure the rendered WebP silhouette independently of the gameplay constants.
func _silhouette(path: String, angle: float) -> Vector2:
    var image := Image.new()
    if image.load_webp_from_buffer(FileAccess.get_file_as_bytes(path)) != OK:
        failures += 1
        push_error("Cannot measure art: " + path)
        return Vector2.ZERO
    var dims := Vector2(image.get_size())
    var bounds := Vector2(INF, -INF)
    for y in image.get_height():
        for x in image.get_width():
            if image.get_pixel(x, y).a <= 100.0 / 255.0:
                continue
            var point := (Vector2(x + 0.5, y + 0.5) - dims * 0.5) / dims.x
            var projected := point.rotated(angle).x
            bounds.x = minf(bounds.x, projected)
            bounds.y = maxf(bounds.y, projected)
    return bounds

func _run() -> void:
    var game = ORCHARD.instantiate()
    root.add_child(game)
    var field: Control = game.get_node("%Field")
    field.set_anchors_preset(Control.PRESET_TOP_LEFT)
    for kind in ["apple", "cone"]:
        var path := "res://Scenes/Games/Art/" + ("fruit.webp" if kind == "apple" else "pine-cone.webp")
        for spot: float in [0.32, 0.68]:
            var extent := _silhouette(path, (1.0 if spot < 0.5 else -1.0) * 0.86 * TAU)
            for dimensions: Vector2 in [Vector2(320, 360), Vector2(390, 700), Vector2(720, 320), Vector2(720, 760)]:
                field.size = dimensions
                var mouth := minf(dimensions.y * 0.24, clampf(dimensions.x * 0.24, 82, 156)) * 78.0 / 216.0
                var fruit := extent * clampf(dimensions.x * 0.141, 44, 75)
                for tilt: float in [0.0, 0.28]:
                    for direction: float in [-1.0, 1.0]:
                        var limit := direction * mouth * cos(tilt) - (fruit.x if direction > 0 else fruit.y)
                        for overlap: float in [-1.0, 1.0]:
                            game.basket_position = spot - (limit - direction * overlap) / dimensions.x
                            game.spot = spot
                            game.basket_tilt = tilt
                            game.kind = kind
                            game.errors = 0
                            game.caught = 0
                            game._land()
                            var grabbed: bool = game.caught == 1 if kind == "apple" else game.errors == 1
                            cases += 1
                            if grabbed != (overlap > 0):
                                failures += 1
                                push_error("%s %s: rim side %s, tilt %s, overlap %s px" % [kind, dimensions, direction, tilt, overlap])
    game.free()
    if failures == 0:
        print("PASS %d orchard landings at +/-1px of the drawn rim: apple/cone, both edges and tilts, four field sizes" % cases)
    quit(1 if failures else 0)
