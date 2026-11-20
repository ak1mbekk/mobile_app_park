// Keep the live Godot room while the player visits another tab.
(() => {
  const open = document.querySelector('#open3d');
  const offer = document.querySelector('#offer-apple');
  const container = document.querySelector('#scene3d');
  const loading = document.querySelector('#loading3d');
  const caption = document.querySelector('#opening-caption');
  const progress = document.querySelector('#opening-progress');
  const close = document.querySelector('#close3d');
  const preference = new URLSearchParams(location.search).get('view');
  let frame, room, timeout;
  let progressObserver;
  let ready = false;
  let available;
  let pauseCallback, scenePaused;
  let lighter = false;
  let offerOnLoad = false;
  const coveredControls = new Set();
  try { lighter = sessionStorage.getItem('park-light-meeting') === '1'; } catch {}

  function coverRoom(element) {
    for (const child of coveredControls) child.inert = false;
    coveredControls.clear();
    for (const child of element?.children ?? []) {
      if (child === container || child.inert || child.tagName === 'SCRIPT') continue;
      child.inert = true;
      coveredControls.add(child);
    }
  }

  function setScenePaused(paused) {
    const callback = frame?.contentWindow?.setParkScenePaused;
    if (typeof callback !== 'function' || (callback === pauseCallback && scenePaused === paused)) return;
    callback(paused);
    pauseCallback = callback;
    scenePaused = paused;
  }

  function syncPause() {
    setScenePaused(document.hidden || !room?.classList.contains('current'));
    const naming = ready && room?.id === 'intro' && document.querySelector('#name.current') !== null;
    document.getElementById('intro').toggleAttribute('data-naming-backdrop', naming);
    document.getElementById('intro').inert = naming;
  }

  function storeRound(game, round) {
    if (!['pairs','match','orchard'].includes(game)) return;
    const previous = window.petDemo.stats()[game];
    if (previous && round && previous.id === round.id &&
        Number.isSafeInteger(round.revision) && previous.revision >= round.revision) return;
    window.petDemo.storeGame(game, round, true);
  }

  function checkpointNavigation(forReload = false) {
    if (!ready || room?.id !== 'home' || !frame?.contentWindow?.getParkNavigationState) return;
    setScenePaused(true);
    const output = {};
    frame.contentWindow.getParkNavigationState(output);
    let snapshot;
    try { snapshot = JSON.parse(output.result); } catch { return; }
    if (!snapshot || !['main','kitchen','bathroom'].includes(snapshot.location)) return;
    const { round, ...navigation } = snapshot;
    storeRound(navigation.game, round);
    const idleVeranda = navigation.location === 'main' && navigation.mode === 'home' && navigation.game === null;
    const nativeReturn = forReload && idleVeranda ? null : navigation;
    try { history.replaceState({ ...history.state, nativeReturn }, ''); } catch {}
    return nativeReturn;
  }

  function takeNavigation() {
    const { nativeReturn, ...state } = history.state ?? {};
    if (!nativeReturn) return {};
    history.replaceState(state, '');
    return { navigation:nativeReturn };
  }

  function syncHome(extra = {}) {
    if (room?.id !== 'home' || !ready || !room.classList.contains('current')) return;
    const {name, hat, night, level, leaves, ball, pairs, match, orchard, food, clean, energy, joy} = window.petDemo.stats();
    frame.contentWindow.setParkHomeState?.(JSON.stringify({
      name, night, level, leaves, ball, hat:window.petDemo.outfit() ?? hat ?? '',
      furniture:window.petDemo.furniture(), shop:window.petDemo.nativeShop(), bed_goal:window.petDemo.bedGoal(),
      rounds:{pairs, match, orchard}, needs:{food, clean, energy, joy}, ...extra
    }));
  }

  function leave() {
    document.body.removeAttribute('data-game-overlay');
    clearTimeout(timeout);
    progressObserver?.disconnect();
    frame?.remove();
    frame = null;
    ready = false;
    pauseCallback = undefined;
    scenePaused = undefined;
    offerOnLoad = false;
    container.hidden = true;
    coverRoom(null);
    if (room?.classList.contains('current')) {
      document.querySelector(room.id === 'intro' ? '#apple-hotspot' : '#aki-feed')?.focus({preventScroll:true});
    }
    room = null;
    syncPause();
  }

  function enter(scene, offerApple = false) {
    if (frame) return;
    room = document.getElementById(scene);
    room.append(container);
    container.hidden = false;
    coverRoom(room);
    ready = false;
    offerOnLoad = offerApple;
    close.hidden = false;
    close.textContent = 'Лёгкая версия';
    loading.removeAttribute('data-finished');
    loading.removeAttribute('aria-hidden');
    caption.textContent = 'Загружаем домик…';
    progress.hidden = false;
    progress.removeAttribute('value');
    frame = document.createElement('iframe');
    frame.inert = true;
    frame.title = scene === 'intro' ? 'Первая встреча с Ричи в 3D' : 'Домик у тропы в 3D';
    const roomUrl = new URL('meeting3d/index.html', document.baseURI);
    roomUrl.searchParams.set('host', 'animal-park');
    roomUrl.searchParams.set('scene', scene);
    const nextFrame = frame;
    const showLoadFailure = () => {
      if (frame !== nextFrame || ready) return;
      clearTimeout(timeout);
      progressObserver?.disconnect();
      progress.hidden = true;
      caption.textContent = 'Не удалось загрузить 3D. Можно продолжить в лёгкой версии.';
    };
    nextFrame.addEventListener('error', showLoadFailure, {once:true});
    nextFrame.addEventListener('load', () => {
      if (frame !== nextFrame || ready) return;
      const engineProgress = nextFrame.contentDocument?.getElementById('status-progress');
      const notice = nextFrame.contentDocument?.getElementById('status-notice');
      if (!engineProgress) { showLoadFailure(); return; }
      const update = () => {
        if (notice?.textContent.trim()) { showLoadFailure(); return; }
        if (engineProgress.hasAttribute('value') && engineProgress.max > 0) {
          progress.max = engineProgress.max;
          progress.value = engineProgress.value;
          if (progress.value === progress.max) caption.textContent = 'Открываем домик…';
        } else {
          progress.removeAttribute('value');
        }
      };
      progressObserver = new MutationObserver(update);
      progressObserver.observe(engineProgress, {attributes:true, attributeFilter:['value','max']});
      if (notice) progressObserver.observe(notice, {childList:true, subtree:true, characterData:true});
      update();
    }, {once:true});
    frame.src = roomUrl.href;
    container.prepend(frame);
    timeout = setTimeout(() => {
      caption.textContent = 'Загрузка занимает больше времени. Можно перейти в лёгкую версию.';
    }, 30000);
  }

  function shouldStart3d() {
    if (lighter || preference === '2d' || navigator.onLine === false) return false;
    return preference === '3d' ||
      !(navigator.connection?.saveData || ['slow-2g','2g','3g'].includes(navigator.connection?.effectiveType));
  }

  function startCurrentRoom() {
    const current = document.querySelector('#intro.current,#home.current');
    if (!current || frame || document.hidden) return;
    if (available === undefined) {
      available = supports3d();
      updateEngineOptions();
    }
    if (available && shouldStart3d() && (current.id !== 'home' || window.petDemo.stats().onboardingDone)) enter(current.id);
  }

  function showOpeningWhileRoomDecodes() {
    const current = document.querySelector('#intro.current,#home.current');
    if (!current || frame) return;
    const background = getComputedStyle(current, '::before').backgroundImage;
    const imageUrl = /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1];
    if (!imageUrl) return;
    current.append(container);
    container.hidden = false;
    coverRoom(current);
    close.hidden = true;
    const art = new Image();
    art.src = imageUrl;
    const showRoom = () => {
      if (!frame) { container.hidden = true; coverRoom(null); }
    };
    art.decode().then(showRoom, showRoom);
  }

  function moveToHome() {
    const home = document.getElementById('home');
    if (room?.id !== 'intro' || !home.classList.contains('current') || !window.petDemo.stats().onboardingDone) return;
    if (typeof home.moveBefore === 'function' && frame.contentWindow?.setParkEnterHome) {
      home.moveBefore(container,null);
      if (frame.contentWindow?.setParkEnterHome) {
        room = home;
        coverRoom(home);
        ready = false;
        frame.title = 'Домик у тропы в 3D';
        close.hidden = true;
        frame.contentWindow.setParkEnterHome();
        return;
      }
    }
    leave();
    startCurrentRoom();
  }

  function supports3d() {
    if (!window.isSecureContext || location.protocol === 'file:' || preference === '2d') return false;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return Boolean(gl);
    } catch {
      return false;
    }
  }

  function updateEngineOptions() {
    open.hidden = offer.hidden = !available || navigator.onLine === false;
  }

  open.onclick = () => enter('intro');
  offer.onclick = () => {
    const pet = window.petDemo.stats();
    if (!pet.onboardingDone || pet.night) return;
    document.querySelector('#aki-pantry').hidden = true;
    enter('home', true);
  };
  close.onclick = () => {
    lighter = true;
    try { sessionStorage.setItem('park-light-meeting', '1'); } catch {}
    leave();
  };

  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
    if (event.data === (room.id === 'intro' ? 'animal-park:scene-ready' : 'animal-park:home-ready')) {
      const readyFrame = frame;
      clearTimeout(timeout);
      if (room.id === 'home') await window.petDemo.recoverNativeRound();
      if (frame !== readyFrame) return;
      const resume = room.id === 'home' ? takeNavigation() : {};
      ready = true;
      frame.inert = false;
      progressObserver?.disconnect();
      loading.setAttribute('data-finished','');
      loading.setAttribute('aria-hidden','true');
      close.hidden = room.id === 'home';
      syncHome({offer_apple:offerOnLoad, ...resume});
      offerOnLoad = false;
      syncPause();
      if (room.classList.contains('current')) frame.focus();
      return;
    }
    if (!ready) return;
    if (event.data === 'animal-park:meal-finished') {
      if (room.id === 'intro') {
        window.petDemo.finishMeeting();
      } else window.petDemo.finishAppleSnack();
    }
    if (room?.id !== 'home') return;
    if(event.data==='animal-park:overlay-open'||event.data==='animal-park:overlay-closed'){
      document.body.toggleAttribute('data-game-overlay',event.data==='animal-park:overlay-open');
      return;
    }
    if (event.data === 'animal-park:wash-finished') window.petDemo.wash();
    if (event.data === 'animal-park:sleep' || event.data === 'animal-park:wake') {
      const refusal = window.petDemo.setResting(event.data === 'animal-park:sleep');
      if (refusal) syncHome({refusal});
    }
    if (event.data === 'animal-park:games' || event.data === 'animal-park:games:starter') {
      const starter = event.data === 'animal-park:games:starter';
      if (frame.contentWindow.parkNativeGameRoom) {
        const reason = window.petDemo.playBlock();
        syncHome(reason ? {refusal:reason.replace('Ричи',window.petDemo.stats().name)} : {open_games:true,game:starter?'pairs':''});
      } else window.conceptGo(starter?'game':'chest');
    }
    if (event.data === 'animal-park:buy-ball' && room.classList.contains('current')) {
      const refusal = window.petDemo.buyBall();
      if (refusal) syncHome({refusal});
    }
    if (event.data === 'animal-park:shop') {
      if (frame.contentWindow.parkNativeShop) {
        window.petDemo.nativeShopClear();
        syncHome({open_shop:true});
      } else window.petDemo.openShop();
    }
    if (event.data === 'animal-park:park' && room.classList.contains('current')) {
      document.querySelector('.park-entrance').click();
    }
    if (event.data === 'animal-park:profile') document.querySelector('#park [data-profile]')?.click();
    if (event.data === 'animal-park:shop:closed' || event.data === 'animal-park:shop:catalog') {
      window.petDemo.nativeShopClear();
    }
    if (event.data === 'animal-park:shop:confirm') window.petDemo.nativeShopConfirm();
    if (event.data === 'animal-park:buy-bed' && room.classList.contains('current')) {
      if (!window.petDemo.buyBed() && window.petDemo.nativeShop().status) {
        syncHome({refusal:window.petDemo.nativeShop().status});
      }
    }
    if (event.data === 'animal-park:bed:later' && room.classList.contains('current')) window.petDemo.dismissBedGoal();
    if (event.data === 'animal-park:bed:remind' && room.classList.contains('current')) window.petDemo.remindBed();
    if (typeof event.data === 'string' && event.data.startsWith('animal-park:shop:pick:')) {
      window.petDemo.nativeShopPick(event.data.slice('animal-park:shop:pick:'.length));
    }
    if (typeof event.data === 'string' && event.data.startsWith('animal-park:round:')) {
      let payload;
      try { payload = JSON.parse(event.data.slice('animal-park:round:'.length)); } catch { return; }
      storeRound(payload?.game,payload?.round);
    }
  });

  function syncRoom() {
    if (frame && document.querySelector('.visitor-screen.current')) {
      if (!ready) leave();
      else if (!scenePaused || !history.state?.nativeReturn) checkpointNavigation();
    }
    moveToHome();
    syncPause();
    syncHome();
    startCurrentRoom();
  }
  document.addEventListener('conceptscreen', syncRoom);
  document.addEventListener('visibilitychange', syncRoom);
  window.captureParkGameNavigation = (forReload = false) => {
    if (room?.id !== 'home' || !room.classList.contains('current')) return;
    const nativeReturn = checkpointNavigation(forReload);
    if (!forReload || nativeReturn === undefined || location.hash !== '#home') return;
    try {
      sessionStorage.setItem('animal-park-native-reload', JSON.stringify({
        hostUrl:window.parent.location.href, hash:'#home', nativeReturn
      }));
    } catch {}
  };
  window.addEventListener('pagehide', () => window.captureParkGameNavigation(true));
  window.addEventListener('pageshow', syncRoom);
  document.addEventListener('petprofile', () => syncHome());
  document.addEventListener('parkpurchase', () => syncHome({celebrate_purchase:true}));
  window.addEventListener('online', () => {
    updateEngineOptions();
    startCurrentRoom();
  });
  window.addEventListener('offline', updateEngineOptions);
  updateEngineOptions();
  startCurrentRoom();
  showOpeningWhileRoomDecodes();
})();
