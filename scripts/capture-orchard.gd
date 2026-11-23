extends SceneTree

const ROOM = preload("res://Scenes/Games/GameRoom.tscn")

var room
var surface
var field: Control

func _initialize() -> void:
    capture.call_deferred()

func capture() -> void:
    var args := OS.get_cmdline_user_args()
    if args.is_empty() or DirAccess.make_dir_recursive_absolute(args[0]) != OK:
        push_error("Pass an output directory after --")
        quit(2)
        return
    var out: String = args[0]
    var size_px := Vector2i(390, 844)
    surface = SubViewport.new()
    surface.size = size_px
    surface.size_2d_override = Vector2i(540, roundi(540.0 * size_px.y / size_px.x))
    surface.size_2d_override_stretch = true
    surface.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
    surface.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(surface)
    room = ROOM.instantiate()
    surface.add_child(room)
    room.open()
    for frame in 4: await process_frame
    await RenderingServer.frame_post_draw
    surface.get_texture().get_image().save_png(out.path_join("chest.png"))
    room.open("orchard")
    var board = room.board
    field = board.get_node("%Field")
    for frame in 8: await process_frame
    seed(755)
    var follow := Vector2.ZERO
    var last := -1
    var kinds := {}
    for frame in 240:
        if frame == 14:
            press(board.get_node("%Again").get_global_rect().get_center(), true)
            press(board.get_node("%Again").get_global_rect().get_center(), false)
        if board.running:
            var area := field.get_global_rect()
            var x: float = board.spot
            if board.kind == "cone" or board.attempt == 3:
                x = 0.12 if x > 0.5 else 0.88
            var target := area.position + area.size * Vector2(x, 0.80)
            if last != board.attempt:
                if last >= 0: press(follow, false)
                if last < 0: follow = area.get_center()
                press(follow, true)
                last = board.attempt
            var next := follow.lerp(target, 0.16)
            var move := InputEventScreenDrag.new()
            move.index = 0
            move.position = next
            move.relative = next - follow
            surface.push_input(move, true)
            follow = next
            kinds[board.kind] = true
        await RenderingServer.frame_post_draw
        var shot: Image = surface.get_texture().get_image()
        if frame == 10: shot.save_png(out.path_join("ready.png"))
        if frame == 76: shot.save_png(out.path_join("play.png"))
        if shot.save_jpg(out.path_join("frame-%03d.jpg" % frame), 0.94) != OK:
            quit(2)
            return
        await process_frame
    print("CAPTURE 240 native consecutive frames; caught=", board.caught, "; lost=", board.errors, "; kinds=", kinds)
    quit(0 if board.caught > 0 and board.errors > 0 and kinds.size() == 2 else 1)

func press(at: Vector2, down: bool) -> void:
    var e := InputEventScreenTouch.new()
    e.index = 0
    e.position = at
    e.pressed = down
    surface.push_input(e, true)
