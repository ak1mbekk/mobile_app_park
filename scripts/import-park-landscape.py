"""Convert a park-area OSM API XML extract to the lightweight visitor map layer."""
import json
import math
import sys
from collections import Counter
from xml.etree import ElementTree


def tags(element):
    return {tag.get("k"): tag.get("v") for tag in element.findall("tag")}


def kind(t):
    if "building" in t and t["building"] != "no":
        return "building"
    if t.get("natural") == "water" or t.get("waterway") == "riverbank":
        return "water"
    if t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest":
        return "wood"
    if t.get("landuse") in ("meadow", "grass", "recreation_ground"):
        return "grass"
    if "highway" in t:
        return "walk" if t["highway"] in ("path", "footway", "steps", "pedestrian", "cycleway") else "road"
    if t.get("barrier") in ("fence", "wall"):
        return "fence"
    if "waterway" in t:
        return "stream"


def rings(parts):
    pending = list(parts)
    while pending:
        chain = list(pending.pop())
        while chain[0] != chain[-1]:
            for i, other in enumerate(pending):
                if chain[-1] in (other[0], other[-1]):
                    chain.extend((other if chain[-1] == other[0] else other[::-1])[1:])
                    pending.pop(i)
                    break
            else:
                break
        if len(chain) >= 4 and chain[0] == chain[-1]:
            yield chain


def contains(ring, point):
    x, y = point
    return sum((a[1] > y) != (b[1] > y) and
               x < (b[0]-a[0]) * (y-a[1]) / (b[1]-a[1]) + a[0]
               for a, b in zip(ring, ring[1:])) % 2


root = ElementTree.parse(sys.argv[1]).getroot()
nodes = {n.get("id"): [float(n.get("lon")), float(n.get("lat"))] for n in root.findall("node")}
ways = {w.get("id"): [n.get("ref") for n in w.findall("nd")] for w in root.findall("way")}
features = []


def add(k, geom, coords, t):
    props = {"kind": k}
    if k == "building":
        try:
            props["height"] = float(t["height"]) if "height" in t else 3 * float(t.get("building:levels", 1))
        except ValueError:
            props["height"] = 3
        # Parallel sunlight, cast onto the ground plane. Heights without a survey
        # use the same storey estimate as the rendered building.
        lat = coords[0][0][1]
        dy = props["height"] * 0.75 / 111320
        dx = dy / math.cos(math.radians(lat))
        shadow = [[[round(x+dx,7), round(y-dy,7)] for x,y in ring] for ring in coords]
        features.append({"type":"Feature","properties":{"kind":"shadow"},
                         "geometry":{"type":"Polygon","coordinates":shadow}})
    features.append({"type": "Feature", "properties": props, "geometry": {"type": geom, "coordinates": coords}})


for rel in root.findall("relation"):
    t = tags(rel)
    k = kind(t)
    if t.get("type") != "multipolygon" or not k:
        continue
    def polygons(role):
        parts = [ways[m.get("ref")] for m in rel.findall("member")
                 if m.get("role") == role and m.get("ref") in ways and m.get("type") == "way"]
        return [[nodes[n] for n in ring] for ring in rings(parts)]
    holes = polygons("inner")
    for outer in polygons("outer"):
        add(k, "Polygon", [outer] + [h for h in holes if contains(outer, h[0])], t)

for w in root.findall("way"):
    t = tags(w)
    k = kind(t)
    if not k:
        continue
    coords = [nodes[n] for n in ways[w.get("id")]]
    if k in ("wood", "water", "building", "grass"):
        if len(coords) >= 4 and coords[0] == coords[-1]:
            add(k, "Polygon", [coords], t)
    elif len(coords) >= 2:
        add(k, "LineString", coords, t)

with open(sys.argv[2], "w", encoding="utf8") as handle:
    json.dump({"type": "FeatureCollection", "features": features}, handle, separators=(",", ":"))
print(Counter(f["properties"]["kind"] for f in features))
