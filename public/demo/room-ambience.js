(() => {
  const home = document.getElementById('home');
  const wash = document.getElementById('wash');
  const native = document.getElementById('scene3d');
  const preview = document.getElementById('shop-preview');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const onScreen = new Set();
  const panes = {
    veranda: '<path d="M87 176 212 201 211 478 88 490Z"/>',
    kitchen: '<path d="M62 61H156V202H62ZM175 60H261V202H175ZM62 220H156V348H62ZM176 220H261V348H176Z"/>',
    bath: '<path d="M288 100H367V231H288ZM385 100H469V231H385Z"/>',
    tub: '<path d="M0 146H53V270H0ZM78 146H209V270H78Z"/>'
  };
  let room = '', layer, timer, frame;

  function visibleRoom() {
    if (reducedMotion.matches || document.hidden || document.querySelector('dialog[open]')) return '';
    if (wash.classList.contains('current') && onScreen.has(wash)) return wash.classList.contains('washing') ? 'tub' : 'bath';
    if (!home.classList.contains('current') || !onScreen.has(home) || !native.hidden || !preview.hidden ||
        home.matches('.night,.preview-kitchen,[data-intro-3d]')) return '';
    if (home.classList.contains('in-kitchen')) return home.classList.contains('has-kitchen-art') ? 'kitchen' : '';
    return 'veranda';
  }

  function createLayer(room, art) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'room-window-life');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('viewBox', room === 'veranda' ? '0 0 640 1137' : '0 0 540 960');
    const inBath = room === 'bath' || room === 'tub';
    svg.setAttribute('preserveAspectRatio', inBath ? 'none' : 'xMidYMid slice');
    svg.dataset.room = room;
    svg.innerHTML = '<defs><clipPath id="room-glass">' + panes[room] + '</clipPath></defs>' +
      '<g clip-path="url(#room-glass)">' + art + '</g>';
    (inBath ? wash : home).prepend(svg);
    return svg;
  }

  function fish() {
    const startX = 108 + Math.random() * 10, endX = startX + 63;
    const waterY = 421 + Math.random() * 5;
    layer = createLayer('veranda', `
      <g class="leaping-fish">
        <path fill="#52665a" d="M-10 0-17-5-16 4-10 2Q-5 6 3 4Q10 3 13 0Q9-3 4-4L0-7-4-4Q-8-3-10 0Z"/>
        <path fill="#b7bba0" d="M-9 1Q2 4 11 0Q8 4 2 4Q-4 5-9 1Z"/><circle cx="8.4" cy="-1.1" r=".9" fill="#33483e"/>
      </g>
      <g class="ripples" fill="none" stroke-width="1.6"><ellipse stroke="#547a78"/><ellipse stroke="#fff3c7"/></g>`);
    const body = layer.querySelector('.leaping-fish'), rings = [...layer.querySelectorAll('ellipse')];
    for (const ring of rings) {
      ring.setAttribute('cx', endX);
      ring.setAttribute('cy', waterY);
    }
    return t => {
      const leap = 760;
      if (t < leap) {
        const p = t / leap;
        layer.dataset.phase = 'leap';
        body.setAttribute('transform', `translate(${startX + (endX-startX)*p} ${waterY - 92*p*(1-p)}) rotate(${Math.atan2(92*(2*p-1),endX-startX)*180/Math.PI}) scale(1.12)`);
        body.setAttribute('opacity', Math.min(1, p*10, (1-p)*14));
        return true;
      }
      if (layer.dataset.phase !== 'ripples') {
        body.setAttribute('transform', `translate(${endX} ${waterY})`);
        body.setAttribute('display', 'none');
        layer.dataset.phase = 'ripples';
      }
      rings.forEach((ring, i) => {
        const p = Math.max(0, Math.min(1, (t-leap-i*210)/1250));
        ring.setAttribute('rx', 1 + 20*p);
        ring.setAttribute('ry', .35 + 3.9*p);
        ring.setAttribute('opacity', p > 0 ? .87*(1-p) : 0);
      });
      return t < leap + 1460;
    };
  }

  function birds() {
    const bird = '<g><path fill="#474e43" d="M-7 1-12 0-9 3-4 3Q0 6 6 2L9 1 6 0Q4-3 2-2L0 0Z"/><path class="wing" fill="#50564a"/></g>';
    layer = createLayer('kitchen', bird + bird);
    const flock = Array.from(layer.querySelector('[clip-path]').children);
    const wings = flock.map(b => b.querySelector('.wing'));
    // On a short display the pantry button covers much of the upper glass.
    const height = (home.clientHeight < 660 ? 259 : 109) + Math.random()*35;
    layer.dataset.phase = 'flight';
    return t => {
      flock.forEach((b, i) => {
        const p = (t - i*260)/1530;
        const bend = Math.sin(p*Math.PI);
        b.setAttribute('transform', `translate(${38+245*p} ${height + i*24 - bend*17}) scale(${i ? .57 : .78}) rotate(${(p-.5)*14})`);
        const wing = Math.sin(t*.024+i)*7-3;
        wings[i].setAttribute('d', `M-3 2Q-5 ${wing} -11 ${wing-4}Q-3 ${wing-3} 2 1Z`);
      });
      return t < 1800;
    };
  }

  function drops() {
    const inTub = room === 'tub';
    const x = (inTub ? 101 : 307) + Math.random()*28, y = inTub ? 175 : 138;
    const bead = '<g><path d="M0-4C-.8-2.5-2.2-.8-2 1A2.1 2.1 0 0 0 2 1C2-.8.7-2.6 0-4Z" fill="#b0ccd0" stroke="#6e9397" stroke-width=".65"/><path d="M-.9 1Q-1 .2-.5-.8" stroke="#fff" stroke-width=".8" fill="none"/></g>';
    layer = createLayer(room, bead + bead);
    const beads = Array.from(layer.querySelector('[clip-path]').children);
    layer.dataset.phase = 'drops';
    return t => {
      beads.forEach((bead, i) => {
        const p = Math.max(0, Math.min(1, (t-i*340)/2100));
        bead.setAttribute('transform', `translate(${x+i*22+1.5*Math.sin(p*4)} ${y+i*9+(i?19:34)*p*p}) scale(${i ? .68 : 1})`);
        bead.setAttribute('opacity', .82*Math.min(1,p*7,(1-p)*5));
      });
      return t < 2440;
    };
  }

  function play() {
    const update = room === 'veranda' ? fish() : room === 'kitchen' ? birds() : drops();
    const start = performance.now();
    function draw(now) {
      if (update(Math.max(0, now-start))) frame = requestAnimationFrame(draw);
      else {
        layer.remove();
        layer = null;
        timer = setTimeout(play, 7800 + Math.random()*5800);
      }
    }
    draw(start);
  }

  function refresh() {
    const next = visibleRoom();
    if (room === next) return;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    layer?.remove();
    layer = null;
    room = next;
    if (room) timer = setTimeout(play, 1450 + Math.random()*850);
  }

  const observer = new MutationObserver(refresh);
  const visibility = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio > 0) onScreen.add(entry.target);
      else onScreen.delete(entry.target);
    }
    refresh();
  });
  visibility.observe(home);
  visibility.observe(wash);
  for (const node of [home, wash]) observer.observe(node, {attributes:true, attributeFilter:['class','data-intro-3d']});
  for (const node of [native, preview]) observer.observe(node, {attributes:true, attributeFilter:['hidden']});
  for (const dialog of document.querySelectorAll('dialog')) observer.observe(dialog, {attributes:true, attributeFilter:['open']});
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('conceptscreen', refresh);
  reducedMotion.addEventListener('change', refresh);
  refresh();
})();
