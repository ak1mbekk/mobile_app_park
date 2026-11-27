(() => {
  const stories = window.parkAudioStops;
  const player = document.querySelector('.guide-player');
  const audio = player.querySelector('audio');
  const toggle = player.querySelector('.guide-toggle');
  const toggleIcon = icon('audio-play-icon');
  const toggleGlyph = toggleIcon.firstElementChild;
  toggle.append(toggleIcon);
  const status = player.querySelector('.guide-now span');
  const title = player.querySelector('strong');
  const playbackKey = 'park-guide-playback';
  let current;
  let trigger;
  let resumeAt;
  let playAfterSeek = false;

  function labelControls() {
    const playing = !audio.paused && !audio.ended;
    toggleGlyph.setAttribute('href', playing ? '#audio-pause-icon' : '#audio-play-icon');
    const canResume = !playing && !audio.ended && (resumeAt > 0 || audio.currentTime > 0);
    toggle.setAttribute('aria-label', playing ? 'Пауза' : canResume ? 'Продолжить' : 'Слушать');
    for (const action of document.querySelectorAll('.guide-listen')) {
      const sameStory = action.dataset.story === current?.file;
      const isPlaying = playing && sameStory;
      const label = isPlaying ? 'Пауза' : sameStory && canResume ? 'Продолжить' : 'Слушать';
      action.querySelector('span').textContent = isPlaying ? 'Пауза' : 'Слушать';
      action.querySelector('use').setAttribute('href', isPlaying ? '#audio-pause-icon' : '#audio-play-icon');
      action.setAttribute('aria-label', label + '. ' + action.dataset.title);
    }
  }

  function time(seconds) {
    const s = Math.floor(seconds);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function clock() {
    if (!current || audio.error) return;
    status.textContent = audio.ended ? 'Прослушано' : Number.isFinite(audio.duration)
      ? time(audio.currentTime) + ' / ' + time(audio.duration) : 'Открываем запись…';
  }

  function failure() {
    if (!current) return;
    status.textContent = navigator.onLine
      ? 'Запись не загрузилась. Можно повторить или открыть текст.'
      : 'Подключитесь к интернету';
    labelControls();
  }

  function openRecording(stop) {
    current = stop;
    title.textContent = stop.title;
    player.hidden = false;
    audio.src = window.parkGuideAudio.path(stop);
  }

  function rememberPlayback() {
    try {
      if (!current || audio.ended) sessionStorage.removeItem(playbackKey);
      else sessionStorage.setItem(playbackKey, JSON.stringify({
        file: current.file,
        time: resumeAt ?? audio.currentTime,
        playing: playAfterSeek || !audio.paused,
      }));
    } catch {}
  }

  function restorePlayback() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(playbackKey)); } catch { return; }
    const stop = Object.values(stories).find(story => story.file === saved?.file);
    audio.pause();
    resumeAt = undefined;
    playAfterSeek = false;
    if (!stop || !Number.isFinite(saved.time) || saved.time < 0) {
      current = null;
      player.hidden = true;
      labelControls();
      return;
    }
    resumeAt = saved.time;
    playAfterSeek = saved.playing === true;
    openRecording(stop);
    audio.load();
    labelControls();
    status.textContent = time(saved.time);
  }

  async function listen(stop) {
    if (current === stop && !audio.paused) {
      audio.pause();
      return;
    }
    if (current !== stop || audio.error) {
      if (current !== stop) resumeAt = undefined;
      playAfterSeek = false;
      openRecording(stop);
    }
    if (audio.ended) audio.currentTime = 0;
    clock();
    try { await audio.play(); }
    catch (err) { if (current === stop && err.name !== 'AbortError') failure(); }
  }

  toggle.onclick = () => { if (current) listen(current); };
  player.querySelector('.guide-stop').onclick = () => {
    current = null;
    resumeAt = undefined;
    playAfterSeek = false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    player.hidden = true;
    rememberPlayback();
    labelControls();
    const focusTarget = trigger?.isConnected && trigger.getClientRects().length ? trigger
      : document.querySelector('.map-search-toggle, .z-dock a[aria-current]');
    focusTarget?.focus({preventScroll:true});
  };
  audio.addEventListener('error', failure);
  audio.addEventListener('timeupdate', clock);
  audio.addEventListener('loadedmetadata', () => {
    if (resumeAt !== undefined && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 0.1));
      resumeAt = undefined;
    }
    if (playAfterSeek) {
      playAfterSeek = false;
      audio.play().catch(error => {
        if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') failure();
      });
    }
    labelControls();
    clock();
  });
  for (const name of ['play', 'pause', 'ended']) audio.addEventListener(name, () => { labelControls(); clock(); });
  window.addEventListener('pagehide', rememberPlayback);
  window.addEventListener('pageshow', event => { if (event.persisted) restorePlayback(); });
  restorePlayback();

  function keyForPlace(point) {
    return point.audioStory ?? point.species?.find(key => stories[key]);
  }

  function icon(id) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    const use = document.createElementNS(namespace, 'use');
    svg.classList.add('audio-icon');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', '#' + id);
    svg.append(use);
    return svg;
  }

  function addToCard(storyKeys, card, {mapHref, storyHref, listenHost} = {}) {
    const stop = storyKeys.map(key => stories[key]).find(Boolean);
    if (!stop) return;
    const listenButton = document.createElement('button');
    listenButton.type = 'button';
    listenButton.className = 'guide-listen';
    listenButton.dataset.story = stop.file;
    listenButton.onclick = () => { trigger = listenButton; listen(stop); };
    listenButton.dataset.title = stop.title;
    listenButton.append(icon('audio-play-icon'), document.createElement('span'));
    if (listenHost) {
      listenHost.hidden = false;
      listenHost.append(listenButton);
      card.append(storyTranscript(stop.text));
      labelControls();
      return;
    }
    const panel = document.createElement('div');
    panel.className = 'guide-stop-card guide-directory-stop';
    const name = document.createElement(storyHref ? 'a' : 'strong');
    name.className = 'guide-story-title';
    name.textContent = stop.title;
    if (storyHref) name.href = storyHref;
    panel.append(name);
    if (mapHref) {
      if (stop.photos?.length) {
        const photos = document.createElement('div');
        photos.className = 'guide-story-photos';
        for (const [src, alt, position] of stop.photos) {
          const img = document.createElement('img');
          img.src = src;
          img.alt = alt;
          img.loading = 'lazy';
          img.decoding = 'async';
          if (position) img.style.objectPosition = position;
          photos.append(img);
        }
        panel.append(photos);
      }
      const mapLink = document.createElement('a');
      mapLink.className = 'guide-story-map';
      mapLink.href = mapHref;
      mapLink.addEventListener('click', rememberPlayback);
      mapLink.setAttribute('aria-label', stop.title + ' на карте');
      mapLink.append(icon('atlas-map'), 'На карте');
      const actions = document.createElement('div');
      actions.className = 'guide-story-actions';
      actions.append(listenButton, mapLink);
      panel.append(actions);
    } else {
      panel.append(listenButton);
    }
    if (!storyHref) panel.append(storyTranscript(stop.text));
    card.append(panel);
    labelControls();
  }

  function storyTranscript(text) {
    const transcript = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Текст рассказа';
    transcript.append(summary);
    for (const paragraph of text.split('\n\n')) {
      const p = document.createElement('p');
      p.textContent = paragraph.normalize('NFD').replace(/\u0301/g, '').normalize('NFC');
      transcript.append(p);
    }
    return transcript;
  }
  const capybaraCard = document.getElementById('capybara-audio');
  if (capybaraCard) addToCard(['kapibara'], capybaraCard, {listenHost: document.getElementById('capybara-listen')});
  window.parkAudioGuide = {addToCard, keyForPlace};

  const directory = document.getElementById('audio-directory');
  if (!directory) return;
  const {zones} = window.parkGuide;
  let stops = [];
  window.parkGuideData.ready.then(source => {
    if (source !== false) stops = window.parkGuide.places.filter(point => !point.detail && stories[keyForPlace(point)]);
    if (document.getElementById('audio').classList.contains('current')) renderDirectory();
  });
  const stopPath = point => point.zone + '/' + point.id;
  const search = document.getElementById('audio-search');
  const clear = document.getElementById('audio-search-clear');
  const zoneFilter = document.getElementById('audio-zone-filter');
  const back = document.getElementById('audio-back');
  const heading = document.getElementById('audio-title');
  let activeZone = '';

  function normalize(text) {
    return text.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ');
  }
  for (const [zone, label] of [['', 'Обе зоны'], ...Object.entries(zones).map(([id, info]) => [id, info.name])]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.zone = zone;
    button.setAttribute('aria-controls', directory.id);
    button.addEventListener('click', () => {
      activeZone = zone;
      renderDirectory();
    });
    zoneFilter.append(button);
  }
  search.addEventListener('input', renderDirectory);
  clear.addEventListener('click', () => {
    search.value = '';
    renderDirectory();
    search.focus();
  });

  function matchingStops(zone, query) {
    const matches = new Map();
    for (const point of stops) {
      if (String(point.zone) !== zone) continue;
      const key = keyForPlace(point);
      if (matches.has(key)) continue;
      const stop = stories[key];
      const names = [stop.title, point.name, ...(stop.photos ?? []).map(([, alt]) => alt)];
      const haystack = normalize(names.join(' '));
      if (query.every(word => haystack.includes(word))) matches.set(key, point);
    }
    return [...matches.values()];
  }

  function renderDirectory() {
    const path = location.hash.slice('#audio'.length);
    const selected = path && stops.find(point => path === '/' + stopPath(point) ||
      (point.legacyId && path === '/' + point.zone + '/' + point.legacyId));
    const query = normalize(search.value).split(' ').filter(Boolean);
    heading.textContent = selected ? stories[keyForPlace(selected)].title : 'Аудиогид';
    back.dataset.guideBack = path ? 'audio' : 'park';
    document.getElementById('audio-controls').hidden = Boolean(selected);
    document.getElementById('audio-missing').hidden = !path || Boolean(selected);
    directory.classList.toggle('guide-single', Boolean(selected));
    clear.hidden = !search.value;
    for (const button of zoneFilter.children) button.setAttribute('aria-pressed', String(button.dataset.zone === activeZone));
    directory.replaceChildren();
    for (const [zone, info] of Object.entries(zones)) {
      if (selected ? String(selected.zone) !== zone : activeZone && activeZone !== zone) continue;
      const zoneStops = selected ? [selected] : matchingStops(zone, query);
      if (!zoneStops.length) continue;
      const group = document.createElement('section');
      group.className = 'guide-zone';
      group.dataset.zone = zone;
      const heading = document.createElement('h2');
      heading.textContent = info.name;
      const cards = document.createElement('div');
      cards.className = 'guide-cards';
      group.append(heading, cards);
      for (const point of zoneStops) {
        const key = keyForPlace(point);
        const route = stopPath(point);
        addToCard([key], cards, {
          mapHref: 'map.html#map/' + route,
          storyHref: selected ? undefined : '#audio/' + route,
        });
      }
      directory.append(group);
    }
    document.getElementById('audio-empty').hidden = directory.childElementCount > 0;
    labelControls();
  }

  document.addEventListener('conceptscreen', event => {
    if (event.detail === 'audio') renderDirectory();
  });
})();
