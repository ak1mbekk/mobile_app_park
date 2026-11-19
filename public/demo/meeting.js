// Load the editable Godot room on demand. The illustrated meeting also works offline.
(() => {
  const open = document.querySelector('#open3d');
  const offer = document.querySelector('#offer-apple');
  const container = document.querySelector('#scene3d');
  const loading = document.querySelector('#loading3d');
  let frame;
  let timeout;
  let room;
  let attempted=false;
  const preference=new URLSearchParams(location.search).get('view');
  function startFirstVisit(){
    if(attempted||open.hidden||document.hidden||!document.querySelector('#intro.current')||
       preference==='2d'||navigator.onLine===false)return;
    if(preference!=='3d'){
      if(navigator.connection?.saveData||['slow-2g','2g','3g'].includes(navigator.connection?.effectiveType))return;
      try{if(sessionStorage.getItem('park-light-meeting')==='1')return;}catch{}
    }
    attempted=true;
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl2');
    if(!gl){open.hidden=true;offer.hidden=true;return;}
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    enter('intro');
  }
  function syncPause() {
    frame?.contentWindow?.setParkScenePaused?.(document.hidden || !room?.classList.contains('current'));
  }

  function leave() {
    clearTimeout(timeout);
    frame?.remove();
    frame = null;
    container.hidden = true;
    if(room?.classList.contains('current')){
      (room.id==='intro'?open:document.querySelector('#aki-feed')).focus({preventScroll:true});
    }
    room=null;
  }

  if (location.protocol !== 'file:') {
    fetch('meeting3d/index.wasm', {method:'HEAD'})
      .then(response => {
        open.hidden = !response.ok || !response.headers.get('content-type')?.includes('wasm');
        offer.hidden=open.hidden;
        startFirstVisit();
      }).catch(() => {});
  }

  function enter(scene) {
    if (frame) return;
    attempted=true;
    room=document.getElementById(scene);
    room.append(container);
    container.hidden = false;
    document.querySelector('#close3d').textContent=scene==='intro'?'Лёгкая версия':'Вернуться';
    loading.hidden = false;
    loading.textContent = 'Загружаем домик…';
    frame = document.createElement('iframe');
    frame.title = scene==='intro'?'Первая встреча с Ричи в 3D':'Угощение для '+window.petDemo.stats().name;
    const roomUrl=new URL('meeting3d/index.html',document.baseURI);
    roomUrl.searchParams.set('host','animal-park');
    const hat=scene==='home'?window.petDemo.stats().hat:null;
    if(hat)roomUrl.searchParams.set('hat',hat);
    frame.src=roomUrl.href;
    container.prepend(frame);
    timeout = setTimeout(() => {
      loading.textContent = 'Домик ещё загружается. Можно вернуться к лёгкой версии.';
    }, 30000);
  }
  open.onclick=()=>enter('intro');
  offer.onclick=()=>{
    const pet=window.petDemo.stats();
    if(!pet.onboardingDone||pet.night||pet.level>=4)return;
    document.querySelector('#aki-pantry').hidden=true;
    enter('home');
  };
  document.querySelector('#close3d').onclick = ()=>{
    if(room?.id==='intro'){
      try{sessionStorage.setItem('park-light-meeting','1');}catch{}
    }
    leave();
  };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
    if (event.data === 'animal-park:scene-ready') {
      clearTimeout(timeout);
      loading.hidden = true;
      syncPause();
      if (room.classList.contains('current')) frame.focus();
    }
    if (event.data === 'animal-park:meal-finished') {
      const first=room.id==='intro';
      leave();
      if(first)window.petDemo.finishMeeting();
      else window.petDemo.finishAppleSnack();
    }
  });
  function syncRoom(){syncPause();startFirstVisit();}
  document.addEventListener('conceptscreen',syncRoom);
  document.addEventListener('visibilitychange',syncRoom);
})();
