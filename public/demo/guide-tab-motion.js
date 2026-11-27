(() => {
  const entryParam = 'tab-entry';
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

  const url = new URL(location.href);
  const entry = url.searchParams.get(entryParam);
  if (entry !== null) {
    url.searchParams.delete(entryParam);
    history.replaceState(history.state, '', url);
    if (/^[0-3]{2}$/.test(entry) && entry[0] !== entry[1]) {
      enter({href:url.href, from:Number(entry[0]), to:Number(entry[1]), changesDocument:true});
    }
  }

  document.addEventListener('click', event => {
    if (reduce.matches || event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('.slide-tabs > a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const target = new URL(link.href);
    if (target.origin !== location.origin) return;
    const tabs = [...link.parentElement.querySelectorAll(':scope > :is(a,button)')];
    const from = tabs.findIndex(tab => tab.getAttribute('aria-current') === 'page');
    const to = tabs.indexOf(link);
    if (from < 0 || from === to) return;
    clearEntry();
    if (target.pathname === location.pathname && target.search === location.search) {
      enter({href:target.href, from, to, changesDocument:false});
    } else {
      event.preventDefault();
      target.searchParams.set(entryParam, String(from) + to);
      location.assign(target.href);
    }
  });
  document.addEventListener('animationend', event => {
    if (event.animationName === 'guide-tab-enter') clearEntry();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) clearEntry(); });
})();
