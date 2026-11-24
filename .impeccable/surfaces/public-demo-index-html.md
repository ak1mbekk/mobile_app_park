---
version: 1
slug: "public-demo-index-html"
primary_target: "public/demo/index.html"
related_targets: ["public/demo/visitor.css","public/demo/park-map.js"]
---

# Карта парка

Mode: Operate. Scope: `public/demo/index.html` and the map-first visitor shell around it.

Audience: a park visitor holding a phone outdoors. Job: find an animal or facility, understand which zone it belongs to, and follow only the highlighted public paths. Primary action: search and reveal a place on the map. Constraints: no virtual pet, game economy, rooms, mini-games, family account, external map handoff, Windows/Fluent styling, fabricated park facts, or decorative dashboard metrics.

## Direction contract

THESIS: The interface is a wildlife observation station built around the live park map, not a home screen made of feature cards. The map is the working surface from the first pixel; supporting tools attach to its edge and never displace it.

OWN-WORLD: Deep pine structure, pale lichen work surfaces, lake blue geography, warm orange only for the current target, and graphite text. Controls are compact field labels and durable rails with crisp 1px rules, square-ended geometry and restrained 12px corners. One self-hosted workhorse sans carries Cyrillic labels, names and data. No glass, oversized pills, fake paper, gradients or decorative shadows.

STORY: The visitor opens directly on the two park zones, searches by animal rather than enclosure number, selects a result and sees its territory, nearby path and useful services without leaving the application. Animals and visitor information remain secondary destinations in the same shell.

FIRST VIEWPORT: On desktop, a 92px pine navigation rail anchors the left edge, the map fills the remaining viewport, and a slim lichen context strip holds zone switching and search. A compact observation drawer opens from the right for search and place details. On phones, the map remains full height; the brand becomes a small top plate, zone switching becomes a two-line compact control, and the three primary destinations sit in a bottom navigation dock above the safe area. The signature interaction is “focus the sighting”: selecting an animal tightens the map camera, raises one orange locator and turns the drawer from search results into the animal’s place record.

FORM: Assigned grounded direction 3, “wildlife observation station”, seed key `47d3e757`. Raise from Japanese high-density web: information density without card inflation. Raise from Crouwel’s specimen: strict alignment to one visible module rhythm. Raise from transit diagrams: unmistakable active route and transfer context. Raise from split-flap boards: status changes replace in place rather than opening stacked overlays.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: official brand palette and type system are not supplied; this branch uses an explicit product UI system that must not be presented as the park’s official identity.
