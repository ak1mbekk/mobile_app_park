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
  let snapshot, draft = null, saving = false, mode = null, drag = null;
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
    undo.disabled = saving || mode !== 'trace' || !draft?.length;
    cancel.disabled = saving || draft === null;
    save.disabled = saving || !canSave();
    clear.hidden = !committed() || draft !== null;
    clear.disabled = saving;
    note.textContent = message || (mode === 'edit' ? 'Перетащите круглый узел или потяните контур целиком. Затем сохраните изменения.' :
      draft ? 'Вершин: ' + draft.length + '. Контур должен охватывать номер на плане и не пересекать себя.' :
      committed() ? 'Контур сохранён · ' + committed().length + ' вершин. Его углы и всю площадь можно перетаскивать.' :
      'Выберите вольер и последовательно отметьте вершины ограды.');
    redraw();
  }

  function draw(transform) {
    layer.style.transform = transform;
    layer.replaceChildren();
    const ring = draft || committed();
    if (!section.open || !ring?.length) return;
    const pixels = ring.map(([x, y]) => [x * width, y * height]);
    const outline = document.createElementNS(namespace, mode === 'trace' ? 'polyline' : 'polygon');
    outline.dataset.boundaryDrag = 'all';
    outline.setAttribute('points', pixels.map(p => p.join(',')).join(' '));
    layer.append(outline);
    for (const [index, [x, y]] of pixels.entries()) {
      const dot = document.createElementNS(namespace, 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', '1.5');
      dot.dataset.boundaryVertex = String(index);
      layer.append(dot);
    }
  }

  function add(point) {
    if (mode !== 'trace' || draft === null || !section.open) return false;
    if (!saving && draft.length < 128 && point.every(coord => coord >= 0 && coord <= 1)) {
      draft.push(point.map(coord => Number(coord.toFixed(8))));
      controls();
    }
    return true;
  }

  function startDrag(target, point) {
    const ring = committed();
    if (!section.open || saving || !ring || mode === 'trace') return false;
    if (!draft) draft = ring.map(vertex => [...vertex]);
    mode = 'edit';
    drag = { target, start: point, initial: draft.map(vertex => [...vertex]) };
    controls(target === 'all' ? 'Переносим весь контур…' : 'Перемещаем угол контура…');
    return true;
  }

  function dragTo(point) {
    if (!drag || mode !== 'edit') return;
    if (drag.target !== 'all') {
      draft[drag.target] = point.map(value => Number(Math.max(0, Math.min(1, value)).toFixed(8)));
    } else {
      const dx = point[0] - drag.start[0], dy = point[1] - drag.start[1];
      const xs = drag.initial.map(vertex => vertex[0]), ys = drag.initial.map(vertex => vertex[1]);
      const safeDx = Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), dx));
      const safeDy = Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), dy));
      draft = drag.initial.map(([x, y]) => [Number((x + safeDx).toFixed(8)), Number((y + safeDy).toFixed(8))]);
    }
    controls();
  }

  function endDrag() {
    if (!drag) return;
    drag = null;
    controls();
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
      mode = null;
      message = ring ? 'Контур опубликован.' : 'Контур удалён.';
    } catch (error) { message = error.message; }
    saving = false;
    controls(message);
  }

  section.ontoggle = () => { if (section.open && picker.value) center(points.get(picker.value)); redraw(); };
  picker.onchange = () => { if (picker.value) center(points.get(picker.value)); controls(); };
  trace.onclick = () => { draft = []; mode = 'trace'; controls(); };
  undo.onclick = () => { draft?.pop(); controls(); };
  cancel.onclick = () => { draft = null; mode = null; drag = null; controls(); };
  save.onclick = () => { if (canSave()) publish(draft); };
  clear.onclick = () => publish(null);

  fetch('map-boundaries.json', { cache: 'no-store' }).then(response => response.json()).then(value => {
    if (!validBoundaries(value)) throw Error();
    snapshot = value;
    const requested = new URLSearchParams(location.hash.slice(1)).get('boundary');
    if (requested && points.has(requested)) {
      picker.value = requested;
      section.open = true;
      center(points.get(requested));
    }
    controls();
  }).catch(() => controls('Не удалось загрузить контуры вольеров.'));

  return {
    draw, add, startDrag, dragTo, endDrag,
    get open() { return section.open; },
    get drawing() { return section.open && mode === 'trace'; },
    get dragging() { return Boolean(drag); }
  };
}
