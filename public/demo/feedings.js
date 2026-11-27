import {calendarReminder, feedingSpecies, monthView, shiftDay, shiftMonth, todayInPark} from './feeding-model.js';
import {parkSchedule as schedule} from './park-schedule.js';

(() => {
  const guide=window.parkGuide;
  const list=document.getElementById('feeding-list'),actions=document.getElementById('feeding-actions');
  const dateButton=document.getElementById('visit-date'),hint=document.getElementById('calendar-hint');
  const remind=document.getElementById('add-reminder');
  const feature=document.getElementById('feeding-feature');
  const cover=feature.querySelector('.feeding-cover-photo');
  const featuredTitle=document.getElementById('feeding-feature-title');
  const featuredStatus=document.getElementById('feeding-feature-status');
  const featuredPlace=document.getElementById('feeding-feature-place');
  const agenda=document.getElementById('feeding-agenda');
  const dateValue=document.getElementById('visit-date-value');
  const status=document.getElementById('schedule-status'),retry=document.getElementById('retry-schedule');
  const shortDate=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});
  const longDate=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const monthLabel=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
  const calendar=document.getElementById('feeding-calendar-dialog');
  const calendarMonth=document.getElementById('feeding-calendar-month');
  const calendarDays=calendar.querySelector('.feeding-calendar-days');
  const previousMonth=calendar.querySelector('.calendar-prev');
  const nextMonth=calendar.querySelector('.calendar-next');
  const timingLabels={
    active:'Сейчас по программе',next:'Ближайшее кормление',first:'Первое кормление дня',scheduled:'По программе',
  };
  const notices={
    empty:'Нет опубликованных событий.',
    missing:'Выбранного кормления нет в программе на эту дату.',
    finished:'На сегодня по программе больше нет кормлений.',
  };
  let selected, renderedToday, month;
  const parseDay=day=>new Date(day+'T00:00:00Z');
  function eventRoute(id){return 'feed/'+id+'/'+schedule.visitDate();}
  function renderDateLabel(day){
    dateButton.dataset.date=day;
    const value=parseDay(day);
    dateValue.textContent=day===renderedToday?'Сегодня, '+shortDate.format(value):longDate.format(value);
  }
  function chooseDate(day){
    if(!schedule.setVisitDate(day))return;
    calendar.close();
    window.conceptReplace(eventRoute('all'));
  }
  function drawMonth(focusDay){
    const view=monthView(focusDay,schedule.today(),schedule.visitDate());
    month=view.value;
    previousMonth.disabled=view.atFirstMonth;
    nextMonth.disabled=view.atLastMonth;
    calendarMonth.textContent=monthLabel.format(parseDay(month));
    calendarDays.replaceChildren();
    for(const {day,number,disabled,focused,selected,today} of view.days){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.day=day;
      button.textContent=number;
      button.disabled=disabled;
      button.tabIndex=focused?0:-1;
      button.setAttribute('aria-label',longDate.format(parseDay(day)));
      button.setAttribute('aria-pressed',String(selected));
      if(today)button.setAttribute('aria-current','date');
      if(number===1)button.style.gridColumnStart=view.firstColumn;
      button.addEventListener('click',()=>chooseDate(day));
      calendarDays.append(button);
    }
  }
  function moveMonth(offset,control){
    drawMonth(shiftMonth(month,offset,schedule.today()));
    if(control.disabled)calendarDays.querySelector('[tabindex="0"]').focus();
  }
  dateButton.addEventListener('click',()=>{
    drawMonth(schedule.visitDate());
    dateButton.focus({preventScroll:true});
    calendar.showModal();
    calendarDays.querySelector('[tabindex="0"]').focus();
  });
  calendar.querySelector('.calendar-close').addEventListener('click',()=>calendar.close());
  calendar.querySelector('.calendar-today').addEventListener('click',()=>chooseDate(schedule.today()));
  previousMonth.addEventListener('click',()=>moveMonth(-1,previousMonth));
  nextMonth.addEventListener('click',()=>moveMonth(1,nextMonth));
  calendar.addEventListener('click',event=>{
    if(event.target!==calendar)return;
    const {left,right,top,bottom}=calendar.getBoundingClientRect();
    if(event.clientX<left || event.clientX>right || event.clientY<top || event.clientY>bottom)calendar.close();
  });
  calendarDays.addEventListener('keydown',event=>{
    const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
    if(!offset || !event.target.dataset.day)return;
    event.preventDefault();
    const targetDay=shiftDay(event.target.dataset.day,offset,schedule.today());
    if(targetDay.slice(0,7)!==event.target.dataset.day.slice(0,7))drawMonth(targetDay);
    calendarDays.querySelector('[tabindex="0"]').tabIndex=-1;
    const target=calendarDays.querySelector('[data-day="'+targetDay+'"]');
    target.tabIndex=0;
    target.focus();
  });
  function photoFor(event,eager=false){
    const slug=feedingSpecies(event);
    const photo=document.createElement('img');
    photo.alt='';
    photo.loading=eager?'eager':'lazy';
    photo.decoding='async';
    photo.hidden=true;
    if(slug)photo.dataset.feedingSpecies=slug;
    photo.addEventListener('error',()=>{photo.hidden=true;});
    return photo;
  }
  function syncPhotos(){
    for(const img of document.querySelectorAll('#feed img[data-feeding-species]')){
      const slug=img.dataset.feedingSpecies;
      const src=guide.speciesPhoto?.(slug) || guide.speciesPortrait(slug);
      if(src && img.getAttribute('src')!==src){
        img.src=src;
        img.hidden=false;
      }
    }
  }
  function placeText(event){
    const place=guide.places.find(p=>p.zone===event.zone&&p.id===event.place);
    if(!place)return '';
    if(place.id==='53')return place.detail || place.name;
    if(/^\d+(?:\.\d+)?$/.test(place.id))return 'Вольер № '+place.id;
    return place.name;
  }
  const hoursFor=event=>event.start+(event.end?'–'+event.end:'');
  function renderFeature(event, timing){
    feature.hidden=!event;
    actions.hidden=!event || event.status==='cancelled';
    hint.textContent='';
    if(!event){delete feature.dataset.event;return;}
    feature.dataset.event=event.id;
    cover.replaceChildren(photoFor(event,true));
    featuredTitle.textContent=event.name;
    featuredStatus.textContent=event.status==='cancelled'?'Кормление отменено':timingLabels[timing]+' · '+hoursFor(event);
    featuredPlace.textContent=[guide.zones[event.zone]?.name,placeText(event)].filter(Boolean).join(' · ');
    actions.querySelector('[data-go]').dataset.go='map/'+event.zone+'/'+event.place;
  }
  function render(eventId){
    const now=new Date();
    renderedToday=todayInPark(now);
    const day=schedule.visitDate();
    renderDateLabel(day);
    const {featured, timing, notice, remaining}=schedule.view(day,eventId,now);
    selected=featured;
    renderFeature(selected,timing);
    const edition=schedule.edition;
    document.getElementById('schedule-edition').textContent=edition?'Снимок программы от '+edition.split('-').reverse().join('.')+'.':'';
    retry.hidden=schedule.state!=='error';
    status.textContent=schedule.state==='error'?(edition?'Не удалось обновить. Показана сохранённая программа.':'Не удалось загрузить программу кормлений.'):
      schedule.state==='loading'&&!edition?'Загружаем программу…':'';
    if(edition && notice)status.textContent+=' '+notices[notice];
    agenda.hidden=!remaining.length;
    const focusedEvent=list.contains(document.activeElement)?document.activeElement.dataset.event:null;
    list.replaceChildren();
    for(const event of remaining){
      const row=document.createElement('div');row.className='feeding-row';
      const select=document.createElement('button');select.className='feeding-choice';
      select.type='button';
      select.dataset.event=event.id;
      const slot=document.createElement('span');
      const time=document.createElement('time');time.dateTime=event.start;time.textContent=event.start;
      slot.className='feeding-slot';
      slot.append(time);
      if(event.end){
        const end=document.createElement('small');
        end.textContent='до '+event.end;slot.append(end);
      }
      const media=document.createElement('span');
      media.className='feeding-thumbnail';
      media.append(photoFor(event));
      const text=document.createElement('span'),title=document.createElement('strong'),place=document.createElement('small');
      title.textContent=event.name;
      place.textContent=event.status==='cancelled'?'Кормление отменено':placeText(event);
      text.append(title,place);select.append(slot,media,text);row.append(select);
      select.onclick=()=>{
        window.conceptReplace(eventRoute(event.id));
        featuredTitle.focus({preventScroll:true});
        feature.scrollIntoView({block:'start'});
      };
      list.append(row);
      if(event.id===focusedEvent)select.focus({preventScroll:true});
    }
    syncPhotos();
  }
  function refreshView(){render(location.hash.split('/')[1]);}
  retry.onclick=()=>schedule.load();
  remind.onclick=()=>{
    if(!selected||selected.status==='cancelled')return;
    const day=dateButton.dataset.date;
    const location=guide.zones[selected.zone].name+' · '+placeText(selected);
    const reminder=calendarReminder(selected,day,location,new Date());
    const url=URL.createObjectURL(new Blob([reminder],{type:'text/calendar;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=selected.id+'-'+day+'.ics';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    hint.textContent='Откройте файл в календаре телефона и сохраните событие.';
  };
  function showScreen(screen){
    if(screen!=='feed'){
      if(calendar.open)calendar.close();
      return;
    }
    // A date in a shared event link takes precedence over an earlier visit.
    const requested=location.hash.split('/')[2];
    if(requested && !schedule.setVisitDate(requested)){
      window.conceptReplace(eventRoute('all'));
      return;
    }
    if(schedule.state==='idle')schedule.load({refresh:false});
    refreshView();
  }
  document.addEventListener('conceptscreen',event=>showScreen(event.detail));
  document.addEventListener('parkcatalogready',syncPhotos);
  schedule.subscribe(()=>{if(document.getElementById('feed').classList.contains('current'))refreshView();});
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && window.parkGuideData.current===null && document.getElementById('feed').classList.contains('current')){
      schedule.load({refresh:false});
    }
  });
  setInterval(()=>{
    if(document.hidden || !document.getElementById('feed').classList.contains('current'))return;
    if(renderedToday!==schedule.today() || !document.getElementById('feed').contains(document.activeElement))refreshView();
  },60000);
  showScreen(document.querySelector('main > .screen.current')?.id);
})();
