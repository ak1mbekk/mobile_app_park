(() => {
  const home = document.getElementById('home');
  const intro = document.getElementById('intro');
  const figure = document.getElementById('pet-figure');
  const pet = document.getElementById('aki-pet');
  const room3d = document.getElementById('scene3d');
  const canvas = document.createElement('canvas');
  canvas.className = 'pet-reaction';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sleepSignals = document.createElement('div');
  sleepSignals.id = 'sleep-signals';
  sleepSignals.setAttribute('aria-hidden', 'true');
  sleepSignals.hidden = true;
  for (let i=0;i<3;i++) { const z=document.createElement('span'); z.textContent='Z'; sleepSignals.append(z); }
  home.append(sleepSignals);
  let sleeping = home.classList.contains('night'), sleepTransition;
  function syncSleep() {
    const next = home.classList.contains('night');
    sleepSignals.hidden = !next || !home.classList.contains('current') || !visibleFallback() || document.hidden;
    if (next !== sleeping) {
      clearTimeout(sleepTransition);
      home.classList.remove('sleep-entering','sleep-waking');
      if (!reducedMotion.matches && visibleFallback()) {
        home.classList.add(next ? 'sleep-entering' : 'sleep-waking');
        sleepTransition = setTimeout(()=>home.classList.remove('sleep-entering','sleep-waking'),1200);
      }
      if (next) stop();
      sleeping = next;
    }
  }
  new MutationObserver(syncSleep).observe(home,{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncSleep).observe(room3d,{attributes:true,attributeFilter:['hidden'],childList:true});
  document.addEventListener('conceptscreen',()=>queueMicrotask(syncSleep));
  document.addEventListener('petprofile',()=>queueMicrotask(syncSleep));
  document.addEventListener('visibilitychange',syncSleep);
  reducedMotion.addEventListener('change',syncSleep);
  queueMicrotask(syncSleep);
  const hats = new Set(['cap', 'ranger', 'crown']);
  const ages = new Set(['kit', 'young', 'adult']);
  let atlas, active, raf, finger;

  function visibleFallback() {
    return room3d.hidden || !room3d.querySelector('iframe');
  }

  function loadAtlas(name) {
    if (atlas?.name === name) return atlas.ready;
    const image = new Image();
    const ready = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = reject;
    });
    const requested = { name, ready };
    atlas = requested;
    image.src = 'assets/pet-reactions/' + name + '.webp';
    ready.catch(() => { if (atlas === requested) atlas = null; });
    return ready;
  }

  function stop() {
    active = null;
    cancelAnimationFrame(raf);
    canvas.remove();
    delete figure.dataset.reaction;
  }

  function portrait() {
    const stage = ages.has(home.dataset.age) ? home.dataset.age : 'kit';
    const hat = window.petDemo.outfit();
    return stage + '-' + (hats.has(hat) ? hat : 'bare');
  }

  function draw(image, frame, columns) {
    const w = canvas.width, h = canvas.height;
    context.clearRect(0, 0, w, h);
    context.drawImage(image, (frame % columns) * w, Math.floor(frame / columns) * h, w, h, 0, 0, w, h);
  }

  async function play(screen, type) {
    if (!visibleFallback() || document.hidden || home.classList.contains('night') && screen === home) return;
    if (type === 'look' && active?.type === 'purchase') return;
    stop();
    const meeting = screen === intro;
    const scene = { type, finger, name: meeting ? 'meeting' : portrait() };
    active = scene;
    let image;
    try {
      image = await loadAtlas(scene.name);
    } catch {
      if (active === scene) stop();
      return;
    }
    if (active !== scene) return;
    if (!screen.classList.contains('current') || !visibleFallback()) { stop(); return; }

    const target = screen === home ? figure : screen;
    const columns = meeting ? 2 : 6;
    canvas.width = meeting ? 420 : 232;
    canvas.height = meeting ? 840 : 258;
    target.append(canvas);
    if (target === figure) figure.dataset.reaction = type;
    const start = performance.now();
    let previous = -1;
    let lookUntil = 535;
    function tick(now) {
      if (active !== scene) return;
      if (!visibleFallback() || screen.classList.contains('washing')) { stop(); return; }
      const elapsed = now - start;
      let frame, pose;
      if (type === 'look') {
        if (scene.finger !== undefined && finger === scene.finger) lookUntil = Math.max(lookUntil, elapsed);
        if (elapsed >= lookUntil + 165) { stop(); return; }
        frame = reducedMotion.matches ? 2 : elapsed < 150 ? 1 : elapsed <= lookUntil ? 2 : 3;
        pose = frame === 1 ? 'eyes' : 'look';
      } else if (reducedMotion.matches) {
        if (elapsed >= 700) { stop(); return; }
        frame = 21;
        pose = 'clap';
      } else if (elapsed < 700) {
        frame = 4 + Math.floor(elapsed / 70);
        pose = 'jump';
      } else {
        frame = 14 + Math.floor((elapsed - 700) / 78);
        if (frame >= 30) { stop(); return; }
        pose = 'clap';
      }
      if (previous !== frame) {
        previous = frame;
        canvas.dataset.pose = pose;
        draw(image, frame, columns);
      }
      raf = requestAnimationFrame(tick);
    }
    tick(start);
  }

  for (const screen of [home, intro]) {
    screen.addEventListener('pointerdown', event => {
      if (event.button !== 0 || finger !== undefined || !visibleFallback()) return;
      finger = event.pointerId;
      const control = event.target.closest('button, input, [role="button"], a');
      if (control && control !== pet) return;
      const bounds = screen === intro ? intro.getBoundingClientRect() : figure.getBoundingClientRect();
      const center = bounds.left + bounds.width * (screen === intro ? 0.62 : 0.5);
      if (bounds.width && event.clientX > center) void play(screen, 'look');
    });
  }
  function finishPointer(event) {
    if (finger !== event.pointerId) return;
    finger = undefined;
    if (event.type === 'pointercancel' && active?.type === 'look') stop();
  }
  window.addEventListener('pointerup', finishPointer, true);
  window.addEventListener('pointercancel', finishPointer, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { finger = undefined; stop(); }
  });
  document.addEventListener('conceptscreen', () => { finger = undefined; stop(); });
  document.addEventListener('petprofile', () => {
    if (active && active.name !== 'meeting' && active.name !== portrait()) stop();
  });
  document.addEventListener('parkpurchase', () => {
    if (!visibleFallback()) return;
    queueMicrotask(() => {
      const screen = document.querySelector('#home.current, #wash.current, #chest.current');
      if (screen) void play(screen, 'purchase');
    });
  });
})();
