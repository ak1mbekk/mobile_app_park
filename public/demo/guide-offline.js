(() => {
  const button=document.getElementById('save-guide');
  const status=document.getElementById('offline-guide-status');
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    button.hidden=true;
    status.textContent='Для прогулки без связи скачайте обе схемы.';
    return;
  }
  const workerUrl=new URL('guide-worker.js',document.baseURI).href;
  function ready(){
    status.textContent='Обе схемы и фотографии животных сохранены для этого браузера.';
    button.hidden=true;
  }
  navigator.serviceWorker.getRegistration(new URL('./',document.baseURI)).then(reg=>{
    if(reg?.active?.scriptURL===workerUrl)ready();
  }).catch(()=>{});
  button.onclick=async()=>{
    button.disabled=true;
    status.textContent='Сохраняем схемы и каталог животных…';
    try {
      await window.parkSchedule.load();
      const registration=await navigator.serviceWorker.register('guide-worker.js');
      const worker=registration.installing || registration.waiting || registration.active;
      if (!worker) throw Error('Worker unavailable');
      await new Promise((resolve,reject)=>{
        function changed(){
          if(!['activated','redundant'].includes(worker.state))return;
          worker.removeEventListener('statechange',changed);
          if(worker.state==='activated')resolve();else reject(Error('Download failed'));
        }
        worker.addEventListener('statechange',changed);changed();
      });
      ready();
    } catch {
      status.textContent='Не удалось сохранить путеводитель. Проверьте связь и попробуйте ещё раз.';
    } finally {button.disabled=false;}
  };
})();
