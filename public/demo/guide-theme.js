(() => {
  const preference = 'park-guide-theme';
  const root = document.documentElement;
  const browserBar = document.querySelector('meta[name="theme-color"]');
  let toggle;

  function savedTheme() {
    try { return localStorage.getItem(preference); }
    catch { return null; }
  }

  function apply(dark) {
    const changed = root.classList.contains('dark') !== dark;
    root.classList.toggle('dark', dark);
    browserBar?.setAttribute('content', dark ? '#171e1c' : '#ffffff');
    if (toggle) {
      const next = dark ? 'Светлая тема' : 'Тёмная тема';
      toggle.setAttribute('aria-label', next);
      toggle.title = next;
    }
    if (changed) document.dispatchEvent(new Event('park-theme-change'));
  }

  apply(savedTheme() === 'dark');

  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.querySelector('.guide-theme-toggle');
    if (!toggle) return;
    apply(root.classList.contains('dark'));
    toggle.addEventListener('click', () => {
      const dark = !root.classList.contains('dark');
      apply(dark);
      try { localStorage.setItem(preference, dark ? 'dark' : 'light'); } catch {}
    });
  }, {once:true});

  window.addEventListener('storage', event => {
    if (event.key === preference || event.key === null) apply(savedTheme() === 'dark');
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) apply(savedTheme() === 'dark');
  });
})();
