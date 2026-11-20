extends VBoxContainer

signal round_saved(round: Dictionary)
signal menu_requested

var round_id := 0
var revision := 0
var reward: Dictionary = {}


func checkpoint() -> void:
    pass


func restore(record: Dictionary) -> void:
    round_id = maxi(0, int(record.get("id", 0)))
    revision = maxi(0, int(record.get("revision", 0)))
    var stored_reward = record.get("reward")
    reward = stored_reward.duplicate() if stored_reward is Dictionary else {}


func sync_record(record: Dictionary) -> void:
    if int(record.get("id", -1)) == round_id and record.get("reward") is Dictionary:
        reward = record.reward.duplicate()
        _update_result()


func begin_round() -> void:
    round_id += 1
    revision = 0
    reward.clear()


func commit(record: Dictionary) -> void:
    revision += 1
    record.merge({"id": round_id, "revision": revision})
    round_saved.emit(record)


func reward_text() -> String:
    if reward.is_empty():
        return ""
    return "Листья +%d · Опыт +%d" % [reward.get("leaves", 0), reward.get("xp", 0)]


func _update_result() -> void:
    pass
