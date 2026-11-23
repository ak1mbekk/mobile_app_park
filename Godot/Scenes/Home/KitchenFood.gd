extends Node3D
## Portion inventory is saved with the wallet. Picking up/missing never consumes it.
var home: Node3D
var state := {"pear": 0, "serial": 0, "serving": null}
@onready var row: HBoxContainer = $Interface/Choice
@onready var apple_button: Button = $Interface/Choice/Apple
@onready var pear_button: Button = $Interface/Choice/Pear
@onready var bowl_fruit: Node3D = $BowlFruit

func setup(owner_home: Node3D) -> void:
    home = owner_home
    apple_button.pressed.connect(func(): home._offer_food("apple"))
    pear_button.pressed.connect(func(): home._offer_food("pear"))
    refresh()

func restore(value: Variant) -> void:
    state = {"pear": 0, "serial": 0, "serving": null}
    if value is Dictionary:
        state.pear = maxi(0, int(value.get("pear", 0)))
        state.serial = maxi(0, int(value.get("serial", 0)))
        var portion = value.get("serving")
        if portion is Dictionary and str(portion.get("kind")) in ["apple", "pear"] and int(portion.get("id", 0)) > 0 and int(portion.id) <= state.serial:
            if portion.kind == "apple" or state.pear > 0:
                state.serving = {"id": int(portion.id), "kind": str(portion.kind)}
    refresh()

func selected() -> String:
    return str(state.serving.kind) if state.serving is Dictionary else "apple"

func portion_id() -> int:
    return int(state.serving.id) if state.serving is Dictionary else 0

func prepare(kind: String) -> bool:
    if kind not in ["apple", "pear"]:
        return false
    if state.serving is Dictionary and state.serving.kind == kind:
        return true
    if home.hosted:
        home._notify_host("food:choose:" + kind)
        return false
    var previous := state.duplicate(true)
    var wallet: int = home.native_leaves
    if kind == "pear" and state.pear == 0:
        if wallet < 1:
            home._set_status("На грушу нужен 1 лист.")
            return false
        home.native_leaves -= 1
        state.pear += 1
    state.serial += 1
    state.serving = {"id": state.serial, "kind": kind}
    if not home._save_home():
        state = previous
        home.native_leaves = wallet
        home._set_status("Не удалось сохранить угощение. Попробуй ещё раз.")
        return false
    home._update_native_stats()
    refresh()
    return true

func finish(id: int) -> Dictionary:
    if not state.serving is Dictionary or int(state.serving.id) != id:
        return {"accepted": false, "full": false}
    var previous := state.duplicate(true)
    var needs: Dictionary = home.native_needs.duplicate()
    var xp: int = home.native_xp
    var updated: float = home.native_needs_updated
    var pear: bool = state.serving.kind == "pear"
    if pear:
        state.pear -= 1
    state.serving = null
    var full: bool = home._increase_native_need("food", 40 if pear else 32)
    if not home._save_home():
        state = previous
        home.native_needs = needs
        home.native_xp = xp
        home.native_needs_updated = updated
        home._refresh_native_needs()
        home._set_status("Не удалось сохранить угощение. Оно осталось в запасе.")
        return {"accepted": false, "full": false}
    refresh()
    return {"accepted": true, "full": full}

func refresh() -> void:
    if row == null or home == null:
        return
    var amount: int = state.pear
    pear_button.get_node("Price").visible = amount == 0
    pear_button.get_node("Stock").visible = amount > 0
    pear_button.get_node("Stock").text = "×%d" % amount
    pear_button.accessibility_name = ("Взять грушу. В запасе %d." % amount if amount > 0 else "Купить грушу за 1 лист.") + " Немного сытнее яблока."
    var wallet: int = home.native_leaves if not home.hosted else int(home.get_meta("food_wallet", 0))
    pear_button.disabled = amount == 0 and wallet < 1
    row.visible = home.location == &"kitchen" and not home.night and not home.meal_in_progress and not home._moving_between_places() and home.active_mode in [&"home", &"feed"]
    apple_button.disabled = home.tableware_moving
    pear_button.disabled = pear_button.disabled or home.tableware_moving
