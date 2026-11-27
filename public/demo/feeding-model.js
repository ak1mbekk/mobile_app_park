const parkDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone:'Europe/Minsk', year:'numeric', month:'2-digit', day:'2-digit',
});
const parkTime = new Intl.DateTimeFormat('en-GB', {
  timeZone:'Europe/Minsk', hour:'2-digit', minute:'2-digit',
});
const lastDay = '9999-12-31';
const parseDay = day => new Date(day+'T00:00:00Z');
const isoDay = value => value.toISOString().slice(0,10);

export const todayInPark = now => parkDay.format(now);

export function isCalendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDay(value);
  return Number.isFinite(parsed.getTime()) && isoDay(parsed) === value;
}

export function eventsForDay(programme, day) {
  if (!programme || !isCalendarDay(day)) return [];
  return [...(programme.byDate[day] ?? programme.daily)].sort((a,b) => a.start.localeCompare(b.start));
}

export function nextFeeding(events, day, now) {
  const time = day === todayInPark(now) ? parkTime.format(now) : '00:00';
  const published = events.filter(event => event.status !== 'cancelled');
  const ongoing = published.filter(event => event.start <= time && event.end > time);
  if (ongoing.length) return {events:ongoing, active:true};
  const next = published.find(event => event.start >= time);
  return {events:next ? published.filter(event => event.start === next.start) : [], active:false};
}

export function feedingView(programme, day, eventId, now) {
  const events = eventsForDay(programme, day);
  const {events:upcoming, active} = nextFeeding(events, day, now);
  const explicit = eventId && eventId !== 'all' && eventId !== 'none';
  const featured = explicit ? events.find(event => event.id === eventId)
    : upcoming[0] || events.findLast(event => event.status !== 'cancelled') || events[0];
  const today = day === todayInPark(now);
  const timing = featured && upcoming.includes(featured)
    ? (active ? 'active' : today ? 'next' : 'first')
    : 'scheduled';
  let notice;
  if (!events.length) notice = 'empty';
  else if (explicit && !featured) notice = 'missing';
  else if (today && !explicit && !upcoming.length && events.some(event => event.status !== 'cancelled')) notice = 'finished';
  return {featured, timing, notice, remaining:events.filter(event => event !== featured)};
}

export function monthView(focusDay, today, visitDay) {
  const focus = parseDay(focusDay);
  const year = focus.getUTCFullYear(), month = focus.getUTCMonth();
  const start = new Date(Date.UTC(year,month,1));
  const length = new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const value = isoDay(start);
  const days = Array.from({length}, (_,index) => {
    const number = index+1;
    const day = isoDay(new Date(Date.UTC(year,month,number)));
    return {day, number, disabled:day<today, focused:day===focusDay, selected:day===visitDay, today:day===today};
  });
  return {
    value, days, firstColumn:(start.getUTCDay()+6)%7+1,
    atFirstMonth:value.slice(0,7)===today.slice(0,7),
    atLastMonth:value.slice(0,7)===lastDay.slice(0,7),
  };
}

export function shiftMonth(day, offset, today) {
  const value = parseDay(day);
  const target = new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+offset,1));
  const shifted = target.getUTCFullYear() > 9999 ? lastDay : isoDay(target);
  return shifted < today ? today : shifted;
}

export function shiftDay(day, offset, today) {
  const value = parseDay(day);
  value.setUTCDate(value.getUTCDate()+offset);
  const shifted = value.getUTCFullYear() > 9999 ? lastDay : isoDay(value);
  return shifted < today ? today : shifted;
}

export function feedingSpecies(event) {
  // Older publications used arrays. Local backups can omit the species for group events.
  const slug = Array.isArray(event.species) ? event.species.find(value => typeof value === 'string' && value) : event.species;
  if (typeof slug === 'string' && slug) return slug;
  return {'1/53/exotic':'kinkazhu', '1/lake49/storks':'belyij-aist'}[event.zone+'/'+event.place+'/'+event.id];
}

export function calendarReminder(event, day, location, now) {
  const stamp = date => new Date(date).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const eventTime = time => stamp(day+'T'+time+':00+03:00');
  const escape = text => text.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/([,;])/g,'\\$1');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Animal Park//Visitor//RU','BEGIN:VEVENT',
    'UID:'+event.id+'-'+day+'@animal-park.by','DTSTAMP:'+stamp(now),'DTSTART:'+eventTime(event.start)];
  if(event.end) lines.push('DTEND:'+eventTime(event.end));
  lines.push('SUMMARY:Кормление · '+escape(event.name),'LOCATION:'+escape(location),
    'BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY','DESCRIPTION:Кормление через 30 минут','END:VALARM','END:VEVENT','END:VCALENDAR');
  return lines.join('\r\n')+'\r\n';
}
