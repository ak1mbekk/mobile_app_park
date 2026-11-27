(() => {
  const key = 'park-tab-entry';
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function clearEntry() {
    delete root.dataset.tabEntering;
    delete root.dataset.tabDirection;
    delete root.dataset.tabCrossing;
    root.style.removeProperty('--tab-from');
    root.style.removeProperty('--tab-to');
  }

  function enter({href, from, to, changesDocument}) {
    if (reduce.matches) return;
    const screen = new URL(href).hash.slice(1).split('/')[0];
    root.dataset.tabDirection = to < from ? 'back' : 'forward';
    root.dataset.tabEntering = screen;
    if (changesDocument) {
      root.dataset.tabCrossing = '';
      root.style.setProperty('--tab-from',from);
      root.style.setProperty('--tab-to',to);
    }
  }

  try {
    const pending = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    if (pending?.href === location.href && Date.now() - pending.at < 10000) enter(pending);
  } catch { /* The saved entry is optional. */ }

  document.addEventListener('guidetabactivate', ({detail}) => {
    clearEntry();
    if (!detail.changesDocument) enter(detail);
    else {
      try { sessionStorage.setItem(key,JSON.stringify({...detail,at:Date.now()})); } catch {}
    }
  });
  document.addEventListener('animationend', event => {
    if (event.animationName === 'guide-tab-enter') clearEntry();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) clearEntry(); });
})();
