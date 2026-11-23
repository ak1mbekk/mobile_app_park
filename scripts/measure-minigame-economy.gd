extends SceneTree

# Deterministic model, not a recording of human play. Run with --fixed-fps 60.
const RUNS := 30
const FPS := 60.0
const BASE_SEED := 20261123
const SCENES := {
    "pairs": preload("res://Scenes/Games/Pairs.tscn"),
    "match": preload("res://Scenes/Games/MatchThree.tscn"),
    "orchard": preload("res://Scenes/Games/Orchard.tscn"),
}
var samples := {}
var frames := 0


func _initialize() -> void:
    root.size = Vector2i(390, 844)
    call_deferred("_run")


func _process(_delta: float) -> bool:
    frames += 1
    return false


func _wait(seconds: float) -> void:
    for _frame in ceili(seconds * FPS):
        await process_frame


func _run() -> void:
    for game: String in SCENES:
        samples[game] = []
        var board = SCENES[game].instantiate()
        root.add_child(board)
        board.position = Vector2(12, 70)
        board.size = Vector2(366, 690)
        await _wait(0.1)
        for run in RUNS:
            seed(BASE_SEED + run + 1000 * SCENES.keys().find(game))
            var result: Dictionary
            if game == "pairs":
                result = await _pairs(board)
            elif game == "match":
                result = await _match(board)
            else:
                result = await _orchard(board, run)
            result.seed = BASE_SEED + run + 1000 * SCENES.keys().find(game)
            samples[game].append(result)
        board.queue_free()
        await process_frame
        print("PACE_PROGRESS " + game + " " + JSON.stringify(_summary(samples[game])))
    var targets := {}
    for mode in ["pairs", "match", "orchard", "alternate"]:
        targets[mode] = {}
        for price in [5, 10, 15, 20, 25, 30, 35, 40, 55, 75, 80, 85, 120]:
            targets[mode][str(price)] = _accumulate(mode, price, false)
        targets[mode]["55_after_bed"] = _accumulate(mode, 55, true)
        targets[mode]["120_after_bed"] = _accumulate(mode, 120, true)
    print("PACE_RESULT " + JSON.stringify({"runs": RUNS, "fps": FPS, "seed": BASE_SEED,
        "samples": samples, "summary": {
            "pairs": _summary(samples.pairs), "match": _summary(samples.match),
            "orchard": _summary(samples.orchard)}, "targets": targets}))
    quit()


func _pairs(board) -> Dictionary:
    var start := frames
    board._new_round()
    var memory := {}
    await _wait(1.0)
    while not board.finished:
        var available: Array = []
        for index in board.cards.size():
            if not memory.has(index) or not board.paired.has(memory[index]):
                available.append(index)
        var first := -1
        var second := -1
        for a: int in available:
            if not memory.has(a):
                continue
            for b: int in available:
                if b != a and memory.get(b, "") == memory[a]:
                    first = a
                    second = b
                    break
            if second >= 0:
                break
        if first < 0:
            for index: int in available:
                if not memory.has(index):
                    first = index
                    break
        assert(first >= 0, "Visible-memory policy must find an available card")
        await _wait(0.75)
        board._flip(first)
        # Read the face only after the real reveal action has exposed it.
        memory[first] = board.cards[first]
        if second < 0:
            for index: int in available:
                if index != first and memory.get(index, "") == memory[first]:
                    second = index
                    break
        if second < 0:
            for index: int in available:
                if index != first and not memory.has(index):
                    second = index
                    break
        assert(second >= 0)
        await _wait(0.75)
        board._flip(second)
        memory[second] = board.cards[second]
        while board.opened.size() == 2:
            await process_frame
    await _wait(2.0)
    return {"seconds": (frames - start) / FPS, "leaves": 5, "won": true, "moves": board.moves}


