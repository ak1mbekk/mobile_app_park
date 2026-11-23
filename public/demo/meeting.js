// Keep the live Godot room while the player visits another tab.
(() => {
  const open = document.querySelector('#open3d');
  const offer = document.querySelector('#offer-apple');
  const container = document.querySelector('#scene3d');
  const loading = document.querySelector('#loading3d');
  const caption = document.querySelector('#opening-caption');
  const progress = document.querySelector('#opening-progress');
  const close = document.querySelector('#close3d');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.id = 'retry3d';
  retry.className = 'primary';
  retry.textContent = 'Повторить загрузку';
  retry.hidden = true;
  progress.after(retry);
  const intro = document.getElementById('intro');
  const home = document.getElementById('home');
  const preference = new URLSearchParams(location.search).get('view');
  const localPack = (() => {
    try {
      return location.hostname === 'localhost' && !location.port &&
        (location.protocol === 'https:' || location.protocol === 'capacitor:') &&
        window.parent.Capacitor?.isNativePlatform?.() === true;
    } catch { return false; }
  })();
  let frame, room, decodingRoom, timeout;
  let progressObserver;
  let booted = false;
  let ready = false;
  let available;
  let pauseCallback, scenePaused;
  let pauseFrames;
  let lighter = false;
  let offerOnLoad = false;
  let homeStatePending = false;
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

  function controlFrameLoop(target) {
    // SceneTree.paused stops gameplay, but Godot still draws the hidden room.
    // Hold its frame callbacks while away; keep the live engine and their IDs.
    const request = target.requestAnimationFrame.bind(target);
    const cancel = target.cancelAnimationFrame.bind(target);
    const pending = new Map();
    let paused = false;
    function schedule(job) {
      job.waiting = false;
      job.native = request(time => {
        if (paused) { job.waiting = true; return; }
        pending.delete(job.id);
        job.callback.call(target, time);
      });
    }
    target.requestAnimationFrame = callback => {
      const job = { callback };
      schedule(job);
      job.id = job.native;
      pending.set(job.id, job);
      return job.id;
    };
    target.cancelAnimationFrame = id => {
      const job = pending.get(id);
      pending.delete(id);
      cancel(job?.native ?? id);
    };
    return value => {
      if (paused === value) return;
      paused = value;
      if (!paused) for (const job of pending.values()) if (job.waiting) schedule(job);
    };
  }

  function syncPause() {
    const active = room?.classList.contains('current') === true;
    const naming = ready && room === intro && document.querySelector('#name.current') !== null;
    const poster = decodingRoom?.classList.contains('current') === true;
    const visible = active || naming || poster;
    container.hidden = !visible;
    container.inert = naming;
    home.toggleAttribute('data-intro-3d', visible && (room === intro || decodingRoom === intro));
    intro.toggleAttribute('data-naming-backdrop', naming);
    intro.inert = naming;
    if (ready) {
      const paused = document.hidden || !active;
      setScenePaused(paused);
      pauseFrames?.(paused);
    }
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

  function syncHome(extra = {}, allowHidden = false) {
    const active = home.classList.contains('current');
    if (room !== home || !ready || (!active && !allowHidden)) return;
    const initialize = active && homeStatePending;
    const opening = initialize ? {offer_apple:offerOnLoad, ...takeNavigation()} : {};
    if (initialize) {
      homeStatePending = false;
      offerOnLoad = false;
    }
    const {name, hat, night, level, leaves, ball, pairs, match, orchard, food, clean, energy, joy} = window.petDemo.stats();
    frame.contentWindow.setParkHomeState?.(JSON.stringify({
      name, night, level, leaves, ball, hat:window.petDemo.outfit() ?? hat ?? '',
      furniture:window.petDemo.furniture(), shop:window.petDemo.nativeShop(), bed_goal:window.petDemo.bedGoal(),
      pantry:window.petDemo.foodSnapshot(),
      rounds:{pairs, match, orchard}, needs:{food, clean, energy, joy}, ...opening, ...extra
    }));
  }

  function leave() {
    document.body.removeAttribute('data-game-overlay');
    clearTimeout(timeout);
    progressObserver?.disconnect();
    frame?.remove();
    frame = null;
    booted = false;
    ready = false;
    pauseCallback = undefined;
    scenePaused = undefined;
    pauseFrames = undefined;
    offerOnLoad = false;
    homeStatePending = false;
    retry.hidden = true;
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
    decodingRoom = null;
    coverRoom(room);
    syncPause();
    ready = false;
    offerOnLoad = offerApple;
    close.hidden = false;
    close.textContent = 'Лёгкая версия';
    retry.hidden = true;
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
    if (localPack) roomUrl.searchParams.set('bundled', '1');
    const nextFrame = frame;
    let preparingScene = false;
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
        const hasBytes = engineProgress.hasAttribute('value') && engineProgress.max > 0;
        if (hasBytes && engineProgress.value >= engineProgress.max) {
          preparingScene = true;
          progress.removeAttribute('value');
          caption.textContent = 'Готовим 3D-сцену…';
        } else if (hasBytes) {
          if (preparingScene) caption.textContent = 'Загружаем домик…';
          preparingScene = false;
          progress.max = engineProgress.max;
          progress.value = engineProgress.value;
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
      if (!preparingScene) caption.textContent = 'Загрузка занимает больше времени. Можно перейти в лёгкую версию.';
    }, 30000);
  }

  function shouldStart3d() {
    if (lighter || preference === '2d') return false;
    if (localPack) return true;
    if (navigator.onLine === false) return false;
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
    decodingRoom = current;
    coverRoom(current);
    syncPause();
    close.hidden = true;
    const art = new Image();
    art.src = imageUrl;
    const showRoom = () => {
      if (decodingRoom !== current) return;
      decodingRoom = null;
      coverRoom(null);
      syncPause();
    };
    art.decode().then(showRoom, showRoom);
  }

  function moveToHome() {
    if (room !== intro || !home.classList.contains('current') || !window.petDemo.stats().onboardingDone) return;
    if (typeof frame.contentWindow?.setParkEnterHome === 'function') {
      room = home;
      coverRoom(home);
      ready = false;
      frame.inert = true;
      frame.title = 'Домик у тропы в 3D';
      loading.removeAttribute('data-finished');
      loading.removeAttribute('aria-hidden');
      caption.textContent = 'Загружаем домик…';
      progress.hidden = false;
      progress.removeAttribute('value');
      close.hidden = false;
      pauseFrames?.(false);
      frame.contentWindow.setParkEnterHome();
      return;
    }
    leave();
    startCurrentRoom();
  }

  function supports3d() {
    if ((!localPack && !window.isSecureContext) || location.protocol === 'file:' || preference === '2d') return false;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return Boolean(gl);
    } catch {
      return false;
    }
  }

  function updateEngineOptions() {
    open.hidden = offer.hidden = !available || (!localPack && navigator.onLine === false);
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
  retry.onclick = () => {
    const loader = frame?.contentWindow?.parkHomePack;
    if (!loader || ready) return;
    retry.hidden = true;
    caption.textContent = 'Загружаем домик…';
    progress.hidden = false;
    progress.removeAttribute('value');
    void loader.ensure().catch(() => {});
  };

  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
    if (!ready && ['animal-park:home-loading', 'animal-park:home-load-failed'].includes(event.data)) {
      clearTimeout(timeout);
      progressObserver?.disconnect();
      const failed = event.data === 'animal-park:home-load-failed';
      loading.removeAttribute('data-finished');
      loading.removeAttribute('aria-hidden');
      close.hidden = false;
      retry.hidden = !failed;
      progress.hidden = failed;
      progress.removeAttribute('value');
      caption.textContent = failed
        ? 'Не удалось загрузить домик. Повтори загрузку или продолжи в лёгкой версии.'
        : 'Загружаем домик…';
      return;
    }
    if (!ready && event.data === (room.id === 'intro' ? 'animal-park:scene-ready' : 'animal-park:home-ready')) {
      const readyFrame = frame;
      booted = true;
      clearTimeout(timeout);
      if (room.id === 'home') await window.petDemo.recoverNativeRound();
      if (frame !== readyFrame) return;
      ready = true;
      retry.hidden = true;
      pauseFrames ??= controlFrameLoop(frame.contentWindow);
      homeStatePending = room === home;
      frame.inert = false;
      progressObserver?.disconnect();
      loading.setAttribute('data-finished','');
      loading.setAttribute('aria-hidden','true');
      close.hidden = room.id === 'home';
      syncHome();
      syncPause();
      if (!document.hidden && room.classList.contains('current')) frame.focus();
      return;
    }
    if (!ready) return;
    if (event.data === 'animal-park:intro-rendered' && room === intro) {
      const renderedFrame = frame;
      // Godot has drawn a frame; allow the host to paint the uncovered canvas.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (frame === renderedFrame && ready && room === intro && !document.hidden && intro.classList.contains('current')) {
          frame.contentWindow.dispatchEvent(new Event('park-intro-visible'));
        }
      }));
      return;
    }
    if (event.data === 'animal-park:meal-finished') {
      if (room.id === 'intro') {
        window.petDemo.finishMeeting();
      } else if(!frame.contentWindow.parkNativeFood)syncHome({meal_reached_full:window.petDemo.finishAppleSnack()}, true);
    }
    if (room?.id !== 'home') return;
    if (typeof event.data==='string'&&event.data.startsWith('animal-park:food:choose:')) {
      const refusal=window.petDemo.chooseFood(event.data.slice('animal-park:food:choose:'.length));
      syncHome(refusal?{refusal}:{offer_food:true},true);
    }
    if (typeof event.data==='string'&&event.data.startsWith('animal-park:food:finished:')) {
      const result=window.petDemo.finishFood(Number(event.data.slice('animal-park:food:finished:'.length)));
      syncHome({meal_reached_full:result.reachedMaximum},true);
    }
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
    if (event.data === 'animal-park:profile' && room.classList.contains('current')) {
      document.getElementById('home-profile').click();
    }
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
    if (decodingRoom && !decodingRoom.classList.contains('current')) {
      decodingRoom = null;
      coverRoom(null);
    }
    if (frame && document.querySelector('.visitor-screen.current')) {
      if (!booted) leave();
      else if (ready && (!scenePaused || !history.state?.nativeReturn)) checkpointNavigation();
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
