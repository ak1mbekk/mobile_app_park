extends SceneTree

const HOME = preload("res://Scenes/Levels/Home.tscn")
const CATALOG = preload("res://Scenes/Shop/ShopCatalog.gd")

var failures := 0
var cabin


func _initialize() -> void:
    call_deferred("_run")


func _run() -> void:
    var original_dir := OS.get_user_data_dir()
    var folder := "animal-park-shop-qa-%d-%d" % [OS.get_process_id(), Time.get_ticks_msec()]
    ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
    ProjectSettings.set_setting("application/config/custom_user_dir_name", folder)
    var test_dir := OS.get_user_data_dir()
    if test_dir == original_dir or test_dir.get_file() != folder or DirAccess.dir_exists_absolute(test_dir):
        push_error("Could not isolate the shop test save.")
        quit(1)
        return
    if DirAccess.make_dir_recursive_absolute(test_dir) != OK:
        push_error("Could not create the shop test directory.")
        quit(1)
        return
    var old_save := ConfigFile.new()
    old_save.set_value("home", "bed_owned", true)
    old_save.set_value("home", "bed_placed", true)
    old_save.set_value("home", "leaves", 9)
    var result := old_save.save("user://home.cfg")
    if result != OK:
        push_error("Could not write the test save: " + error_string(result))
        DirAccess.remove_absolute(test_dir)
        quit(1)
        return

    _check_catalog_parity()
    _open_cabin()
    _expect(cabin.native_placed.has("bed") and cabin.native_owned.has("bed"), "The old bed save retains ownership and placement")
    _expect(cabin.get_node("Спальня/Лежанка").visible, "The migrated bed is shown in the room")
    _press(cabin, "Shop")
    _expect(cabin.shop.visible, "The house shop opens")
    for id: String in CATALOG.ITEMS:
        var ware: Dictionary = CATALOG.ITEMS[id]
        var label: Label = cabin.shop.get_node("%" + id).get_node("Price")
        _expect(label.text.contains(ware.tier), "%s shows rarity before selection" % id)
        _expect(label.text.contains("Куплено" if id == "bed" else CATALOG.leaf_price(ware.price)), "%s shows ownership or price before selection" % id)

    _press(cabin.shop, "cap")
    _expect(cabin.richi.hat_seat.get_node("cap").visible and cabin.native_leaves == 9, "The hat is tried on without a charge")
    _expect(cabin.shop.get_node("%Confirm").disabled, "Purchase is unavailable one leaf below the price")
    _press(cabin.shop, "Confirm")
    _expect(cabin.native_leaves == 9 and not cabin.native_owned.has("cap"), "An unaffordable confirmation is ignored")
    _press(cabin.shop, "Back")
    _expect(not cabin.richi.hat_seat.get_node("cap").visible, "Cancel restores the worn outfit")
    cabin.native_leaves = 10
    _choose("cap")
    _expect(cabin.native_leaves == 0 and cabin.native_hat == "cap", "The exact balance buys and equips the hat once")
    _press(cabin.shop, "cap")
    _expect(cabin.shop.get_node("%Confirm").text == "Снять", "The equipped hat can be removed")
    _press(cabin.shop, "Confirm")
    _expect(cabin.native_hat.is_empty() and cabin.native_owned.has("cap"), "Removing the hat preserves ownership")
    _choose("cap")
    _expect(cabin.native_leaves == 0 and cabin.native_hat == "cap", "Re-equipping an owned hat is free")

    cabin.native_leaves = 120
    _press(cabin.shop, "Furniture")
    _press(cabin.shop, "settee")
    _expect(cabin.get_node("Спальня/Диван").visible and not cabin.get_node("Спальня/Лежанка").visible, "The settee preview takes the bed's place")
    _press(cabin.shop, "Back")
    _expect(cabin.native_leaves == 120 and cabin.get_node("Спальня/Лежанка").visible, "Cancel restores the bed without charging")
    _choose("settee")
    _expect(cabin.native_leaves == 80 and cabin.native_placed == ["settee"] and cabin.native_owned.has("bed"), "The settee replaces the bed while keeping its ownership")
    _choose("bed")
    _expect(cabin.native_leaves == 80 and cabin.native_placed == ["bed"], "The owned bed can replace the settee at no charge")
    _choose("settee")
    _choose("bath")
    _expect(cabin.native_leaves == 25 and cabin.stations.get_node("Купель/Эмалированная").visible and not cabin.stations.get_node("Купель/Дубовая").visible, "The enamel bath replaces the wooden bath")
    _choose("cushion")
    _expect(cabin.native_leaves == 10 and cabin.furnishings.get_node("cushion").visible, "Decor stays in the room after purchase")

    var blocked_draft := test_dir.path_join("home.cfg.tmp")
    _expect(DirAccess.make_dir_absolute(blocked_draft) == OK, "The test blocks the draft file")
    _press(cabin.shop, "settee")
    _press(cabin.shop, "Confirm")
    _expect(cabin.native_leaves == 10 and cabin.native_placed.has("settee") and not cabin.shop.get_node("%Status").text.is_empty(), "Failed save rolls back the furniture change and reports it")
    DirAccess.remove_absolute(blocked_draft)
    _press(cabin.shop, "DetailClose")
    cabin.queue_free()
    await process_frame

    _open_cabin()
    _expect(cabin.native_leaves == 10 and cabin.native_placed.has("settee") and not cabin.native_placed.has("bed"), "The wallet and replaced furniture survive restart")
    _expect(cabin.native_hat == "cap" and cabin.richi.hat_seat.get_node("cap").visible, "The equipped hat survives restart")
    _expect(cabin.stations.get_node("Купель/Эмалированная").visible and cabin.furnishings.get_node("cushion").visible, "Purchased bath and decor survive restart")
    _press(cabin, "Shop")
    _press(cabin.shop, "Furniture")
    _choose("bath")
    _expect(cabin.native_owned.has("bath") and cabin.stations.get_node("Купель/Дубовая").visible, "Removing an upgrade restores the basic bath")
    cabin.hosted = true
    cabin._sync_state([JSON.stringify({
        "leaves": 24, "open_shop": true,
        "shop": {"wallet": 24, "items": {
            "settee": {"name": "Диван у окна", "detail": "Редкий · заменяет лежанку", "price": "40 листьев"},
        }},
    })])
    _expect(cabin.shop.visible and cabin.shop.get_node("%Wallet").text == "Листья 24", "Hosted shop uses the browser wallet")
    _expect(cabin.shop.get_node("%settee/Price").text == "40 листьев\nРедкий", "Hosted details retain the existing bridge shape")
    _expect(cabin.native_leaves == 10, "Hosted state does not overwrite the standalone wallet")
    cabin.queue_free()
    await process_frame
    DirAccess.remove_absolute(test_dir.path_join("home.cfg"))
    DirAccess.remove_absolute(test_dir)
    if failures == 0:
        print("PASS native shop parity, rarity, preview, purchase, removal, replacement, rollback, reload and hosted state")
    quit(failures)