func _match(board) -> Dictionary:
    var start := frames
    board._new_round()
    while not board.finished:
        # Evaluate only the currently visible board, never random refill/cascade results.
        var best := -1
        var chosen: Array = []
        for first in board.cells.size():
            for second in [first + 1, first + board.WIDTH]:
                if second >= board.cells.size() or (second == first + 1 and second % board.WIDTH == 0):
                    continue
                var visible: Array = board.cells.duplicate()
                board._swap(visible, first, second)
                var line: Dictionary = board._lines(visible)
                if line.removed.is_empty():
                    continue
                var berries := 0
                for index in line.removed:
                    if visible[index] == 0:
                        berries += 1
                var score: int = berries * 100 + line.extra * 10 + line.removed.size()
                if score > best:
                    best = score
                    chosen = [first, second]
        assert(chosen.size() == 2, "Game guarantees a legal move")
        await _wait(2.0)
        board._choose(chosen[0])
        await _wait(0.35)
        board._choose(chosen[1])
        while board.resolving:
            await process_frame
    await _wait(2.0)
    var won: bool = board.berries >= board.TARGET
    return {"seconds": (frames - start) / FPS, "leaves": 5 + board.bonus if won else 0,
        "won": won, "moves": board.INITIAL_MOVES - board.moves, "bonus": board.bonus}


func _orchard(board, run: int) -> Dictionary:
    var policy := RandomNumberGenerator.new()
    policy.seed = BASE_SEED + 5000 + run
    board._new_round()
    board.set_process(false)
    var ticks := 0
    var old_attempt := -1
    var reaction := 0.0
    var target := 0.5
    while board.running:
        if old_attempt != board.attempt:
            old_attempt = board.attempt
            reaction = 0.28
            var want_catch: bool = board.kind == "apple"
            if policy.randf() < 0.10:
                want_catch = not want_catch
            target = board.spot + policy.randf_range(-0.04, 0.04) if want_catch else (0.09 if board.spot >= 0.5 else 0.91)
        reaction -= 1.0 / FPS
        if reaction <= 0.0:
            board._move_basket(move_toward(board.basket_position, target, 0.9 / FPS))
        board._process(1.0 / FPS)
        ticks += 1
        if ticks % 60 == 0:
            await process_frame
        assert(ticks < 60 * 600, "Policy round exceeded 10 simulated minutes")
    var won: bool = board.caught > 0
    return {"seconds": ticks / FPS + 2.0, "leaves": mini(10, floori(board.caught / 3.0)),
        "won": won, "caught": board.caught, "drops": board.attempt, "errors": board.errors}


func _summary(records: Array) -> Dictionary:
    var times := []
    var rewards := []
    var wins := 0
    var zero := 0
    for record: Dictionary in records:
        times.append(record.seconds)
        rewards.append(record.leaves)
        wins += int(record.won)
        zero += int(record.leaves == 0)
    return {"seconds": _distribution(times), "leaves": _distribution(rewards),
        "wins": wins, "zero_payouts": zero, "leaves_per_minute": _mean(rewards) / _mean(times) * 60.0}


func _mean(values: Array) -> float:
    var total := 0.0
    for value in values:
        total += float(value)
    return total / values.size()


func _distribution(values: Array) -> Dictionary:
    var sorted := values.duplicate()
    sorted.sort()
    return {"mean": _mean(values), "min": sorted[0], "p10": sorted[floori((sorted.size() - 1) * 0.1)],
        "median": sorted[floori((sorted.size() - 1) * 0.5)], "p90": sorted[floori((sorted.size() - 1) * 0.9)],
        "max": sorted[-1]}


func _accumulate(mode: String, price: int, after_bed: bool) -> Dictionary:
    var rng := RandomNumberGenerator.new()
    rng.seed = BASE_SEED + price + int(after_bed) * 10000
    var times := []
    var counts := []
    for _trial in 1000:
        var leaves := 0
        var elapsed := 0.0
        var count := 0
        var bought_bed := not after_bed
        while leaves < price or not bought_bed:
            var game: String = ["pairs", "match", "orchard"][count % 3] if mode == "alternate" else mode
            var record: Dictionary = samples[game][rng.randi_range(0, RUNS - 1)]
            leaves += maxi(5, int(record.leaves)) if count == 0 else int(record.leaves)
            elapsed += float(record.seconds) + 5.0 # Open/select next game; part of the stated policy.
            count += 1
            if not bought_bed and leaves >= 5:
                leaves -= 5
                bought_bed = true
                elapsed += 10.0 # Shop purchase + return, a timing assumption.
            assert(count < 10000)
        times.append(elapsed)
        counts.append(count)
    return {"seconds": _distribution(times), "rounds": _distribution(counts)}
