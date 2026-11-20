extends Node3D

const SAVE_PATH := "user://home.cfg"
const HOST_PREFIX := "animal-park:"
const BALL_PRICE := 5
const MAIN := &"main"
const KITCHEN := &"kitchen"
const BATH := &"bathroom"
const PREVIEW_ROOMS := {
    &"bed-preview": MAIN, &"settee-preview": MAIN, &"bath-preview": BATH, &"kitchen-preview": KITCHEN,
}
const FURNITURE_PREVIEWS := {
    "bed": &"bed-preview", "settee": &"settee-preview", "bath": &"bath-preview",
    "wallpaper": &"kitchen-preview", "kitchen-cabinet": &"kitchen-preview", "bath-tile": &"bath-preview",
}
const SHOP_CATALOG = preload("res://Scenes/Shop/ShopCatalog.gd")
const BED_PRICE := SHOP_CATALOG.BED_PRICE
const SHOP_SAVE_ERROR := "Не удалось сохранить изменение на устройстве. Попробуй ещё раз."

@export var pet_name := "Ричи"
@export var growth_mesh: ArrayMesh

@onready var richi: Node3D = $Комната/Аки
@onready var room_camera: Camera3D = $"Комната/Игровая камера"
@onready var apple: MeshInstance3D = $Комната/Яблоко
@onready var sun: DirectionalLight3D = $"Комната/Утреннее солнце"
@onready var bounce: OmniLight3D = $"Комната/Отражённый свет"
@onready var ambience: WorldEnvironment = $"Комната/Свет комнаты"
@onready var window_view: MeshInstance3D = $"Комната/Веранда/Пойма"
@onready var window_material := window_view.get_active_material(0) as StandardMaterial3D
@onready var curtain: Node3D = $"Комната/Веранда/Оконная стена/Портьера"
@onready var linen: ShaderMaterial = curtain.get_node("Льняные складки").material_override
@onready var curtain_rings := curtain.find_children("Петля *", "MeshInstance3D", false, false)
@onready var rug: Node3D = $"Комната/Веранда/Ковёр"
@onready var bedroom: Node3D = $Спальня
@onready var night_lamp: OmniLight3D = $Спальня/Свет/Ночник
@onready var bathroom: Node3D = $Купание
@onready var care: Node3D = $Уход
@onready var stations: Node3D = $"Станции ухода"
@onready var kitchen: Node3D = $"Комнаты ухода/Кухня"
@onready var bath_room: Node3D = $"Комнаты ухода/Ванная"
@onready var dining: Node3D = $"Комнаты ухода/Кухня/Сервировка"
@onready var furnishings: Node3D = $Обстановка
@onready var game_room: Control = get_node_or_null("Интерфейс/GameRoom")
@onready var shop: Control = get_node_or_null("Интерфейс/Shop")
@onready var status: Label = %Status
@onready var awake_pose := richi.transform
@onready var idle_pose := awake_pose.rotated_local(Vector3.UP, 0.42)
@onready var day_sun := sun.light_energy
@onready var day_bounce := bounce.light_energy
@onready var day_bounce_color := bounce.light_color
@onready var day_ambient := ambience.environment.ambient_light_energy
@onready var day_ambient_color := ambience.environment.ambient_light_color
@onready var night_lamp_energy := night_lamp.light_energy
@onready var room_fov := room_camera.fov
@onready var main_camera := room_camera.global_transform

var active_mode: StringName = &"home"
var night := false
var hosted := false
var has_host_state := false
var meal_in_progress := false
var awaiting_meal_result := false
var keyboard_hotspots := false
var guide_in_overlay := false
var ball_owned := false
var web_pause_callback: JavaScriptObject
var web_state_callback: JavaScriptObject
var web_interaction_callback: JavaScriptObject
var web_navigation_callback: JavaScriptObject
var pose_tween: Tween
var sleep_moving := false
var bath_moving := false
var tableware_moving := false
var hunger_visit_started := false
var location: StringName = MAIN
var native_rounds := {}
var native_leaves := 0
var native_xp := 0
var native_owned: Array[String] = []
var native_placed: Array[String] = []
var native_hat := ""
var native_bed_goal_dismissed := false
var native_shop_selected := ""
var native_shop_status := ""
var native_starter_round_rewarded := false
var hosted_bed_goal := {}
var has_sleep_furniture := false
var settee_in_use := false
var native_needs := {"food": 50.0, "clean": 50.0, "energy": 50.0, "joy": 50.0}
var native_needs_updated := 0.0

func _ready() -> void:
    ambience.environment = ambience.environment.duplicate()
    apple.global_position = kitchen.get_node("Яблоко у миски").global_position
    apple.floor_position = apple.global_position
    dining.bind_actor(richi)
    apple.picked_up.connect(richi.gaze.follow_apple.bind(apple))
    apple.returned_to_floor.connect(richi.gaze.release_apple)
    apple.accepted.connect(_on_accepted)
    richi.meal_finished.connect(_on_fed)
    bathroom.washed.connect(_on_washed)
    bathroom.exit_button.pressed.connect(_back_to_room)
    %Feed.pressed.connect(_offer_apple)
    %Wash.pressed.connect(_start_wash)
    %Sleep.pressed.connect(_toggle_sleep)
    %Play.pressed.connect(_open_games)
    %ToyBall.pressed.connect(_play_ball)
    _set_hotspot_focus(false)
    care.play_finished.connect(_on_ball_finished)
    %MainRoom.pressed.connect(_go_to_room.bind(MAIN))
    %KitchenRoom.pressed.connect(_go_to_room.bind(KITCHEN))
    %BathRoom.pressed.connect(_go_to_room.bind(BATH))
    %Shop.pressed.connect(_offer_shop)
    %GoalAction.pressed.connect(_take_bed_goal)
    %GoalLater.pressed.connect(_dismiss_bed_goal)
    %Profile.pressed.connect(_open_profile)
    %Park.pressed.connect(_notify_host.bind("park"))
    %Profile.focus_entered.connect(%ProfileHint.show)
    %Profile.focus_exited.connect(%ProfileHint.hide)
    %LocalClose.pressed.connect(%LocalProfile.hide)
    %Back.pressed.connect(_back_to_room)
    if game_room:
        game_room.closed.connect(_close_games)
        game_room.round_saved.connect(_store_round)
        game_room.ball_purchase_requested.connect(_buy_ball)
        game_room.ball_play_requested.connect(_play_ball)
    if shop:
        shop.closed.connect(_close_shop)
        shop.catalog_requested.connect(_show_shop_catalog)
        shop.confirm_requested.connect(_confirm_shop_ware)
        shop.item_selected.connect(_select_shop_ware)
    hosted = OS.has_feature("web") and JavaScriptBridge.eval(
        "window.parent !== window && new URLSearchParams(location.search).get('host') === 'animal-park'"
    )
    %Park.visible = hosted
    get_viewport().size_changed.connect(_position_stations)
    %Header.resized.connect(_position_stations)
    _show_room()
    if hosted:
        var browser := JavaScriptBridge.get_interface("window")
        web_pause_callback = JavaScriptBridge.create_callback(_sync_pause)
        web_state_callback = JavaScriptBridge.create_callback(_sync_state)
        web_navigation_callback = JavaScriptBridge.create_callback(_write_navigation_state)
        browser.setParkScenePaused = web_pause_callback
        browser.setParkHomeState = web_state_callback
        browser.getParkNavigationState = web_navigation_callback
        browser.parkNativeGameRoom = game_room != null
        browser.parkNativeShop = shop != null
        if JavaScriptBridge.eval("""(() => {
            try {
                return parent.location.origin === location.origin &&
                    new URLSearchParams(parent.location.search).get('test') === 'interaction';
            } catch (_) { return false; }
        })()"""):
            web_interaction_callback = JavaScriptBridge.create_callback(_write_interaction_state)
            browser.getParkInteractionState = web_interaction_callback
        _notify_host("home-ready")
    else:
        _load_home()
        %NeedsTick.timeout.connect(_refresh_native_needs)
        %NeedsTick.start()

