extends SceneTree

const ORCHARD := preload("res://Scenes/Games/Orchard.tscn")
var failures := 0
var cases := 0

func _initialize() -> void:
    _run.call_deferred()

func _expect(ok: bool, message: String) -> void:
    cases += 1
    if not ok:
        failures += 1
        if failures < 20:
            push_error(message)

func _expect_visible_parts(walker: Control) -> void:
    var prefix := "Richi/Skeleton2D/Pelvis/"
    for path: String in ["Head", "NearShoulder/Forearm/Hand/Art", "FarShoulder/Forearm/Hand/Art"]:
        var art := walker.get_node(prefix + path) as Sprite2D
        var box := art.get_rect()
        var transform := walker.get_global_transform().affine_inverse() * art.global_transform
        for corner: Vector2 in [box.position, box.end, Vector2(box.position.x, box.end.y), Vector2(box.end.x, box.position.y)]:
            var point := transform * corner
            _expect(point.x >= -0.1 and point.x <= walker.size.x + 0.1, "%s cropped at %s px in %s field" % [path, point.x, walker.size])

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
    var walker: Control = game.get_node("%Walker")
    field.set_anchors_preset(Control.PRESET_TOP_LEFT)
    walker.set_anchors_preset(Control.PRESET_TOP_LEFT)
    for kind in ["apple", "cone"]:
        var path := "res://Scenes/Games/Art/" + ("fruit.webp" if kind == "apple" else "pine-cone.webp")
        for spot: float in [0.32, 0.68]:
            var extent := _silhouette(path, (1.0 if spot < 0.5 else -1.0) * 0.86 * TAU)
            for dimensions: Vector2 in [Vector2(320, 360), Vector2(390, 700), Vector2(720, 320), Vector2(720, 760)]:
                field.size = dimensions
                walker.size = dimensions
                game.basket_position = spot
                game._draw_field()
                var mouth: float = walker.basket_width() * 78.0 / 216.0
                var fruit := extent * clampf(dimensions.x * 0.141, 44, 75)
                for tilt: float in [0.0]:
                    for direction: float in [-1.0, 1.0]:
                        var limit := direction * mouth * cos(tilt) - (fruit.x if direction > 0 else fruit.y)
                        for overlap: float in [-1.0, 1.0]:
                            game.basket_position = spot - (limit - direction * overlap) / dimensions.x
                            game.spot = spot
                            game.kind = kind
                            game.errors = 0
                            game.caught = 0
                            game._draw_field()
                            game._land()
                            var grabbed: bool = game.caught == 1 if kind == "apple" else game.errors == 1
                            cases += 1
                            if grabbed != (overlap > 0):
                                failures += 1
                                push_error("%s %s: rim side %s, tilt %s, overlap %s px" % [kind, dimensions, direction, tilt, overlap])
    var saved := {"id": 7, "revision": 4, "attempt": 3, "caught": 2, "errors": 1,
        "position": 0.4, "spot": 0.6, "fall": 0.45, "kind": "apple", "finished": false, "won": false}
    game.restore(saved)
    _expect(is_equal_approx(game.basket_position, 0.4) and is_equal_approx(game.target_position, 0.4), "Existing save must restore catcher and discard target")
    _expect(game.caught == 2 and game.errors == 1 and is_equal_approx(game.fall, 0.45), "Save progress changed")
    var legacy := saved.duplicate()
    legacy.erase("errors")
    legacy.erase("kind")
    game.restore(legacy)
    _expect(game.errors == 1 and game.kind == "apple" and game.running, "Legacy save without kind/errors failed")
    game.restore(saved.merged({"errors": 3, "finished": true}, true))
    _expect(not game.running and game.errors == 3, "Finished save restarted")
    game.restore(saved)
    game._move_basket(0.85)
    var before: float = game.basket_position
    _expect(is_equal_approx(before, 0.4), "Pointer target teleported actual basket")
    game._process(1.0 / 60.0)
    _expect(game.basket_position > before and game.basket_position < 0.85, "Catcher failed bounded movement")
    var previous: float = game.basket_position
    game._move_basket(0.15)
    game._process(1.0 / 60.0)
    _expect(game.basket_position < previous and absf(game.basket_position - previous) <= 3.8 / 60.0 + 0.0001, "Direction reversal jumped")
    game.checkpoint()
    _expect(is_equal_approx(game.target_position, game.basket_position), "Checkpoint leaves stale finger target")
    var records: Array[Dictionary] = []
    game.round_saved.connect(func(record: Dictionary): records.append(record.duplicate(true)))
    game._move_basket(0.8)
    game._process(1.0 / 60.0)
    game.checkpoint()
    _expect(not records.is_empty() and is_equal_approx(records.back().position, game.basket_position), "Moving checkpoint saved pointer target instead of real catcher")
    var resumed: Dictionary = records.back().duplicate(true)
    game._move_basket(0.1)
    game.restore(resumed)
    _expect(is_equal_approx(game.basket_position, resumed.position) and is_equal_approx(game.target_position, resumed.position), "New checkpoint does not resume at real basket")
    var area := field.get_global_rect()
    before = game.basket_position
    game._handle_pointer(area.position + area.size * Vector2(0.75, 0.6), 1, true, area)
    _expect(game.finger == 1 and game.target_position > before and is_equal_approx(game.basket_position, before), "Touch down fails to set non-teleporting catcher target")
    game._handle_pointer(area.get_center(), 1, false, area)
    _expect(game.finger == -1, "Touch release did not release the active finger")
    for extreme: float in [-1.0, 2.0]:
        game._move_basket(extreme)
        for step in 40:
            game.fall = 0.01
            game._process(1.0 / 60.0)
        var center: Vector2 = walker.mouth_center()
        var half_width: float = walker.basket_width() * 78.0 / 216.0
        _expect(center.x - half_width >= -0.1 and center.x + half_width <= walker.size.x + 0.1, "Visible mouth clipped at edge")
    game.checkpoint()
    var saved_position: float = game.basket_position
    walker.size = Vector2(320, 360)
    field.size = walker.size
    game._draw_field()
    _expect(is_equal_approx(game.basket_position, game._playable_x(saved_position)), "Resize must preserve position within the new playable range")
    _expect(absf(walker.mouth_center().x - game.basket_position * walker.size.x) < 0.01, "Resize detaches visible mouth from logical catcher")
    for dimensions: Vector2 in [Vector2(320, 360), Vector2(390, 700), Vector2(720, 320), Vector2(720, 760)]:
        field.size = dimensions
        walker.size = dimensions
        for edge: float in [0.0, 1.0]:
            game.basket_position = game._playable_x(edge)
            game._draw_field()
            _expect_visible_parts(walker)
            var old_spot := 0.1 if edge == 0.0 else 0.9
            for old_kind: String in ["apple", "cone"]:
                _expect(field.overlaps_mouth(old_spot, old_kind == "cone"), "Saved %s at x=%s unreachable in %s" % [old_kind, old_spot, dimensions])
    walker.size = Vector2(720, 320)
    game.restore(saved.merged({"errors": 3, "finished": true, "position": 0.09}, true))
    walker.size = Vector2(320, 700)
    _expect_visible_parts(walker)
    _expect(not game.running, "Resizing a completed round must not start a new round")
    game.free()
    if failures == 0:
        print("PASS %d orchard checks: +/-1px drawn rim, apple/cone, four sizes, legacy/current saves, reversal, edges and resize" % cases)
    quit(1 if failures else 0)
