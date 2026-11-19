extends SoftBody3D

## Horizontal acceleration of the free fabric at the peak of a breeze (m/s²).
@export_range(0.0, 8.0, 0.1) var breeze_acceleration := 0.72
@export_range(0.5, 6.0, 0.1) var gust_seconds := 2.8
## Shortest calm interval between two gusts, in seconds.
@export_range(2.0, 24.0, 0.5) var calm_seconds := 6.5

@onready var rail := get_parent() as Node3D

var clock := -1.5
var rng := RandomNumberGenerator.new()
var strength := 1.0

func _ready() -> void:
    rng.randomize()

func _physics_process(delta: float) -> void:
    clock += delta
    if clock < 0.0:
        return
    if clock >= gust_seconds:
        clock = -rng.randf_range(calm_seconds, calm_seconds * 1.65)
        strength = rng.randf_range(0.75, 1.0)
        return
    var phase := clock / gust_seconds
    var envelope := pow(sin(PI * phase), 2.0)
    var direction := Vector3(0.32 + 0.12 * sin(TAU * phase), 0.03, 1.0).normalized()
    apply_central_force(rail.global_basis.orthonormalized() * direction * total_mass * breeze_acceleration * envelope * strength)
