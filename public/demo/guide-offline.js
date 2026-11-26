(() => {
  const button = document.getElementById('save-guide');
  const status = document.getElementById('offline-guide-status');
  const iconButton = button.classList.contains('audio-save');
  const downloadLimit = 12000;
  const retryDelay = 20000;
  const {cacheName, previousCacheName} = window.parkGuideAudio;
  const base = new URL('./', document.baseURI);
  const connection = navigator.connection;
  const labels = {
    saving: 'Сохраняем путеводитель…',
    offline: 'Нет интернета. Доступны сохранённые данные',
    weak: 'Слабая связь.',
  };
  const indicator = document.createElement('div');
  indicator.className = 'guide-sync-status';
  indicator.setAttribute('role', 'status');
  indicator.hidden = true;
  const message = document.createElement('span');
  indicator.append(message);
  const mapHeader = document.querySelector('.visitor-map-head');
  (mapHeader || document.body).append(indicator);

  let currentRequest;
  let currentJob;
  let retry;
  let saved = false;
  let explicitSave = false;

  function report(state) {
    indicator.dataset.state = state;
    indicator.hidden = !labels[state];
    message.textContent = labels[state] || '';
  }

  function markSaved() {
    saved = true;
    status.dataset.state = 'saved';
    status.textContent = 'Путеводитель сохранён для этого браузера.';
    if (iconButton) {
      button.dataset.state = 'saved';
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('aria-label', 'Сохранено для прогулки');
      button.title = 'Сохранено для прогулки';
    } else {
      button.hidden = true;
    }
  }

  function weakConnection() {
    return ['slow-2g', '2g'].includes(connection?.effectiveType);
  }

  function stopRequest() {
    currentRequest?.abort();
    clearTimeout(retry);
  }

  function queue() {
    const zoneFromRoute = /^#(?:audio|map)\/([12])(?:\/|$)/.exec(location.hash)?.[1];
    const zoneFromFilter = document.querySelector('#audio-zone-filter [aria-pressed="true"]')?.dataset.zone;
    const zone = zoneFromRoute || zoneFromFilter || '1';
    return window.parkGuideAudio.queue(zone).map(path => new URL(path, base).href);
  }

  async function readSavedAudio(url) {
    return await caches.match(url, {cacheName})
      ?? await caches.match(url, {cacheName:previousCacheName, ignoreSearch:true});
  }

  async function restoreSavedState() {
    const registration = await navigator.serviceWorker.getRegistration(base);
    if (!registration?.active) return;
    const pages = ['index.html','map.html'].map(file => caches.match(new URL(file, base)));
    const recordings = queue().map(readSavedAudio);
    const savedFiles = await Promise.all([...pages, ...recordings]);
    if (savedFiles.every(Boolean)) markSaved();
  }

  async function waitForShell() {
    const registration = await navigator.serviceWorker.register('guide-worker.js');
    const worker = registration.installing || registration.waiting || registration.active;
    if (!worker) throw new Error('Offline worker unavailable');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new DOMException('Slow guide download', 'TimeoutError')), 30000);
      function done(error) {
        clearTimeout(timer);
        worker.removeEventListener('statechange', changed);
        if (error) reject(error);
        else resolve();
      }
      function changed() {
        if (worker.state === 'activated') done();
        if (worker.state === 'redundant') done(new Error('Guide download failed'));
      }
      worker.addEventListener('statechange', changed);
      changed();
    });
  }

  async function downloadTrack(url, cache) {
    const controller = new AbortController();
    currentRequest = controller;
    const timer = setTimeout(() => controller.abort(), downloadLimit);
    try {
      const response = await fetch(url, {cache:'no-store', signal:controller.signal});
      if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) {
        throw new Error('Recording unavailable');
      }
      const bytes = await response.arrayBuffer();
      const length = Number(response.headers.get('content-length'));
      if (!bytes.byteLength || (!response.headers.has('content-encoding') && length && length !== bytes.byteLength)) {
        throw new Error('Incomplete recording');
      }
      await cache.put(url, new Response(bytes, {headers:{'Content-Type':'audio/mpeg'}}));
    } finally {
      clearTimeout(timer);
      currentRequest = undefined;
    }
  }

  async function saveRecordings() {
    const cache = await caches.open(cacheName);
    for (const url of queue()) {
      if (await readSavedAudio(url)) continue;
      if (!navigator.onLine || weakConnection()) throw new DOMException('Connection unavailable', 'AbortError');
      await downloadTrack(url, cache);
    }
  }

  async function saveForWalk() {
    report('saving');
    if (!explicitSave) status.textContent = '';
    button.dataset.state = 'saving';
    const results = await Promise.allSettled([saveRecordings(), waitForShell()]);
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    markSaved();
  }

  function showFailure(error) {
    delete button.dataset.state;
    if (!navigator.onLine) report('offline');
    else if (weakConnection() || ['AbortError','TimeoutError'].includes(error.name)) report('weak');
    else {
      report('');
      if (explicitSave) {
        status.dataset.state = 'error';
        status.textContent = 'Не удалось сохранить путеводитель. Попробуйте ещё раз.';
      }
    }
  }

  function start({manual = false} = {}) {
    if (manual) explicitSave = true;
    clearTimeout(retry);
    if (!navigator.onLine) { report('offline'); return; }
    if (saved) { report(''); return; }
    if (currentJob || (document.hidden && !manual)) return;
    if (weakConnection()) {
      report('weak');
      retry = setTimeout(start, retryDelay);
      return;
    }
    currentJob = saveForWalk().then(() => report(navigator.onLine ? '' : 'offline'), showFailure).finally(() => {
      currentJob = undefined;
      if (!saved && navigator.onLine) retry = setTimeout(start, retryDelay);
    });
  }

  window.addEventListener('offline', () => { stopRequest(); report('offline'); });
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) {
    button.hidden = true;
    window.addEventListener('online', () => report(''));
    if (!navigator.onLine) report('offline');
    return;
  }

  button.onclick = () => start({manual:true});
  window.addEventListener('online', () => {
    if (currentJob) currentJob.then(() => start());
    else start();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  connection?.addEventListener('change', () => {
    if (weakConnection() && !saved) { stopRequest(); report('weak'); }
    start();
  });
  window.addEventListener('load', () => {
    restoreSavedState().catch(() => {}).finally(() => start());
    if (navigator.onLine) navigator.serviceWorker.getRegistration(base)
      .then(registration => registration?.update()).catch(() => {});
  }, {once:true});
  if (!navigator.onLine) report('offline');
})();
