(() => {
  const storageKey = 'visitor-feeding-programme-v1';
  const day = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Minsk', year:'numeric', month:'2-digit', day:'2-digit'});
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
  try {
    const cached = JSON.parse(localStorage.getItem(storageKey));
    if (valid(cached)) programme = cached;
  } catch {}
  const announce = () => document.dispatchEvent(new Event('parkprogrammechange'));
  function load() {
    if (pending) return pending;
    state = 'loading';
    pending = (async () => {
      try {
        const response = await fetch('feeding-programme.json', {cache:'no-cache'});
        if (!response.ok) throw Error('Programme unavailable');
        const data = await response.json();
        if (!valid(data)) throw Error('Invalid programme');
        programme = data;
        try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
        state = 'ready';
      } catch { state = 'error'; }
      finally { pending = null; announce(); }
    })();
    announce();
    return pending;
  }
  function visitDate() {
    const today = day.format(new Date());
    try {
      const saved = localStorage.getItem('park-visit-date');
      if (isoDay.test(saved) && saved >= today) return saved;
    } catch {}
    return today;
  }
  window.parkSchedule = {
    load, visitDate,
    get state() { return state; },
    get edition() { return programme?.verifiedOn; },
    forDay(date) {
      if (!programme || !isoDay.test(date)) return [];
      // A published dated list replaces the daily programme, including an explicitly empty list.
      return [...(programme.byDate[date] ?? programme.daily)].sort((a,b) => a.start.localeCompare(b.start));
    }
  };
})();
