(() => {
  const storageKey = 'visitor-feeding-programme-v1';
  const day = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Minsk', year:'numeric', month:'2-digit', day:'2-digit'});
  const hours = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'});
  const isoDay = /^\d{4}-\d{2}-\d{2}$/;
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  let programme, pending, state = 'idle';
  function validList(list) {
    if (!Array.isArray(list)) return false;
    const ids = new Set();
    return list.every(event => {
      if (!event || typeof event.id !== 'string' || !/^[a-z0-9-]+$/.test(event.id) || ids.has(event.id)) return false;
      ids.add(event.id);
      return typeof event.name === 'string' && event.name.trim() && clock.test(event.start) &&
        (!event.end || (clock.test(event.end) && event.end > event.start)) &&
        (!event.status || ['published','cancelled'].includes(event.status)) &&
        window.parkGuide.places.some(p => p.zone === event.zone && p.id === event.place);
    });
  }
  function valid(data) {
    return data && isoDay.test(data.verifiedOn) && validList(data.daily) && data.byDate &&
      typeof data.byDate === 'object' && !Array.isArray(data.byDate) &&
      Object.entries(data.byDate).every(([date, list]) => isoDay.test(date) && validList(list));
  }
  const announce = () => document.dispatchEvent(new Event('parkprogrammechange'));
  function load() {
    if (pending) return pending;
    state = 'loading';
    pending = (async () => {
      try {
        const data = await window.parkGuideData.load('feeding-programme.json', {cache:'no-cache'});
        if (!valid(data)) throw Error('Invalid programme');
        programme = data;
        if (!window.parkGuideData.live) {
          try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
        }
        state = 'ready';
      } catch {
        if (await window.parkGuideData.ready === null) {
          try {
            const cached = JSON.parse(localStorage.getItem(storageKey));
            if (valid(cached)) programme = cached;
          } catch {}
        }
        state = 'error';
      }
      finally { pending = null; announce(); }
    })();
    announce();
    return pending;
  }
  const today = () => day.format(new Date());
  let selectedDay;
  try { selectedDay=localStorage.getItem('park-visit-date'); } catch {}
  function validVisitDay(value){
    if(!isoDay.test(value) || value<today())return false;
    const parsed=new Date(value+'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===value;
  }
  function visitDate(){
    return validVisitDay(selectedDay)?selectedDay:today();
  }
  function setVisitDate(value){
    if(!validVisitDay(value))return false;
    selectedDay=value;
    try {localStorage.setItem('park-visit-date',value);} catch {}
    return true;
  }
  function forDay(date) {
    if (!programme || !isoDay.test(date)) return [];
    return [...(programme.byDate[date] ?? programme.daily)].sort((a,b) => a.start.localeCompare(b.start));
  }
  function nextFor(date) {
    const now = new Date();
    const time = date === day.format(now) ? hours.format(now) : '00:00';
    const published = forDay(date).filter(event=>event.status!=='cancelled');
    const ongoing = published.filter(event=>event.start<=time && event.end>time);
    if (ongoing.length) return {events:ongoing, active:true};
    const next = published.find(event=>event.start>=time);
    return {events:next ? published.filter(event=>event.start===next.start) : [], active:false};
  }
  window.parkSchedule = {
    load, visitDate, setVisitDate, today, forDay, nextFor,
    get state() { return state; },
    get edition() { return programme?.verifiedOn; },
  };
})();
