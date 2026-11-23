extends RefCounted

const BED_PRICE := 5
const HATS := ["cap", "ranger", "crown"]
const BEDS := ["bed", "bed-willow", "settee", "bed-oak", "bed-daybed"]
const BATHS := ["base-bath", "bath-carved", "bath", "bath-copper", "bath-faience"]
const FURNITURE := ["bed", "bed-willow", "bed-oak", "bed-daybed", "cushion", "lantern", "chest", "settee", "base-bath", "bath-carved", "bath", "bath-copper", "bath-faience", "wallpaper", "bath-tile", "kitchen-cabinet"]

# The standalone catalog mirrors public/demo/home.js. Hosted play receives its catalog from the browser.
const ITEMS := {
    "cap": {"name": "Льняная кепка", "tier": "Обычная", "price": 10},
    "ranger": {"name": "Шляпа следопыта", "tier": "Редкая", "price": 30},
    "crown": {"name": "Янтарная корона", "tier": "Эпическая", "price": 80},
    "bed": {"name": "Лежанка", "tier": "Обычная", "price": BED_PRICE},
    "bed-willow": {"name": "Плетёное гнездо", "tier": "Обычное", "price": 20, "replaces": "место для сна"},
    "bed-oak": {"name": "Резная лежанка", "tier": "Эпическая", "price": 70, "replaces": "место для сна"},
    "bed-daybed": {"name": "Черничная кушетка", "tier": "Легендарная", "price": 110, "replaces": "место для сна"},
    "cushion": {"name": "Вышитая подушка", "tier": "Обычная", "price": 15},
    "lantern": {"name": "Фонарь лесника", "tier": "Редкий", "price": 35},
    "chest": {"name": "Дубовый сундук", "tier": "Эпический", "price": 75},
    "settee": {"name": "Диван у окна", "tier": "Редкий", "price": 40, "replaces": "лежанку"},
    "base-bath": {"name": "Деревянная купель", "tier": "Базовая", "price": 0, "replaces": "купель"},
    "bath-carved": {"name": "Резная дубовая купель", "tier": "Обычная", "price": 25, "replaces": "купель"},
    "bath": {"name": "Эмалированная купель", "tier": "Редкая", "price": 55, "replaces": "купель"},
    "bath-copper": {"name": "Медная купель", "tier": "Эпическая", "price": 85, "replaces": "купель"},
    "bath-faience": {"name": "Фаянсовая купель", "tier": "Легендарная", "price": 120, "replaces": "купель"},
    "wallpaper": {"name": "Обои для кухни", "tier": "Обычные", "price": 20, "replaces": "отделку кухни"},
    "bath-tile": {"name": "Плитка для ванной", "tier": "Обычная", "price": 25, "replaces": "отделку ванной"},
    "kitchen-cabinet": {"name": "Мятный кухонный шкаф", "tier": "Обычный", "price": 35, "replaces": "кухонный шкаф"},
}


static func leaf_price(price: int) -> String:
    var unit := "листьев"
    if price % 100 not in [11, 12, 13, 14]:
        if price % 10 == 1:
            unit = "лист"
        elif price % 10 in [2, 3, 4]:
            unit = "листа"
    return "%d %s" % [price, unit]


static func growth_hint(xp: int) -> String:
    var level := 1 + floori(xp / 30.0)
    if xp < 90:
        return "Малыш · уровень %d · до юного: %d XP (ур. 4)" % [level, 90 - xp]
    if xp < 270:
        return "Юный · уровень %d · до взрослого: %d XP (ур. 10)" % [level, 270 - xp]
    return "Взрослый · уровень %d · все 3 ступени роста открыты" % level


static func bed_in_use(placed: Array) -> String:
    # Preserve the visible settee from legacy saves with both original beds.
    for id: String in ["bed-daybed", "bed-oak", "settee", "bed-willow", "bed"]:
        if placed.has(id):
            return id
    return ""


static func bath_in_use(placed: Array) -> String:
    for id: String in BATHS:
        if id != "base-bath" and placed.has(id):
            return id
    return "base-bath"


static func is_owned(id: String, owned: Array) -> bool:
    return id == "base-bath" or owned.has(id)


static func is_installed(id: String, placed: Array, hat: String) -> bool:
    if id in BATHS:
        return bath_in_use(placed) == id
    return hat == id if id in HATS else placed.has(id)


static func item_status(id: String, owned: Array, placed: Array, hat: String, leaves: int) -> String:
    if is_owned(id, owned):
        var installed := is_installed(id, placed, hat)
        return ("Надето" if id in HATS else "Установлено") if installed else "В коллекции"
    var missing := maxi(0, int(ITEMS[id].price) - leaves)
    return "Можно купить" if missing == 0 else "Ещё " + leaf_price(missing)


static func next_furniture(owned: Array) -> String:
    var next := ""
    for id: String in FURNITURE:
        if not is_owned(id, owned) and (next.is_empty() or ITEMS[id].price < ITEMS[next].price):
            next = id
    return next


static func furniture_goal(owned: Array, placed: Array, leaves: int) -> String:
    var current := "без лежанки"
    var bed := bed_in_use(placed)
    if not bed.is_empty():
        current = ITEMS[bed].name
    var next := next_furniture(owned)
    var summary := "Место для сна: " + current + ". "
    if next.is_empty():
        return summary + "Вся мебель собрана — меняй обстановку бесплатно."
    return summary + "Следующая покупка: " + ITEMS[next].name + " · " + leaf_price(ITEMS[next].price) + ". " + item_status(next, owned, placed, "", leaves) + "."
