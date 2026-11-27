import {eventsForDay, feedingView, isCalendarDay, nextFeeding, todayInPark} from './feeding-model.js';

const programmeKey = 'visitor-feeding-programme-v1';
const visitKey = 'park-visit-date';
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function validList(list, places) {
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  return list.every(event => {
    if (!event || typeof event.id !== 'string' || !/^[a-z0-9-]+$/.test(event.id) || ids.has(event.id)) return false;
    ids.add(event.id);
    return typeof event.name === 'string' && event.name.trim() && clock.test(event.start) &&
      (!event.end || (clock.test(event.end) && event.end > event.start)) &&
      (!event.status || ['published','cancelled'].includes(event.status)) &&
      places.has(event.zone+'/'+event.place);
  });
}

function validProgramme(data) {
  const places = new Set(window.parkGuide.places.map(place => place.zone+'/'+place.id));
  return data && isCalendarDay(data.verifiedOn) && validList(data.daily,places) && data.byDate &&
    typeof data.byDate === 'object' && !Array.isArray(data.byDate) &&
    Object.entries(data.byDate).every(([day,events]) => isCalendarDay(day) && validList(events,places));
}

const publication = window.parkGuideData;
const observers = new EventTarget();
let programme, pending, state = 'idle', selectedDay;
try { selectedDay = localStorage.getItem(visitKey); } catch {}

function announce() {
  observers.dispatchEvent(new Event('change'));
}

async function fetchProgramme(refresh) {
  try {
    if (refresh) await publication.refresh();
    await publication.ready;
    let source, data;
    do {
      source = publication.current;
      try {
        data = await publication.load('feeding-programme.json', {cache:'no-cache'});
      } catch (error) {
        if (source === publication.current) throw error;
      }
    } while (source !== publication.current);
    if (!validProgramme(data)) throw Error('Invalid programme');
    programme = data;
    if (!publication.live) {
      try { localStorage.setItem(programmeKey,JSON.stringify(data)); } catch {}
    }
    state = 'ready';
  } catch {
    if (publication.current === null) {
      try {
        const cached = JSON.parse(localStorage.getItem(programmeKey));
        if (validProgramme(cached)) programme = cached;
      } catch {}
    }
    state = 'error';
  }
}

function load({refresh = true} = {}) {
  if (pending) return pending;
  state = 'loading';
  pending = fetchProgramme(refresh).finally(() => { pending = null; announce(); });
  announce();
  return pending;
}

publication.subscribe(source => {
  if (state === 'idle' || pending) return;
  if (!source) {
    load({refresh:false});
    return;
  }
  if (validProgramme(source.feedings)) {
    programme = source.feedings;
    state = 'ready';
  } else state = 'error';
  announce();
});

const today = () => todayInPark(new Date());
const visitDate = () => isCalendarDay(selectedDay) && selectedDay >= today() ? selectedDay : today();

export const parkSchedule = {
  load, today, visitDate,
  setVisitDate(day) {
    if (!isCalendarDay(day) || day < today()) return false;
    selectedDay = day;
    try { localStorage.setItem(visitKey,day); } catch {}
    return true;
  },
  view(day, eventId, now) { return feedingView(programme,day,eventId,now); },
  forDay(day) { return eventsForDay(programme,day); },
  nextFor(day) { return nextFeeding(eventsForDay(programme,day),day,new Date()); },
  subscribe(listener) { observers.addEventListener('change',listener); },
  get state() { return state; },
  get edition() { return programme?.verifiedOn; },
};
window.parkSchedule = parkSchedule;
