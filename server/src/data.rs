use serde_json::Value;

fn text(value: &Value) -> bool {
    value.as_str().is_some_and(|value| !value.trim().is_empty())
}

fn zone(value: &Value) -> bool {
    matches!(value.as_u64(), Some(1 | 2))
}

fn date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(i, &b)| match i {
            4 | 7 => b == b'-',
            _ => b.is_ascii_digit(),
        })
}

fn time(value: &Value) -> Option<&str> {
    let value = value.as_str()?;
    match value.as_bytes() {
        [h1, h2, b':', m1, m2] if h1.is_ascii_digit() && h2.is_ascii_digit()
            && m2.is_ascii_digit() && *m1 >= b'0' && *m1 <= b'5'
            && (*h1, *h2) <= (b'2', b'3') => Some(value),
        _ => None,
    }
}

fn unique_ids(rows: &[Value]) -> bool {
    let mut ids = std::collections::HashSet::new();
    rows.iter().all(|row| row["id"].as_str().is_some_and(|id| text(&row["id"]) && ids.insert(id)))
}

fn list(value: &Value, validate: impl FnMut(&Value) -> bool) -> bool {
    value.as_array().is_some_and(|rows| rows.iter().all(validate))
}

fn schedule(value: &Value) -> bool {
    value.as_array().is_some_and(|rows| unique_ids(rows)) && list(value, |row| {
        let Some(start) = time(&row["start"]) else { return false };
        zone(&row["zone"]) && text(&row["place"]) && text(&row["name"])
            && row.get("end").is_none_or(|end| time(end).is_some_and(|end| end > start))
            && row.get("status").is_none_or(|status| matches!(status.as_str(), Some("published" | "cancelled")))
    })
}

fn point(pair: &Value, width: f64, height: f64) -> bool {
    pair.as_array().is_some_and(|pair| pair.len() == 2
        && pair[0].as_f64().is_some_and(|x| (0.0..=width).contains(&x))
        && pair[1].as_f64().is_some_and(|y| (0.0..=height).contains(&y)))
}

fn line(value: &Value, min: usize, max: usize, width: f64, height: f64) -> bool {
    value.as_array().is_some_and(|points| (min..=max).contains(&points.len())
        && points.iter().all(|pair| point(pair, width, height)))
}

pub fn valid(file: &str, data: &Value) -> bool {
    let revision = || data["revision"].as_u64().is_some_and(|rev| rev <= (1u64 << 53) - 1);
    let raster = || data["raster"] == "enclosures-2064x2369";
    match file {
        "catalogue.json" => data.as_array().is_some_and(|rows| !rows.is_empty())
            && list(data, |row| text(&row["slug"]) && text(&row["name"]) && text(&row["category"])),
        "feeding-programme.json" => data["verifiedOn"].as_str().is_some_and(date)
            && schedule(&data["daily"]) && data["byDate"].as_object().is_some_and(|dates|
                dates.iter().all(|(day, events)| date(day) && schedule(events))),
        "map-alignment.json" => raster() && revision()
            && ["centerX", "centerY", "angle"].iter().all(|key| data[key].is_number())
            && data["scale"].as_f64().is_some_and(|scale| scale > 0.0)
            && data.get("animalPositions").is_none_or(|positions| positions.as_object()
                .is_some_and(|positions| positions.values().all(|pos| point(pos, 90.0, 180.0)))),
        "map-boundaries.json" => raster() && revision() && data["enclosures"].as_object()
            .is_some_and(|enclosures| enclosures.values().all(|ring| line(ring, 3, 128, 1.0, 1.0))
                && data.get("schematic").is_none_or(|ids| list(ids, |id| id.as_str()
                    .is_some_and(|id| enclosures.contains_key(id)))))
            && data.get("segments").is_none_or(|segments| segments.as_object()
                .is_some_and(|segments| segments.values().all(|segment| line(segment, 2, 128, 1.0, 1.0)))),
        "map-guest-paths.json" => revision() && data["paths"].as_array()
            .is_some_and(|paths| paths.len() <= 256 && unique_ids(paths))
            && list(&data["paths"], |path| zone(&path["zone"]) && text(&path["name"])
                && matches!(path["status"].as_str(), Some("plan" | "mapped" | "open" | "closed"))
                && line(&path["points"], 2, 256, 2064.0, 2369.0)),
        _ => false,
    }
}
