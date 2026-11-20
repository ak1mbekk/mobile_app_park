extends HBoxContainer

@onready var meters := {
    "food": %FoodValue,
    "clean": %CleanValue,
    "energy": %EnergyValue,
    "joy": %JoyValue,
}

func set_values(needs: Dictionary) -> void:
    for key: String in meters:
        var amount: Variant = needs.get(key, 50)
        var meter: ProgressBar = meters[key]
        if (amount is float or amount is int) and is_finite(float(amount)):
            meter.value = clampf(float(amount), 0.0, 100.0)
        else:
            meter.value = 50.0