func _show_room(animate := true) -> void:
    _set_mode(&"home", animate)
    richi.idle_in_home()
    _set_status("")
    _check_hungry_room.call_deferred()

func _update_input_modality(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not keyboard_hotspots:
        _set_hotspot_focus(true)
    elif keyboard_hotspots and (event is InputEventScreenTouch or event is InputEventMouseButton):
        _set_hotspot_focus(false)

func _set_hotspot_focus(keyboard: bool) -> void:
    keyboard_hotspots = keyboard
    for hotspot in %Actions.get_children():
        if hotspot is Button:
            if keyboard:
                hotspot.remove_theme_stylebox_override("focus")
            else:
                hotspot.add_theme_stylebox_override("focus", hotspot.get_theme_stylebox("normal"))

func _offer_apple() -> void:
    if meal_in_progress or night or _moving_between_places():
        return
    if location != KITCHEN and not _go_to_room(KITCHEN):
        return
    _check_hungry_room()
    if dining.state == &"waiting":
        tableware_moving = true
        _refresh_controls()
        dining.put_down(_start_food)
        return
    _start_food()

func _start_food() -> void:
    tableware_moving = false
    _set_mode(&"feed")
    richi.offer_apple()
    apple.reset_apple()
    apple.set_process_input(true)
    _set_status("")

func _on_accepted() -> void:
    meal_in_progress = true
    richi.gaze.finish_tracking()
    %Back.disabled = true

func _on_fed() -> void:
    meal_in_progress = false
    _set_mode(&"home")
    richi.idle_in_home()
    dining.finish_meal()
    _set_status("")
    awaiting_meal_result = float(richi.needs.get("food", 50)) < 99.99
    if not hosted:
        _increase_native_need("food", 32)
        _finish_meal_reaction(native_needs)
        _save_home()
    _notify_host("meal-finished")

func _finish_meal_reaction(needs: Dictionary) -> void:
    if awaiting_meal_result and float(needs.get("food", 0)) >= 99.99:
        richi.react_to_full_meal()
    awaiting_meal_result = false

func _start_wash() -> void:
    if location != BATH or meal_in_progress or night or _moving_between_places() or active_mode != &"home":
        return
    _move_between_floor_and_bath(true)

func _back_to_room() -> void:
    if _moving_between_places():
        return
    if active_mode == &"bath":
        _move_between_floor_and_bath(false)
    else:
        _show_room()

func _moving_between_places() -> bool:
    return sleep_moving or bath_moving or tableware_moving

func _go_to_room(next: StringName) -> bool:
    if night or meal_in_progress or _moving_between_places() or active_mode not in [&"home", &"feed"]:
        _refresh_controls()
        return false
    if (game_room and game_room.visible) or (shop and shop.visible):
        _refresh_controls()
        return false
    if next == location:
        _refresh_controls()
        return true
    if location == KITCHEN:
        apple.set_process_input(false)
        dining.clear()
    richi.gaze.reset_attention()
    location = next
    room_camera.global_transform = _camera_in(location)
    _show_room(false)
    if location == KITCHEN:
        _check_hungry_room()
    return true

func _camera_in(place: StringName) -> Transform3D:
    if place == KITCHEN:
        return kitchen.get_node("Камера комнаты").global_transform
    if place == BATH:
        return bath_room.get_node("Камера комнаты").global_transform
    return main_camera

func _check_hungry_room() -> void:
    var hungry: bool = richi._need_is_low("food")
    if not hungry:
        hunger_visit_started = false
    if get_tree().paused or active_mode != &"home" or night or meal_in_progress or _moving_between_places():
        return
    if (game_room and game_room.visible) or (shop and shop.visible):
        return
    if location == KITCHEN:
        if hungry:
            hunger_visit_started = true
            if dining.state == &"set":
                dining.clear()
            dining.wait_for_food()
        elif dining.state == &"waiting":
            dining.clear()
            richi.idle_in_home()
    elif location == MAIN and hungry and not hunger_visit_started:
        hunger_visit_started = true
        _go_to_room(KITCHEN)

func _move_between_floor_and_bath(entering: bool) -> void:
    bath_moving = true
    if pose_tween:
        pose_tween.kill()
    richi.stop_purchase_celebration()
    richi.resting_at_home = false
    richi.gaze.suspended = true
    bathroom.preview()
    _set_status("")
    var camera_motion := create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    camera_motion.tween_property(room_camera, "fov", room_fov + 3.5, 0.35)

    var floor_pose := _day_pose()
    var outside := Transform3D(floor_pose.basis, bathroom.get_node("Подход к купели").global_position)
    var inside: Transform3D = bathroom.get_node("Место для Ричи").global_transform.scaled_local(awake_pose.basis.get_scale())
    var standing := Transform3D(inside.basis, bathroom.get_node("Опора при переступании").global_position)
    var toward_bath := _face_point(outside, standing.origin)
    var away_from_bath := _face_point(standing, outside.origin)
    var waypoints: Array[Vector3] = []
    var motion := create_tween()
    if entering:
        waypoints.append(outside.origin)
        _walk_on_floor(motion, floor_pose, waypoints)
        motion.tween_callback(_set_mode.bind(&"bath", false, false))
        motion.tween_property(richi, "transform", toward_bath, 0.29)
        _step_over_bath_edge(motion, toward_bath, Transform3D(toward_bath.basis, standing.origin))
        motion.tween_callback(_play_travel_animation.bind(&"Idle_Step_Turn_Left", 0.0, 1.7, 0.12))
        motion.tween_property(richi, "transform", standing, 0.29)
        _change_bath_pose(motion, &"Stand_to_Sit_Transition_M", 4.3, inside)
    else:
        _change_bath_pose(motion, &"Sit_to_Stand_Transition_M", 5.7, standing)
        motion.tween_callback(_play_travel_animation.bind(&"Idle_Step_Turn_Left", 0.0, 1.7, 0.12))
        motion.tween_property(richi, "transform", away_from_bath, 0.29)
        var landing := Transform3D(away_from_bath.basis, outside.origin)
        _step_over_bath_edge(motion, away_from_bath, landing)
        motion.tween_callback(_set_mode.bind(&"home", false, false))
        waypoints.append(floor_pose.origin)
        _walk_on_floor(motion, landing, waypoints)
        motion.tween_property(richi, "transform", floor_pose, 0.23)
    motion.tween_property(room_camera, "fov", room_fov, 0.32).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    motion.tween_callback(_finish_bath_movement.bind(entering))

func _change_bath_pose(motion: Tween, clip: StringName, speed: float, target: Transform3D) -> void:
    motion.tween_callback(_play_travel_animation.bind(clip, 0.0, speed, 0.16))
    motion.tween_property(richi, "transform", target, richi.player.get_animation(clip).length / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _walk_on_floor(motion: Tween, start: Transform3D, waypoints: Array[Vector3]) -> void:
    motion.tween_callback(_play_travel_animation.bind(&"Walking", 0.0, 1.22, 0.13))
    for point in waypoints:
        var step_time := start.origin.distance_to(point) / 0.72
        if step_time < 0.01:
            continue
        var heading := _face_point(start, point)
        motion.tween_property(richi, "transform", heading, 0.18)
        start = Transform3D(heading.basis, point)
        motion.tween_property(richi, "transform", start, step_time)

func _step_over_bath_edge(motion: Tween, from: Transform3D, to: Transform3D) -> void:
    motion.tween_callback(_play_travel_animation.bind(&"Regular_Jump", 0.12, 1.32, 0.13))
    motion.tween_interval(0.29)
    motion.tween_method(_move_along_arc.bind(from, to, 0.23, 1.65), 0.0, 1.0, 0.59)
    motion.tween_interval(0.21)

func _finish_bath_movement(entering: bool, restored: bool = false) -> void:
    bath_moving = false
    if entering:
        richi.gaze.suspended = false
        richi.gaze.mood_angles = Vector2.ZERO
        richi.resting_at_home = false
        richi.player.play(&"Sit_Cross_Legged", 0.0 if restored else 0.18)
        if restored:
            richi.player.advance(0.0)
        bathroom.start(richi)
        _refresh_controls()
        _notify_host("wash-ready")
    else:
        _show_room()
        _notify_host("wash-closed")

func _on_washed() -> void:
    bathroom.exit_button.hide()
    richi._set_eyelids(0.45, 0.14)
    if not hosted:
        _increase_native_need("clean", 55)
        _save_home()
    _notify_host("wash-finished")
    await get_tree().create_timer(bathroom.CLEAN_SECONDS, false).timeout
    richi._set_eyelids(0.0, 0.16)
    if active_mode == &"bath" and not bath_moving:
        _move_between_floor_and_bath(false)

func _open_games() -> void:
    if location != MAIN or _moving_between_places():
        return
    if hosted:
        _notify_host("games")
    else:
        _launch_games()

func _buy_ball() -> void:
    if hosted:
        _notify_host("buy-ball")
    elif not ball_owned and not night and native_leaves >= BALL_PRICE:
        native_leaves -= BALL_PRICE
        ball_owned = true
        if not _save_home():
            native_leaves += BALL_PRICE
            ball_owned = false
            return
        _update_native_stats()
        _celebrate_purchase()

func _play_ball() -> void:
    if location != MAIN or not ball_owned or active_mode != &"home" or not _can_start_play():
        return
    _set_mode(&"ball", false)
    _set_status("")
    care.play_toy(richi, richi.age_stage)

func _on_ball_finished(stage: int) -> void:
    _show_room()
    var reactions := [" поймал мяч!", " вернул тебе мяч", " принёс тебе мяч"]
    _set_status(pet_name + reactions[stage])

func _can_start_play() -> bool:
    if night:
        return false
    if not hosted:
        _refresh_native_needs()
    var needs: Dictionary = richi.needs
    var reason := ""
    if float(needs.get("food", 50.0)) <= 25.0:
        reason = "Сначала угости енота. Он проголодался."
    elif float(needs.get("energy", 50.0)) <= 25.0:
        reason = pet_name + " устал. Дай ему поспать."
    if reason.is_empty():
        return true
    richi.refuse()
    _set_status(reason)
    return false

func _launch_games(game := "") -> void:
    if not game_room or (not hosted and not _can_start_play()):
        return
    %Header.hide()
    $Комната.hide()
    stations.hide()
    furnishings.hide()
    game_room.open(game)
    _refresh_controls()

func _close_games() -> void:
    %Header.show()
    $Комната.show()
    _refresh_controls()
    _check_hungry_room.call_deferred()

func _open_shop() -> void:
    %Header.hide()
    shop.open()
    _refresh_controls()

func _offer_shop() -> void:
    if hosted:
        _notify_host("shop")
    elif shop and not night:
        _show_shop_catalog()
        _open_shop()

func _close_shop() -> void:
    if hosted:
        _notify_host("shop:closed")
    else:
        _show_shop_catalog()
    %Header.show()
    _show_room()

func _select_shop_ware(id: String) -> void:
    if hosted:
        _notify_host("shop:pick:" + id)
    elif shop.visible and not night and SHOP_CATALOG.ITEMS.has(id):
        native_shop_selected = id
        native_shop_status = ""
        _sync_native_shop()

func _show_shop_catalog() -> void:
    if hosted:
        _notify_host("shop:catalog")
    else:
        native_shop_selected = ""
        native_shop_status = ""
        _sync_native_shop()

func _confirm_shop_ware() -> void:
    if hosted:
        _notify_host("shop:confirm")
    elif shop.visible and not native_shop_selected.is_empty():
        if not _commit_native_ware(native_shop_selected):
            native_shop_status = SHOP_SAVE_ERROR
            _sync_native_shop()

func _commit_native_ware(id: String) -> bool:
    var ware: Dictionary = SHOP_CATALOG.ITEMS.get(id, {})
    if night or ware.is_empty():
        return false
    var purchased := native_owned.has(id)
    var price: int = ware.price
    if not purchased and native_leaves < price:
        return false
    var leaves_before := native_leaves
    var owned_before := native_owned.duplicate()
    var placed_before := native_placed.duplicate()
    var hat_before := native_hat
    if not purchased:
        native_leaves -= price
        native_owned.append(id)
    if id in SHOP_CATALOG.HATS:
        native_hat = "" if native_hat == id else id
    elif native_placed.has(id):
        native_placed.erase(id)
    else:
        if id == "bed":
            native_placed.erase("settee")
        elif id == "settee":
            native_placed.erase("bed")
        native_placed.append(id)
    if not _save_home():
        native_leaves = leaves_before
        native_owned = owned_before
        native_placed = placed_before
        native_hat = hat_before
        return false
    _show_shop_catalog()
    _update_native_stats()
    if not purchased:
        _celebrate_purchase()
    return true

func _celebrate_purchase() -> void:
    if night:
        return
    if game_room and game_room.visible:
        game_room.checkpoint()
        game_room.hide()
        _close_games()
    if shop and shop.visible:
        shop.hide()
        %Header.show()
    _show_room(false)
    richi.celebrate_purchase()

func _sync_native_shop() -> void:
    var selected := native_shop_selected
    richi.wear_hat(selected if selected in SHOP_CATALOG.HATS else native_hat)
    _apply_furniture({"placed": native_placed, "preview": selected})
    if not shop:
        return
    var items := {}
    for id: String in SHOP_CATALOG.ITEMS:
        var ware: Dictionary = SHOP_CATALOG.ITEMS[id]
        var detail: String = ware.tier
        if ware.has("replaces"):
            detail += " · заменяет " + ware.replaces
        items[id] = {
            "name": ware.name, "detail": detail,
            "price": "Куплено" if native_owned.has(id) else SHOP_CATALOG.leaf_price(ware.price),
        }
    var confirm_label := ""
    var confirm_enabled := false
    if not selected.is_empty():
        var price: int = SHOP_CATALOG.ITEMS[selected].price
        var is_hat := selected in SHOP_CATALOG.HATS
        var installed := native_hat == selected if is_hat else native_placed.has(selected)
        var purchased := native_owned.has(selected)
        confirm_enabled = purchased or native_leaves >= price
        if installed:
            confirm_label = "Снять" if is_hat else "Убрать"
        elif purchased:
            confirm_label = "Надеть" if is_hat else "Поставить"
        else:
            confirm_label = "Купить за " + SHOP_CATALOG.leaf_price(price)
    shop.set_state({
        "wallet": native_leaves, "selected": selected, "status": native_shop_status,
        "confirm_label": confirm_label, "confirm_enabled": confirm_enabled, "items": items,
    })

func _bed_goal() -> Dictionary:
    if hosted:
        return hosted_bed_goal
    if night or has_sleep_furniture or native_bed_goal_dismissed:
        return {}
    if native_owned.has("bed"):
        return {"message": "Поставь лежанку, чтобы енот мог отдохнуть.", "label": "Поставить лежанку", "play": false}
    var recipient := "Ричи" if pet_name == "Ричи" else "еноту по имени " + pet_name
    var message := "Надо купить лежанку нашему " + recipient + "."
    if native_leaves >= BED_PRICE:
        return {"message": message, "label": "Купить лежанку за %d листиков" % BED_PRICE, "play": false}
    return {"message": message + " Давай сыграем в игру и заработаем листики!", "label": "Сыграть", "play": true}

func _take_bed_goal() -> void:
    var goal := _bed_goal()
    if goal.is_empty():
        return
    if goal.get("play", false):
        if hosted:
            _notify_host("games:starter")
        else:
            _launch_games("pairs")
    elif hosted:
        _notify_host("buy-bed")
    elif not _commit_native_ware("bed"):
        _set_status(SHOP_SAVE_ERROR)

func _dismiss_bed_goal() -> void:
    if hosted:
        _notify_host("bed:later")
    else:
        native_bed_goal_dismissed = true
        _refresh_controls()

func _open_profile() -> void:
    %ProfileHint.hide()
    if hosted:
        _notify_host("profile")
    else:
        %LocalName.text = pet_name
        %LocalStats.text = %Stats.text
        %LocalProfile.popup_centered()

func _input(event: InputEvent) -> void:
    _update_input_modality(event)
    if event is InputEventMouseMotion and not event.relative.is_zero_approx():
        %ProfileHint.visible = %Profile.is_visible_in_tree() and %Profile.get_global_rect().has_point(event.position)
    elif event is InputEventScreenTouch:
        %ProfileHint.hide()

func _store_round(game: String, round: Dictionary) -> void:
    if hosted:
        _notify_host("round:" + JSON.stringify({"game": game, "round": round}))
        return
    var previous: Dictionary = native_rounds.get(game, {})
    if previous.get("id", 0) > round.id:
        return
    if previous.get("id", 0) == round.id:
        if bool(previous.get("finished", false)):
            return
        if round.finished and (round.won or not native_starter_round_rewarded):
            var leaves := 5 if round.won else 0
            if round.won and game == "orchard":
                leaves = mini(10, int(round.caught / 3.0))
            elif round.won and game == "match":
                leaves += int(round.bonus)
            if not native_starter_round_rewarded:
                leaves = maxi(leaves, BED_PRICE)
            native_starter_round_rewarded = true
            var xp := 10 if round.won else 0
            round.reward = {"leaves": leaves, "xp": xp}
            var needed_leaves := native_leaves < BED_PRICE
            native_leaves += leaves
            if needed_leaves and native_leaves >= BED_PRICE:
                native_bed_goal_dismissed = false
            native_xp += xp
            if round.won:
                _increase_native_need("joy", 18)
    native_rounds[game] = round
    game_room.set_rounds(native_rounds)
    _update_native_stats()
    _save_home()

func _toggle_sleep() -> void:
    if location != MAIN or _moving_between_places() or active_mode not in [&"home", &"sleep"]:
        return
    if not night and not has_sleep_furniture:
        if hosted:
            _notify_host("bed:remind")
        else:
            native_bed_goal_dismissed = false
            _refresh_controls()
        return
    if hosted:
        _notify_host("wake" if night else "sleep")
        return
    _refresh_native_needs()
    if not night and float(native_needs.get("energy", 0.0)) > 75.0:
        richi.refuse()
        _set_status("Спать пока не хочется.")
        return
    _set_sleep(not night)
    _save_home()

func _set_sleep(value: bool, animate := true) -> void:
    if night == value:
        return
    night = value
    if animate and has_sleep_furniture:
        _move_between_floor_and_bed()
    else:
        _finish_sleep_movement()

func _day_pose() -> Transform3D:
    return _pose_in(location)

func _pose_in(place: StringName) -> Transform3D:
    if place == KITCHEN:
        return kitchen.get_node("Место для Ричи").global_transform.scaled_local(awake_pose.basis.get_scale())
    if place == BATH:
        return bath_room.get_node("Место для Ричи").global_transform.scaled_local(awake_pose.basis.get_scale())
    var pose := idle_pose
    if settee_in_use:
        pose.origin = bedroom.get_node("Место на полу у дивана").position
    return pose

func _sleep_pose() -> Transform3D:
    var marker := "Поза сна" if settee_in_use else "Поза сна на лежанке"
    return bedroom.get_node(marker).transform.scaled_local(awake_pose.basis.get_scale())

func _face_point(pose: Transform3D, point: Vector3) -> Transform3D:
    var direction := point - pose.origin
    pose.basis = Basis(Vector3.UP, atan2(direction.x, direction.z)).scaled_local(awake_pose.basis.get_scale())
    return pose

func _play_travel_animation(clip: StringName, start: float, speed: float, blend: float) -> void:
    richi.player.play_section(clip, start, -1.0, blend, speed)

func _move_between_floor_and_bed() -> void:
    sleep_moving = true
    if pose_tween:
        pose_tween.kill()
    richi.stop_purchase_celebration()
    richi.resting_at_home = false
    richi.gaze.suspended = true
    _set_status("")

    var floor_pose := _day_pose()
    var settled := _sleep_pose()
    # On the low bed a single step reaches the cushion. The settee has a raised lip.
    if not settee_in_use:
        var low_bed_motion := create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
        if night:
            low_bed_motion.tween_callback(_play_travel_animation.bind(&"Walking", 0.08, 1.05, 0.15))
            low_bed_motion.tween_method(_move_along_arc.bind(floor_pose, settled, 0.055, 1.0), 0.0, 1.0, 0.78)
            low_bed_motion.tween_callback(richi.sleep_on_bed.bind(true))
            low_bed_motion.tween_method(_set_room_light, 0.0, 1.0, 0.80)
        else:
            low_bed_motion.tween_callback(richi._set_eyelids.bind(0.0, 0.48))
            low_bed_motion.tween_callback(_play_travel_animation.bind(&"Sit_to_Stand_Transition_M", 1.0, 1.65, 0.22))
            low_bed_motion.tween_method(_set_room_light, 1.0, 0.0, 0.70)
            low_bed_motion.tween_method(_move_along_arc.bind(settled, floor_pose, 0.045, 1.0), 0.0, 1.0, 0.68)
        low_bed_motion.tween_callback(_finish_sleep_movement.bind(true))
        return
    var at_edge := Transform3D(floor_pose.basis, bedroom.get_node("Подход к дивану").position)
    var walking_out := _face_point(floor_pose, at_edge.origin)
    var walking_in := _face_point(at_edge, floor_pose.origin)
    var inward := _face_point(at_edge, settled.origin)
    var outward := _face_point(settled, at_edge.origin)
    var motion := create_tween()

    if night:
        motion.tween_callback(_play_travel_animation.bind(&"Walking", 0.0, 1.22, 0.13))
        motion.tween_property(richi, "transform", walking_out, 0.21)
        motion.tween_property(richi, "transform", Transform3D(walking_out.basis, at_edge.origin), 0.42)
        motion.tween_property(richi, "transform", inward, 0.27)
        _travel_across_edge(motion, inward, Transform3D(inward.basis, settled.origin))
        motion.tween_callback(_play_travel_animation.bind(&"Idle_Step_Turn_Left", 0.0, 1.75, 0.13))
        motion.tween_property(richi, "transform", settled, 0.31)
        motion.tween_callback(richi.sleep_on_bed.bind(true))
        motion.tween_method(_set_room_light, 0.0, 1.0, 0.73)
    else:
        motion.tween_callback(richi._set_eyelids.bind(0.0, 0.55))
        motion.tween_callback(_play_travel_animation.bind(&"Sit_to_Stand_Transition_M", 1.05, 2.15, 0.28))
        motion.tween_method(_set_room_light, 1.0, 0.0, 0.80)
        var landing := Transform3D(outward.basis, at_edge.origin)
        motion.tween_callback(_play_travel_animation.bind(&"Idle_Step_Turn_Left", 0.0, 1.75, 0.13))
        motion.tween_property(richi, "transform", outward, 0.30)
        _travel_across_edge(motion, outward, landing)
        motion.tween_callback(_play_travel_animation.bind(&"Walking", 0.0, 1.22, 0.13))
        motion.tween_property(richi, "transform", walking_in, 0.22)
        motion.tween_property(richi, "transform", Transform3D(walking_in.basis, floor_pose.origin), 0.42)
        motion.tween_property(richi, "transform", floor_pose, 0.22)
    motion.tween_callback(_finish_sleep_movement.bind(true))

func _travel_across_edge(motion: Tween, from: Transform3D, to: Transform3D) -> void:
    motion.tween_callback(_play_travel_animation.bind(&"Regular_Jump", 0.11, 1.35, 0.12))
    motion.tween_interval(0.30)
    motion.tween_method(_move_along_arc.bind(from, to, 0.12, 1.0), 0.0, 1.0, 0.50)
    motion.tween_interval(0.26)

func _move_along_arc(progress: float, from: Transform3D, to: Transform3D, lift: float, ease_in: float) -> void:
    var pose := from.interpolate_with(to, pow(progress, ease_in))
    pose.origin.y = lerpf(from.origin.y, to.origin.y, progress) + 4.0 * lift * progress * (1.0 - progress)
    richi.transform = pose

func _finish_sleep_movement(curl_started := false) -> void:
    sleep_moving = false
    _set_mode(&"sleep" if night else &"home", false)
    if night:
        if not curl_started:
            richi.sleep_on_bed(false)
    else:
        richi.idle_in_home()
        if curl_started:
            richi.react_to_wake()
    _set_status("")

func _set_room_light(night_weight: float) -> void:
    linen.set_shader_parameter("drawn", night_weight)
    curtain.get_node("Льняной подхват").visible = night_weight < 0.08
    for i in curtain_rings.size():
        curtain_rings[i].position.x = lerpf(-0.275 + 0.085 * i, -2.21 + 0.485 * i, night_weight)
    bedroom.get_node("Свет").visible = night_weight > 0.02
    night_lamp.light_energy = night_lamp_energy * night_weight
    sun.visible = night_weight < 0.999
    sun.light_energy = lerpf(day_sun, 0.0, night_weight)
    bounce.light_energy = lerpf(day_bounce, 0.30, night_weight)
    bounce.light_color = day_bounce_color.lerp(Color(0.60, 0.72, 0.97), night_weight)
    ambience.environment.ambient_light_color = day_ambient_color.lerp(Color(0.57, 0.69, 0.93), night_weight)
    ambience.environment.ambient_light_energy = lerpf(day_ambient, 0.34, night_weight)
    window_material.albedo_color = Color.WHITE.lerp(Color(0.16, 0.22, 0.37), night_weight)

func _set_mode(mode: StringName, animate := true, position_actor := true) -> void:
    var previous := active_mode
    active_mode = mode
    var sleeping := mode == &"sleep"
    var previewing := PREVIEW_ROOMS.has(mode)
    var visible_room: StringName = PREVIEW_ROOMS.get(mode, location)
    if previewing or PREVIEW_ROOMS.has(previous):
        room_camera.global_transform = _camera_in(visible_room)
    for scenery: Node3D in $Комната.get_children().filter(func(node): return node.is_in_group("Архитектура")):
        scenery.visible = visible_room == MAIN and scenery.is_in_group("Основа веранды")
    kitchen.visible = visible_room == KITCHEN
    bath_room.visible = visible_room == BATH
    bathroom.visible = bath_room.visible
    care.visible = ball_owned and mode == &"ball"
    if mode != &"bath":
        bathroom.preview()
    if not care.visible and not (previous == &"ball" and mode == &"home"):
        care.stop_toy()
    apple.set_process_input(false)
    apple.restore_eaten()
    rug.visible = visible_room == MAIN and not previewing
    _set_room_light(1.0 if sleeping else 0.0)
    richi.visible = not previewing
    var pose := _day_pose()
    if sleeping and has_sleep_furniture:
        pose = _sleep_pose()
    elif mode == &"bath":
        pose = bathroom.get_node("Место для Ричи").global_transform.scaled_local(awake_pose.basis.get_scale())
    if position_actor:
        if pose_tween:
            pose_tween.kill()
        if animate and not richi.transform.is_equal_approx(pose):
            pose_tween = create_tween()
            pose_tween.tween_property(richi, "transform", pose, 0.42).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
        else:
            richi.transform = pose
    richi.gaze.enabled = not sleeping and not previewing
    %Back.disabled = false
    _refresh_controls()
    _position_stations()

func _set_status(message: String) -> void:
    status.text = message
    status.visible = not message.is_empty()
    _refresh_controls()

func _refresh_controls() -> void:
    var playing: bool = game_room and game_room.visible
    var shopping: bool = shop and shop.visible
    if hosted and guide_in_overlay != (playing or shopping):
        guide_in_overlay = playing or shopping
        _notify_host("overlay-open" if guide_in_overlay else "overlay-closed")
    var previewing := PREVIEW_ROOMS.has(active_mode)
    var free := active_mode == &"home"
    var in_main := location == MAIN
    var showing_main := not kitchen.visible and not bath_room.visible
    bedroom.visible = showing_main and not playing
    stations.visible = showing_main and not playing and not previewing
    care.visible = showing_main and ball_owned and active_mode in [&"home", &"ball", &"sleep"] and not playing and not shopping
    furnishings.visible = showing_main and not playing and not previewing
    var moving := _moving_between_places()
    %Actions.visible = (free or night) and not moving and not playing and not shopping
    %Feed.visible = free and location == KITCHEN
    %Wash.visible = free and location == BATH
    %Play.visible = free and in_main
    %ToyBall.visible = free and in_main and ball_owned
    %Shop.visible = free and in_main and not moving and shop != null
    %Sleep.visible = in_main and has_sleep_furniture and (night or free)
    %Sleep.accessibility_name = "Разбудить" if night else "Уложить спать"
    %Back.hide()
    %MainRoom.set_pressed_no_signal(in_main)
    %KitchenRoom.set_pressed_no_signal(location == KITCHEN)
    %BathRoom.set_pressed_no_signal(location == BATH)
    %RoomNavigation.visible = (free or active_mode == &"feed") and not meal_in_progress and not moving and not playing and not shopping and not night
    var goal := _bed_goal()
    var show_goal := in_main and free and not moving and not shopping and not playing and not goal.is_empty()
    %GoalText.text = str(goal.get("message", ""))
    %GoalText.visible = show_goal
    %GoalAction.text = str(goal.get("label", ""))
    %GoalButtons.visible = show_goal
    %Dock.visible = not (playing or shopping or previewing) and (status.visible or %Back.visible or show_goal)
    var dock_edge := -92.0 if %RoomNavigation.visible else 0.0
    %Dock.offset_top += dock_edge - %Dock.offset_bottom
    %Dock.offset_bottom = dock_edge

func _position_stations() -> void:
    var camera := get_viewport().get_camera_3d()
    if not camera:
        return
    var sleep_target: Node3D = stations.get_node("Метка лежанки")
    if settee_in_use:
        sleep_target = bedroom.get_node("Метка пробуждения на диване")
    elif night:
        sleep_target = bedroom.get_node("Метка пробуждения")
    var views := {
        %Feed: kitchen.get_node("Метка миски"),
        %Wash: bathroom.get_node("Метка купели"),
        %Sleep: sleep_target,
        %Play: stations.get_node("Сундук с игрушками/Метка"),
        %ToyBall: care.ball,
    }
    var screen := get_viewport().get_visible_rect().size
    var header_bottom: float = %Header.get_global_rect().end.y + 6.0
    for button: Button in views:
        var marker: Node3D = views[button]
        button.size = button.custom_minimum_size
        var point := camera.unproject_position(marker.global_position) - button.size * 0.5
        button.position = Vector2(clampf(point.x, 8, screen.x - button.size.x - 8),
            clampf(point.y, maxf(110, header_bottom), screen.y - button.size.y - 8))

func _apply_furniture(furniture: Dictionary) -> void:
    var placed: Array = furniture.get("placed", [])
    var preview := str(furniture.get("preview", ""))
    has_sleep_furniture = placed.has("bed") or placed.has("settee")
    var had_settee := settee_in_use
    settee_in_use = preview == "settee" or (preview != "bed" and placed.has("settee"))
    var use_enamel := preview == "bath" or placed.has("bath")
    $Спальня/Диван.visible = settee_in_use
    $Спальня/Лежанка.visible = not settee_in_use and (preview == "bed" or placed.has("bed"))
    bathroom.show_appearance(use_enamel)
    kitchen.get_node("Архитектура/Обои").visible = preview == "wallpaper" or placed.has("wallpaper")
    bath_room.get_node("Архитектура/Плитка").visible = preview == "bath-tile" or placed.has("bath-tile")
    var mint_cabinet := preview == "kitchen-cabinet" or placed.has("kitchen-cabinet")
    kitchen.get_node("Кухонный уголок/Шкафчик/Мятные дверцы").visible = mint_cabinet
    kitchen.get_node("Кухонный уголок/Шкафчик/Деревянные дверцы").visible = not mint_cabinet
    var chest_visible := preview == "chest" or placed.has("chest")
    stations.get_node("Сундук с игрушками/Исходный сундук").visible = not chest_visible
    for item: Node3D in furnishings.get_children():
        item.visible = preview == item.name or placed.has(String(item.name))
    if night:
        return
    var mode: StringName = FURNITURE_PREVIEWS.get(preview, &"home")
    if mode == active_mode:
        if mode == &"home" and had_settee != settee_in_use and not _moving_between_places():
            _set_mode(&"home", false)
        return
    if mode != &"home":
        _set_mode(mode, false)
    elif PREVIEW_ROOMS.has(active_mode):
        _show_room()

func _load_home() -> void:
    var save := ConfigFile.new()
    if save.load("user://first_meeting.cfg") == OK:
        pet_name = str(save.get_value("meeting", "pet_name", pet_name))
    %PetName.text = pet_name
    if save.load(SAVE_PATH) == OK:
        native_rounds = save.get_value("home", "rounds", {})
        native_leaves = int(save.get_value("home", "leaves", 0))
        native_xp = int(save.get_value("home", "xp", 0))
        ball_owned = bool(save.get_value("home", "ball", false))
        _load_native_shop(save)
        native_starter_round_rewarded = bool(save.get_value("home", "starter_round_rewarded", false)) or native_rounds.values().any(
            func(round) -> bool: return round is Dictionary and bool(round.get("finished", false))
        )
        var stored_needs = save.get_value("home", "needs", {})
        if stored_needs is Dictionary:
            for key in native_needs:
                var value = stored_needs.get(key)
                if (value is int or value is float) and is_finite(value):
                    native_needs[key] = clampf(value, 0, 100)
        native_needs_updated = float(save.get_value("home", "needs_updated", 0.0))
        _sync_native_shop()
        _set_sleep(bool(save.get_value("home", "night", false)), false)
    else:
        _sync_native_shop()
    if game_room:
        game_room.set_rounds(native_rounds)
    _update_native_stats()
    _refresh_native_needs()

func _load_native_shop(save: ConfigFile) -> void:
    var old_owned := ["bed"] if save.get_value("home", "bed_owned", false) else []
    var old_placed := ["bed"] if save.get_value("home", "bed_placed", false) else []
    var owned = save.get_value("home", "owned", old_owned)
    var placed = save.get_value("home", "placed", old_placed)
    native_owned.clear()
    native_placed.clear()
    if owned is Array:
        for id: String in SHOP_CATALOG.ITEMS:
            if owned.has(id):
                native_owned.append(id)
    if placed is Array:
        for id: String in SHOP_CATALOG.FURNITURE:
            if native_owned.has(id) and placed.has(id):
                native_placed.append(id)
    native_hat = str(save.get_value("home", "hat", ""))
    if native_hat not in SHOP_CATALOG.HATS or not native_owned.has(native_hat):
        native_hat = ""

func _save_home() -> bool:
    var save := ConfigFile.new()
    save.set_value("home", "night", night)
    save.set_value("home", "rounds", native_rounds)
    save.set_value("home", "leaves", native_leaves)
    save.set_value("home", "xp", native_xp)
    save.set_value("home", "ball", ball_owned)
    save.set_value("home", "owned", native_owned)
    save.set_value("home", "placed", native_placed)
    save.set_value("home", "hat", native_hat)
    save.set_value("home", "starter_round_rewarded", native_starter_round_rewarded)
    save.set_value("home", "needs", native_needs)
    save.set_value("home", "needs_updated", native_needs_updated)
    var draft := SAVE_PATH + ".tmp"
    return save.save(draft) == OK and DirAccess.rename_absolute(
        ProjectSettings.globalize_path(draft), ProjectSettings.globalize_path(SAVE_PATH)
    ) == OK

func _update_native_stats() -> void:
    var level := 1 + floori(native_xp / 30.0)
    %Stats.text = "Уровень %d  ·  Листья %d" % [level, native_leaves]
    richi.set_age_level(level, growth_mesh)
    if game_room:
        game_room.set_ball_shop(ball_owned, native_leaves >= BALL_PRICE)
    _refresh_controls()
    _position_stations()


func _advance_native_needs() -> void:
    var now := Time.get_unix_time_from_system()
    if native_needs_updated > 0.0:
        var hours := clampf((now - native_needs_updated) / 3600.0, 0, 48)
        var rates := {"food": -4.0, "clean": -2.0, "energy": 20.0 if night else -3.0, "joy": -3.0}
        for key in rates:
            native_needs[key] = clampf(native_needs[key] + hours * rates[key], 0, 100)
    native_needs_updated = maxf(now, native_needs_updated)


func _refresh_native_needs() -> void:
    _advance_native_needs()
    %NeedsHud.set_values(native_needs)
    richi.set_needs(native_needs)
    _check_hungry_room.call_deferred()


func _increase_native_need(key: String, amount: float) -> void:
    _advance_native_needs()
    native_needs[key] = minf(native_needs[key] + amount, 100)
    %NeedsHud.set_values(native_needs)
    richi.set_needs(native_needs)


func _sync_pause(args: Array) -> void:
    if args.size() == 1 and args[0] is bool:
        if args[0] and is_instance_valid(game_room) and game_room.visible:
            game_room.checkpoint()
        get_tree().paused = args[0]
        if not args[0]:
            _check_hungry_room.call_deferred()

func _sync_state(args: Array) -> void:
    if args.size() != 1 or not args[0] is String:
        return
    var data = JSON.parse_string(args[0])
    if not data is Dictionary:
        return
    pet_name = str(data.get("name", pet_name))
    %PetName.text = pet_name
    var level := int(data.get("level", 1))
    var leaves := int(data.get("leaves", 0))
    %Stats.text = "Уровень %d  ·  Листья %d" % [level, leaves]
    ball_owned = data.get("ball", false) == true
    richi.set_age_level(level, growth_mesh)
    %NeedsHud.set_values(data.get("needs", {}))
    richi.set_needs(data.get("needs", {}))
    if awaiting_meal_result:
        _finish_meal_reaction(data.get("needs", {}))
    richi.wear_hat(str(data.get("hat", "")))
    var goal = data.get("bed_goal")
    hosted_bed_goal = goal if goal is Dictionary else {}
    _apply_furniture(data.get("furniture", {}))
    var navigation = data.get("navigation") if not has_host_state else null
    _set_sleep(bool(data.get("night", false)), has_host_state)
    has_host_state = true
    if game_room:
        game_room.set_rounds(data.get("rounds", {}))
        game_room.set_ball_shop(ball_owned, leaves >= BALL_PRICE)
        if data.get("open_games", false):
            _launch_games(str(data.get("game", "")))
    if navigation is Dictionary:
        _restore_navigation(navigation)
    if shop:
        shop.set_state(data.get("shop", {}))
        if data.get("open_shop", false):
            _open_shop()
    if data.get("refusal", "") != "":
        richi.refuse()
        _set_status(str(data.refusal))
    if data.get("offer_apple", false):
        _offer_apple()
    if data.get("celebrate_purchase", false) == true:
        _celebrate_purchase()
    _refresh_controls()
    _position_stations()
    _check_hungry_room.call_deferred()

func _navigation_state() -> Dictionary:
    var state := {"location": str(location), "mode": "home", "game": null}
    if active_mode == &"feed":
        state.mode = "feed"
    elif active_mode == &"bath" and not bath_moving:
        state.mode = "bath"
        state.bath = bathroom.navigation_checkpoint()
    if game_room and game_room.visible:
        state.game = game_room.active_game
        state.round = game_room.rounds.get(game_room.active_game)
    return state

func _write_navigation_state(args: Array) -> void:
    if args.size() == 1 and args[0] is JavaScriptObject:
        args[0].result = JSON.stringify(_navigation_state())

func _restore_navigation(state: Dictionary) -> void:
    var target := StringName(str(state.get("location", MAIN)))
    if night or target not in [MAIN, KITCHEN, BATH] or not _go_to_room(target):
        return
    var game = state.get("game")
    if target == MAIN and game is String and game in ["", "pairs", "match", "orchard"]:
        _launch_games(game)
    elif target == KITCHEN and state.get("mode") == "feed":
        _offer_apple()
    elif target == BATH and state.get("mode") == "bath":
        _set_mode(&"bath", false)
        _finish_bath_movement(true, true)
        var checkpoint = state.get("bath")
        if checkpoint is Dictionary:
            bathroom.restore_navigation(checkpoint)
            if bathroom.phase == &"done":
                _move_between_floor_and_bath.call_deferred(false)
    elif target == MAIN and richi._need_is_low("food"):
        hunger_visit_started = true

func _write_interaction_state(args: Array) -> void:
    if args.size() == 1 and args[0] is JavaScriptObject:
        args[0].result = _interaction_state([])

func _interaction_state(_args: Array) -> String:
    var camera := get_viewport().get_camera_3d()
    var size := get_viewport().get_visible_rect().size
    var controls := {}
    var buttons := {
        "main": %MainRoom, "kitchen": %KitchenRoom, "bath": %BathRoom,
        "feed": %Feed, "back": bathroom.exit_button if active_mode == &"bath" else %Back, "wash": %Wash,
        "sleep": %Sleep, "profile": %Profile, "chest": %Play, "shop": %Shop,
        "ball": %ToyBall,
        "park": %Park,
        "goalAction": %GoalAction, "goalLater": %GoalLater,
    }
    for item in buttons:
        var button: Button = buttons[item]
        controls[item] = _interaction_point(button.get_global_rect().get_center(), size) if button.is_visible_in_tree() and not button.disabled else null
    var tiles: Array[Dictionary] = []
    if game_room and game_room.visible:
        var pairs_button: Button = game_room.get_node("%Pairs")
        if pairs_button.is_visible_in_tree():
            controls["pairs"] = _interaction_point(pairs_button.get_global_rect().get_center(), size)
        if game_room.active_game == "pairs" and game_room.board:
            for tile: Button in game_room.board.get_node("%Grid").get_children():
                tiles.append(_interaction_point(tile.get_global_rect().get_center(), size))
    var fruit: Variant = null
    var grip: Variant = null
    if active_mode == &"feed":
        fruit = _interaction_point(camera.unproject_position(apple.global_position + apple.center_offset()), size) if apple.visible else null
        grip = _interaction_point(camera.unproject_position(apple.palm_center()), size)
    var sponge: Variant = null
    var scrub_center: Variant = null
    var jug: Variant = null
    var pour_target: Variant = null
    if active_mode == &"bath" and not bath_moving:
        if bathroom.soap.is_visible_in_tree():
            sponge = _interaction_point(camera.unproject_position(bathroom.soap.global_position), size)
        scrub_center = _interaction_point(camera.unproject_position(bathroom.chest_point()), size)
        if bathroom.phase == &"ready":
            jug = _interaction_point(camera.unproject_position(bathroom.jug_point()), size)
            pour_target = _interaction_point(bathroom.pour_target(camera), size)
    return JSON.stringify({
        "location": str(location), "mode": str(active_mode), "moving": _moving_between_places(),
        "paused": get_tree().paused, "food": richi.needs.get("food", 50), "dining": str(dining.state),
        "controls": controls, "apple": fruit, "grip": grip, "applePointer": apple.pointer,
        "appleSettling": apple.settling, "mealInProgress": meal_in_progress, "mealPhase": richi.meal_phase(),
        "sponge": sponge, "scrubCenter": scrub_center,
        "jug": jug, "pourTarget": pour_target, "bathPouring": bathroom.pouring,
        "navigation": _navigation_state(), "gameTiles": tiles,
    })

func _interaction_point(point: Vector2, size: Vector2) -> Dictionary:
    return {"x":point.x / size.x, "y":point.y / size.y}

func _notify_host(event_name: String) -> void:
    if hosted:
        var browser := JavaScriptBridge.get_interface("window")
        browser.parent.postMessage(HOST_PREFIX + event_name, str(browser.location.origin))
