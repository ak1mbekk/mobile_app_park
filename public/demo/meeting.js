// Load the editable Godot room on demand. The illustrated meeting also works offline.
(() => {
  const open = document.querySelector('#open3d');
  const container = document.querySelector('#scene3d');
  const loading = document.querySelector('#loading3d');
  let frame;
  let timeout;

  function leave() {
    clearTimeout(timeout);
    frame?.remove();
    frame = null;
    container.hidden = true;
    open.focus({preventScroll:true});
  }

  if (location.protocol !== 'file:') {
    fetch('meeting3d/index.wasm', {method:'HEAD'})
      .then(response => {
        open.hidden = !response.ok || !response.headers.get('content-type')?.includes('wasm');
        if (!open.hidden && location.search === '?view=3d' && document.querySelector('#intro.current')) open.click();
      }).catch(() => {});
  }

  open.onclick = () => {
    if (frame) return;
    container.hidden = false;
    loading.hidden = false;
    loading.textContent = 'Загружаем домик…';
    frame = document.createElement('iframe');
    frame.title = 'Первая встреча с Ричи в 3D';
    frame.src = 'meeting3d/index.html';
    container.prepend(frame);
    timeout = setTimeout(() => {
      loading.textContent = 'Домик ещё загружается. Можно вернуться к лёгкой версии.';
    }, 30000);
  };
  document.querySelector('#close3d').onclick = leave;
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
    if (event.data === 'animal-park:scene-ready') {
      clearTimeout(timeout);
      loading.hidden = true;
      frame.focus();
    }
    if (event.data === 'animal-park:meal-finished') {
      leave();
      window.petDemo.finishMeeting();
    }
  });
  document.addEventListener('conceptscreen', event => {
    if (frame && event.detail !== 'intro') leave();
  });
})();
