import { parkTransfer, shuttleDepartures } from './park-transfer.js';

export function shuttleStopLink(stop, index) {
  const link = document.createElement('a');
  link.href = '#map/' + stop.zone + '/' + stop.id;
  link.setAttribute('aria-label',stop.name);
  link.textContent = ['А','Б'][index];
  return link;
}

export function createTransferPanel(host) {
  const panel = host.querySelector('.map-transfer-panel');
  const controls = host.querySelector('.map-bottom-actions');
  const trigger = controls.querySelector('.map-arrival-toggle');
  const close = panel.querySelector('.map-transfer-close');
  const modes = panel.querySelectorAll('[data-transfer-mode]');
  const sections = panel.querySelectorAll('[data-transfer-info]');
  const schedule = panel.querySelector('#shuttle-schedule');
  const departures = schedule.querySelector('.shuttle-departures');
  panel.querySelector('.map-route-distance').textContent =
    new Intl.NumberFormat('ru',{style:'unit',unit:'kilometer',maximumFractionDigits:1}).format(parkTransfer.car.kilometres);

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

  function update(zone, mode) {
    const route = '#map/' + zone;
    const opening = mode && panel.hidden;
    const focusOnClose = !mode && !panel.hidden && panel.contains(document.activeElement);
    panel.hidden = !mode;
    controls.hidden = Boolean(mode);
    trigger.href = route + '/directions';
    trigger.setAttribute('aria-expanded',String(Boolean(mode)));
    close.href = route;
    for (const link of modes) {
      link.href = route + '/directions' + (link.dataset.transferMode === 'car' ? '/car' : '');
      if (link.dataset.transferMode === mode) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    }
    for (const section of sections) section.hidden = section.dataset.transferInfo !== mode;
    if (opening) panel.querySelector('h2').focus({preventScroll:true});
    if (focusOnClose) trigger.focus({preventScroll:true});
  }

  return {panel, update, focusTrigger:() => trigger.focus({preventScroll:true})};
}
