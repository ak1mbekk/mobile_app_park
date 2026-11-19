(() => {
  const {events,places}=window.parkGuide;
  const list=document.getElementById('feeding-list'),actions=document.getElementById('feeding-actions');
  const date=document.getElementById('visit-date'),hint=document.getElementById('calendar-hint');
  const remind=document.getElementById('add-reminder');
  const minskDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'});
  const minskTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'});
  const today=minskDay.format(new Date());
  const next=document.createElement('p');
  next.className='feeding-summary';next.setAttribute('role','status');list.before(next);
  let selected=events[0],savedDate;
  try{savedDate=localStorage.getItem('park-visit-date');}catch{}
  date.min=today;date.value=savedDate>=today?savedDate:today;
  function showNext(){
    const now=new Date();
    date.min=minskDay.format(now);
    next.replaceChildren();
    if(!date.value||!date.validity.valid)return;
    const from=date.value===date.min?minskTime.format(now):'00:00';
    const active=events.filter(event=>event.start<=from && event.end>from);
    const upcoming=active[0]||events.find(event=>event.start>=from);
    if(!upcoming){next.textContent='Следующее начало кормлений — завтра по программе парка.';return;}
    const simultaneous=active.length?active:events.filter(event=>event.start===upcoming.start);
    next.append(active.length?'Сейчас по программе · ':date.value===date.min?'Ближайшее по программе · ':'Начало программы · ');
    const jump=document.createElement('button');jump.className='p-link';
    jump.textContent=upcoming.start+' · '+upcoming.name+(simultaneous.length>1?' и ещё '+(simultaneous.length-1):'');
    jump.onclick=()=>{window.conceptGo('feed/'+upcoming.id);requestAnimationFrame(()=>list.querySelector('[data-event="'+upcoming.id+'"]')?.focus());};
    next.append(jump);
  }
  function placeFor(event){return places.find(p=>p.zone===1&&p.id===event.place);}
  function placeText(event){
    const place=placeFor(event);
    if(event.place==='lake49')return place.name;
    return place.id==='53'?place.detail:'Вольер № '+place.id;
  }
  function render(eventId){
    showNext();
    selected=events.find(event=>event.id===eventId)||events[0];
    hint.textContent='';
    list.replaceChildren();
    for(const event of events){
      const row=document.createElement('div');row.className='feeding-row';
      const select=document.createElement('button');select.className='feeding-choice';
      select.dataset.event=event.id;select.setAttribute('aria-expanded',String(event===selected));
      const time=document.createElement('time');time.dateTime=event.start;time.textContent=event.start;
      const text=document.createElement('span'),title=document.createElement('strong'),place=document.createElement('small');
      title.textContent=event.name;place.textContent=placeText(event)+(event.end?' · до '+event.end:'');
      text.append(title,place);select.append(time,text);row.append(select);
      select.onclick=()=>window.conceptGo('feed/'+event.id);
      if(event===selected){
        row.classList.add('selected');
        actions.querySelector('[data-go]').dataset.go=event.place==='36'?'map':'zone1/'+event.place;
        row.append(actions);
      }
      list.append(row);
    }
  }
  render(events[0].id);
  date.onchange=()=>{
    remind.disabled=!date.value||!date.validity.valid;hint.textContent='';
    showNext();
    if(date.validity.valid)try{localStorage.setItem('park-visit-date',date.value);}catch{}
  };
  remind.onclick=()=>{
    if(!date.value||!date.reportValidity())return;
    const stamp=t=>new Date(t).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const eventTime=t=>stamp(date.value+'T'+t+':00+03:00');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Animal Park//Visitor//RU','BEGIN:VEVENT',
      'UID:'+selected.id+'-'+date.value+'@animal-park.by','DTSTAMP:'+stamp(Date.now()),'DTSTART:'+eventTime(selected.start)];
    if(selected.end)lines.push('DTEND:'+eventTime(selected.end));
    lines.push('SUMMARY:Кормление · '+selected.name,'LOCATION:Казачны мір · '+placeText(selected),
      'BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY','DESCRIPTION:Кормление через 30 минут','END:VALARM','END:VEVENT','END:VCALENDAR');
    const url=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=selected.id+'-'+date.value+'.ics';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    hint.textContent='Откройте файл в календаре телефона и сохраните событие.';
  };
  document.addEventListener('conceptscreen',e=>{
    if(e.detail==='feed')render(location.hash.split('/')[1]||selected.id);
  });
})();
