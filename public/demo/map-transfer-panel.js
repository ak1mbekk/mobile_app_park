import { parkTransfer, shuttleDepartures } from './park-transfer.js';

const placeRoute = place => '#map/' + place.zone + '/' + place.id;

export function routeMarker(kind, place) {
  const marker = document.createElement(place ? 'a' : 'span');
  marker.className = 'map-route-marker';
  marker.dataset.marker = kind;
  const glyph = place && kind !== 'bus' ? 'parking' : kind;
  if (place) {
    marker.href = placeRoute(place);
    marker.setAttribute('role','link');
    marker.setAttribute('aria-label',place.name);
  } else marker.setAttribute('aria-hidden','true');
  marker.innerHTML = '<svg viewBox="0 0 32 36" aria-hidden="true"><use href="#route-' + glyph + '"/></svg>';
  if (place) {
    const label = document.createElement('span');
    label.className = 'map-route-marker-label';
    label.textContent = place.name.match(/«([^»]+)»/)?.[1] || place.name;
    marker.append(label);
  }
  return marker;
}

export function createTransferPanel(host) {
  const panel = host.querySelector('.map-transfer-panel');
  const controls = host.querySelector('.map-bottom-actions');
  const trigger = controls.querySelector('.map-arrival-toggle');
  const close = panel.querySelector('.map-transfer-close');
  const modes = panel.querySelectorAll('[data-transfer-mode]');
  const sections = panel.querySelectorAll('[data-transfer-info]');
  const schedule = panel.querySelector('#shuttle-schedule');
  const targetLink = panel.querySelector('.map-transfer-target');
  const departures = schedule.querySelector('.shuttle-departures');
  const parkingLinks = panel.querySelectorAll('.map-transfer-points a');
  const distance = panel.querySelector('.map-route-distance');
  const kilometres = new Intl.NumberFormat('ru',{style:'unit',unit:'kilometer',maximumFractionDigits:1});

  schedule.addEventListener('toggle', () => {
    if (!schedule.open || departures.childElementCount) return;
    departures.replaceChildren(...shuttleDepartures.map(({stop,times,zone}) => {
      const row = document.createElement('div');
      const name = document.createElement('dt');
      const values = document.createElement('dd');
      if (zone) {
        const link = document.createElement('a');
        link.href = '#map/' + zone + '/park-shuttle-stop';
        link.textContent = stop;
        row.className = 'shuttle-park-stop';
        name.append(link);
      } else name.textContent = stop;
      values.append(...times.map(value => {
        const time = document.createElement('time');
        time.dateTime = value;
        time.textContent = value;
        return time;
      }));
      row.append(name,values);
      return row;
    }));
  });

  function update(zone, mode, target) {
    const route = '#map/' + zone;
    const suffix = target ? '/to/' + target.id : '';
    const opening = mode && panel.hidden;
    const focusOnClose = !mode && !panel.hidden && panel.contains(document.activeElement);
    panel.hidden = !mode;
    controls.hidden = Boolean(mode);
    trigger.href = route + '/directions';
    trigger.setAttribute('aria-expanded',String(Boolean(mode)));
    close.href = route;
    for (const link of modes) {
      link.href = route + '/directions' + (link.dataset.transferMode === 'car' ? '/car' : '') + suffix;
      if (link.dataset.transferMode === mode) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    }
    for (const section of sections) section.hidden = section.dataset.transferInfo !== mode;
    if (mode === 'car') {
      const drive = parkTransfer(mode,zone);
      for (const [index, parking] of drive.places.entries()) {
        parkingLinks[index].href = placeRoute(parking);
        parkingLinks[index].querySelector('strong').textContent = parking.name;
      }
      distance.textContent = kilometres.format(drive.kilometres);
    }
    targetLink.hidden = !target;
    if (target) {
      targetLink.href = '#map/' + target.zone + '/' + target.id;
      targetLink.textContent = 'После приезда · ' + target.name;
    }
    if (opening) panel.querySelector('h2').focus({preventScroll:true});
    if (focusOnClose) trigger.focus({preventScroll:true});
  }

  return {panel, update, focusTrigger:() => trigger.focus({preventScroll:true})};
}
