(() => {
  const appPaths = ['index.html', 'map.html'].map(file => new URL(file, location.href).pathname);
  const referrer = document.referrer ? new URL(document.referrer) : null;
  const cameFromGuide = history.length > 1 && referrer?.origin === location.origin && appPaths.includes(referrer.pathname);
  const entryUrl = new URL(location.href);
  const directEntry = entryUrl.searchParams.get('guide-entry') === 'direct';

  function markEntry(canGoBack) {
    if (typeof history.state?.guideBack === 'boolean') return;
    history.replaceState({ ...history.state, guideBack: canGoBack }, '');
  }

  markEntry(!directEntry && cameFromGuide);
  if (directEntry) {
    entryUrl.searchParams.delete('guide-entry');
    history.replaceState(history.state, '', entryUrl);
  }
  window.addEventListener('hashchange', () => markEntry(true));

  window.parkGuideHistory = {
    push(hash, state) {
      history.pushState({ ...state, guideBack: true }, '', hash);
    },
    replaceDocument(url) {
      const target = new URL(url, location.href);
      // A direct QR link can redirect from index.html, which then becomes the referrer.
      if (!history.state?.guideBack) target.searchParams.set('guide-entry', 'direct');
      location.replace(target);
    }
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-guide-back]');
    if (!button || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (history.state?.guideBack) {
      history.back();
    } else if (button instanceof HTMLAnchorElement) {
      location.replace(button.href);
    } else {
      window.conceptReplace(button.dataset.guideBack);
    }
  });
})();