func _check_catalog_parity() -> void:
    var source := FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://../public/demo/home.js"))
    var pattern := RegEx.create_from_string("\\{id:'([^']+)',name:'([^']+)',tier:'([^']+)',group:'([^']+)',price:(\\d+|bedPrice)")
    var browser_items := pattern.search_all(source)
    var browser_bed_price := RegEx.create_from_string("const bedPrice=(\\d+);").search(source)
    _expect(browser_items.size() == CATALOG.ITEMS.size() and browser_bed_price != null, "The browser and standalone catalogs have the same entries")
    if browser_bed_price == null:
        return
    for match_item in browser_items:
        var id := match_item.get_string(1)
        var ware: Dictionary = CATALOG.ITEMS.get(id, {})
        var price := match_item.get_string(5)
        var expected := int(browser_bed_price.get_string(1) if price == "bedPrice" else price)
        var hat := match_item.get_string(4) == "hat"
        _expect(ware.get("name") == match_item.get_string(2) and ware.get("tier") == match_item.get_string(3) and ware.get("price") == expected and (id in CATALOG.HATS) == hat,
            "%s has matching name, rarity, group and price in both clients" % id)


func _open_cabin() -> void:
    cabin = HOME.instantiate()
    root.add_child(cabin)


func _choose(id: String) -> void:
    _press(cabin.shop, id)
    _press(cabin.shop, "Confirm")


func _press(panel: Node, id: String) -> void:
    panel.get_node("%" + id).pressed.emit()


func _expect(ok: bool, message: String) -> void:
    if not ok:
        failures += 1
        push_error(message)
