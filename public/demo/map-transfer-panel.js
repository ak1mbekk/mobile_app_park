import { parkTransfer, shuttleDepartures } from './park-transfer.js';

export function routeMarker(kind, stop) {
  const marker = document.createElement(stop ? 'a' : 'span');
  marker.className = 'map-route-marker';
  marker.dataset.marker = kind;
  if (stop) {
    marker.href = '#map/' + stop.zone + '/' + stop.id;
    marker.setAttribute('role','link');
    marker.setAttribute('aria-label',stop.name);
  } else marker.setAttribute('aria-hidden','true');
  marker.innerHTML = '<svg viewBox="0 0 32 36" aria-hidden="true"><use href="#route-' + kind + '"/></svg>';
  if (stop) {
    const label = document.createElement('span');
    label.className = 'map-bus-marker-label';
    label.textContent = stop.name.replace(/^Остановка «|»$/g,'');
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
  const parkingLabels = {1:'Парковка «Казачны мір»',2:'Гостевая парковка «Лясныя таямніцы»'};
  const start = panel.querySelector('[data-marker="start"] dd');
  const finish = panel.querySelector('[data-marker="finish"] dd');
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
      start.textContent = parkingLabels[zone];
      finish.textContent = parkingLabels[3 - zone];
      distance.textContent = kilometres.format(parkTransfer(mode,zone).kilometres);
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
