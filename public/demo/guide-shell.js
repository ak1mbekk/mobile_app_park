(() => {
  const find = id => document.getElementById(id);
  const drawer = find('guide-drawer'), trigger = find('guide-burger');
  const header = find('guide-header'), footer = find('guide-nav');
  const buttonHome = trigger.parentElement;
  const NS = 'http://www.w3.org/2000/svg';
  const paths = {
    home: 'M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3z',
    ticket: 'm3 7 16-4 2 8a2.5 2.5 0 0 0 1 5l.2 1-17 4-.8-3a2.5 2.5 0 0 0-1.2-5L2 8z M14 6l.5 2m.6 2.4.6 2.4m.6 2.4.5 2',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-2a8 6 0 0 1 16 0v2z',
    bell: 'M6 10a6 6 0 1 1 12 0c0 4 1 6 2 7H4c1-1 2-3 2-7z M10 20a2.5 2.5 0 0 0 4 0 M12 2v2',
    tour: 'M3 12 6 5h3l1 8m4 0 1-8h3l3 7M10 14h4M9 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm14 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
    route: 'M6 20a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm12-10s-4-4-4-6a4 4 0 1 1 8 0c0 2-4 6-4 6z M9 17h6a3 3 0 0 0 0-6h-3',
    info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M12 11v6m0-10v.2',
    growth: 'M3 20v-6h4v6z M10 20V9h4v11z M17 20V4h4v16z',
    cup: 'M7 3h10v6a5 5 0 0 1-10 0z M7 5H3v2a5 5 0 0 0 5 5m9-7h4v2a5 5 0 0 1-5 5m-4 2v5m-4 2h8',
    settings: 'm10 3 .5-1h3l.5 2 2 .8 2-.6 2 2-.6 2 .9 2 1.7.8v3l-1.7.6-.9 2 .6 2-2 2-2-.7-2 .9-.6 1.6h-3l-.6-1.6-2-.9-2 .7-2-2 .7-2-.9-2-1.6-.6v-3l1.6-.8.9-2-.7-2 2-2 2 .6 2-.8z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  };
  const defs = document.querySelector('main svg defs');
  for (const [id,d] of Object.entries(paths)) {
    const symbol = document.createElementNS(NS, 'symbol'), path = document.createElementNS(NS,'path');
    symbol.id = 'guide-' + id;
    symbol.setAttribute('viewBox','0 0 24 24'); path.setAttribute('d',d);
    symbol.append(path); defs.append(symbol);
  }
  const ticketUrl = 'https://animal-park.by/tickets/stranicza-biletov.html?clear_date=1';
  const primary = [
    ['Главная','park','guide-home'], ['Купить билеты',ticketUrl,'guide-ticket'],
    ['Животные','animals','aki-paw'], ['Экскурсии','tours','guide-tour'],
    ['Карта парка','map','guide-pin'], ['Как доехать','directions','guide-route'],
    ['Для посетителей','visitor','guide-info'],
  ];
  const game = [['Игра с Ричи','richi','aki-controller'],['Мой прогресс','richi/progress','guide-growth'],['Награды','pass','guide-cup']];
  function item(label, route, icon) {
    const profile = route === 'profile';
    const el = document.createElement(profile ? 'button' : 'a');
    if (profile) { el.type = 'button'; el.dataset.profile = ''; el.setAttribute('aria-haspopup','dialog'); }
    else if (route === ticketUrl) { el.href = route; el.target = '_blank'; el.rel = 'noopener'; }
    else { el.href = '#' + route; el.dataset.go = route; }
    const svg = document.createElementNS(NS,'svg'), use = document.createElementNS(NS,'use');
    svg.setAttribute('class','ic'); svg.setAttribute('aria-hidden','true');
    use.setAttribute('href','#' + icon); svg.append(use);
    const span = document.createElement('span'); span.textContent = label;
    el.append(svg,span);
    return el;
  }
  for (const [label, entries] of [['Посетителям',primary],['Игра',game]]) {
    const group = document.createElement('ul'); group.setAttribute('aria-label',label);
    for (const entry of entries) { const li = document.createElement('li'); li.append(item(...entry)); group.append(li); }
    find('drawer-links').append(group);
  }
  for (const entry of [primary[0],primary[2],['Билеты',ticketUrl,'guide-ticket'],['Карта','map','guide-pin'],['Профиль','profile','guide-user']]) footer.append(item(...entry));
  const closeSlot = find('drawer-close-slot');
  let focusDestination = false;
  function toggle(open) {
    if (open === drawer.open) return;
    if (open) {
      closeSlot.append(trigger); drawer.showModal();
      document.body.classList.add('menu-open'); trigger.focus({preventScroll:true});
    } else {
      drawer.close(); buttonHome.append(trigger);
      document.body.classList.remove('menu-open'); trigger.focus({preventScroll:true});
    }
    trigger.setAttribute('aria-expanded',String(open));
    trigger.setAttribute('aria-label',open ? 'Закрыть меню' : 'Открыть меню');
  }
  trigger.onclick = () => toggle(!drawer.open);
  drawer.addEventListener('cancel',event=>{ event.preventDefault(); toggle(false); });
  drawer.addEventListener('keydown',event=>{
    if (event.key !== 'Tab') return;
    const stops = [...drawer.querySelectorAll('a[href],button:not([disabled]),summary')].filter(el=>el.checkVisibility());
    const first = stops[0], last = stops.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  drawer.addEventListener('click',event=>{
    const link = event.target.closest('a');
    if (link) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      focusDestination = Boolean(link.dataset.go);
      toggle(false);
    }
    else if (event.target === drawer) {
      const box = drawer.getBoundingClientRect();
      if(event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) toggle(false);
    }
  });
  document.addEventListener('conceptscreen',event=>{
    toggle(false);
    const screen = event.detail;
    const guide = document.getElementById(screen)?.classList.contains('visitor-screen');
    const full = guide && screen !== 'map' && !document.documentElement.classList.contains('guide-embed');
    document.body.classList.toggle('in-guide',!!full);
    header.hidden = !full || screen !== 'park';
    find('richi-header').hidden = !full || screen !== 'richi';
    footer.hidden = !full;
    const current = location.hash.slice(1) || 'park';
    if (screen === 'richi') {
      const back = find('richi-header').querySelector('.p-back');
      const progress = current === 'richi/progress';
      back.dataset.go = progress ? 'richi' : 'park';
      back.href = '#' + back.dataset.go;
      back.setAttribute('aria-label',progress ? 'Назад · Игра с Ричи' : 'Назад · Главная');
    }
    if (focusDestination) {
      focusDestination = false;
      const target = find(screen)?.querySelector('h1,h2') || find(screen);
      if (target && !target.contains(document.activeElement)) {
        target.setAttribute('tabindex','-1');
        target.focus({preventScroll:true});
      }
    }
    for(const link of document.querySelectorAll('#drawer-links [data-go],#guide-nav [data-go]')){
      const active = link.dataset.go === current || (link.dataset.go === 'animals' && ['species','animal'].includes(screen));
      if(active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    }
  });
  function syncKeyboard() {
    const viewport = window.visualViewport;
    const editing = document.activeElement?.matches('input:not([type=button]),textarea,[contenteditable=true]');
    document.body.classList.toggle('keyboard-open', Boolean(editing && viewport && innerHeight - viewport.height > 120));
  }
  window.visualViewport?.addEventListener('resize',syncKeyboard);
  document.addEventListener('focusin',syncKeyboard);
  document.addEventListener('focusout',() => queueMicrotask(syncKeyboard));
})();
