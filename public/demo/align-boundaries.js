import { contains, height, validBoundaries, validRing, width } from './map-boundary-geometry.js';

const namespace = 'http://www.w3.org/2000/svg';

export function setupBoundaryEditor(enclosures, label, center, redraw) {
  const byId = id => document.getElementById(id);
  const section = byId('boundary-editor'), picker = byId('boundary-place'), note = byId('boundary-note');
  const trace = byId('trace-boundary'), undo = byId('undo-boundary'), cancel = byId('cancel-boundary');
  const save = byId('save-boundary'), clear = byId('clear-boundary');
  const layer = document.createElementNS(namespace, 'svg');
  layer.id = 'boundary-layer';
  layer.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  layer.setAttribute('aria-hidden', 'true');
  byId('drag-area').append(layer);

  const points = new Map(enclosures.map(place => [place.zone + '/' + place.id, place]));
  for (const [key, place] of points) picker.add(new Option(label(place), key));
  let snapshot, draft = null, saving = false;
  const committed = () => snapshot?.enclosures[picker.value];
  const centerOf = () => {
    const place = points.get(picker.value);
    return place && window.parkProjection.planPixel(place.zone, place).map((value, i) => value / [width, height][i]);
  };
  const canSave = () => Boolean(draft && validRing(draft) && centerOf() && contains(draft, centerOf()));

  function controls(message) {
    const chosen = Boolean(snapshot && picker.value);
    picker.disabled = saving || draft !== null;
    trace.disabled = !chosen || saving || draft !== null;
    trace.textContent = committed() ? 'Обвести заново' : 'Начать обводку';
    undo.disabled = saving || !draft?.length;
    cancel.disabled = saving || draft === null;
    save.disabled = saving || !canSave();
    clear.hidden = !committed() || draft !== null;
    clear.disabled = saving;
    note.textContent = message || (draft ? 'Вершин: ' + draft.length + '. Контур должен охватывать номер на плане и не пересекать себя.' :
      committed() ? 'Контур сохранён · ' + committed().length + ' вершин.' : 'Выберите вольер и последовательно отметьте вершины ограды.');
    redraw();
  }

  function draw(transform) {
    layer.style.transform = transform;
    layer.replaceChildren();
    const ring = draft || committed();
    if (!section.open || !ring?.length) return;
    const pixels = ring.map(([x, y]) => [x * width, y * height]);
    const outline = document.createElementNS(namespace, draft ? 'polyline' : 'polygon');
    outline.setAttribute('points', pixels.map(p => p.join(',')).join(' '));
    layer.append(outline);
    for (const [x, y] of pixels) {
      const dot = document.createElementNS(namespace, 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', '1.5');
      layer.append(dot);
    }
  }

  function add(point) {
    if (draft === null || !section.open) return false;
    if (!saving && draft.length < 128 && point.every(coord => coord >= 0 && coord <= 1)) {
      draft.push(point.map(coord => Number(coord.toFixed(8))));
      controls();
    }
    return true;
  }

  async function publish(ring) {
    if (!snapshot || saving) return;
    saving = true;
    controls('Сохраняем контур…');
    const enclosures = { ...snapshot.enclosures };
    if (ring) enclosures[picker.value] = ring;
    else delete enclosures[picker.value];
    let message;
    try {
      const response = await fetch('/__park/boundaries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...snapshot, enclosures })
      });
      if (response.status === 409) throw Error('Контуры изменились в другой вкладке. Обновите редактор.');
      if (!response.ok) throw Error('Сохранение контуров доступно через локальный сервер Vite.');
      const updated = await response.json();
      if (!validBoundaries(updated)) throw Error('Сервер вернул некорректные контуры.');
      snapshot = updated;
      draft = null;
      message = ring ? 'Контур опубликован.' : 'Контур удалён.';
    } catch (error) { message = error.message; }
    saving = false;
    controls(message);
  }

  section.ontoggle = () => { if (section.open && picker.value) center(points.get(picker.value)); redraw(); };
  picker.onchange = () => { if (picker.value) center(points.get(picker.value)); controls(); };
  trace.onclick = () => { draft = []; controls(); };
  undo.onclick = () => { draft?.pop(); controls(); };
  cancel.onclick = () => { draft = null; controls(); };
  save.onclick = () => { if (canSave()) publish(draft); };
  clear.onclick = () => publish(null);

  fetch('map-boundaries.json', { cache: 'no-store' }).then(response => response.json()).then(value => {
    if (!validBoundaries(value)) throw Error();
    snapshot = value;
    controls();
  }).catch(() => controls('Не удалось загрузить контуры вольеров.'));

  return { draw, add, get open() { return section.open; }, get drawing() { return section.open && draft !== null; } };
}
