extends RefCounted

const BED_PRICE := 5
const HATS := ["cap", "ranger", "crown"]
const FURNITURE := ["bed", "cushion", "lantern", "chest", "settee", "bath"]

# The standalone catalog mirrors public/demo/home.js. Hosted play receives its catalog from the browser.
const ITEMS := {
    "cap": {"name": "Льняная кепка", "tier": "Обычная", "price": 10},
    "ranger": {"name": "Шляпа следопыта", "tier": "Редкая", "price": 30},
    "crown": {"name": "Янтарная корона", "tier": "Эпическая", "price": 80},
    "bed": {"name": "Лежанка", "tier": "Обычная", "price": BED_PRICE},
    "cushion": {"name": "Вышитая подушка", "tier": "Обычная", "price": 15},
    "lantern": {"name": "Фонарь лесника", "tier": "Редкий", "price": 35},
    "chest": {"name": "Дубовый сундук", "tier": "Эпический", "price": 75},
    "settee": {"name": "Диван у окна", "tier": "Редкий", "price": 40, "replaces": "лежанку"},
    "bath": {"name": "Эмалированная купель", "tier": "Редкая", "price": 55, "replaces": "ванну"},
}


static func leaf_price(price: int) -> String:
    var unit := "листьев"
    if price % 100 not in [11, 12, 13, 14]:
        if price % 10 == 1:
            unit = "лист"
        elif price % 10 in [2, 3, 4]:
            unit = "листа"
    return "%d %s" % [price, unit]
