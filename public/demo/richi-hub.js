(() => {
  const byId = id => document.getElementById(id);
  const hub = byId('richi');
  const panel = byId('richi-progress');
  const play = byId('richi-play').querySelector('span');
  function refresh() {
    if (!hub.classList.contains('current') || !window.petDemo) return;
    const pet = window.petDemo.stats();
    const named = pet.onboardingDone;
    const levelProgress = pet.xp % 30;
    byId('richi-heading').textContent = named ? (pet.night ? pet.name + ' спит в домике' : pet.name + ' ждёт тебя!') : 'Отправляйся в приключение с Ричи!';
    byId('richi-intro-line').textContent = named ? 'Загляни в домик, позаботься о еноте или сыграй с ним.' : 'Ухаживай за енотом, играй и зарабатывай листья.';
    play.textContent = named || pet.mealFinished ? 'Продолжить игру' : 'Начать игру';
    byId('richi-level').textContent = 'Уровень ' + pet.level;
    byId('parkRewardState').textContent = pet.couponUsed ? 'Купон использован' : pet.level >= 10 ? 'Купон доступен' : 'Откроется на уровне 10';
    byId('richi-stage').textContent = pet.level >= 10 ? 'Взрослый енот' : pet.level >= 4 ? 'Юный енот' : 'Малыш';
    byId('richi-points').textContent = pet.xp + ' XP';
    byId('richi-xp-meter').value = levelProgress;
    byId('richi-next').textContent = 'До уровня ' + (pet.level + 1) + ' осталось ' + (30 - levelProgress) + ' XP.';
    byId('richi-leaves').textContent = 'Листья · ' + pet.leaves;
    const goal = window.petDemo.bedGoal();
    byId('richi-tasks').hidden = named && !goal;
    if (!named || goal) {
      const task = byId('richi-task');
      if (named) {
        delete task.dataset.tab;
        task.dataset.go = goal.play ? 'game' : 'home';
      } else {
        delete task.dataset.go;
        task.dataset.tab = 'home';
      }
      byId('richi-task-title').textContent = named ? goal.message : pet.mealFinished ? 'Дай еноту имя' : 'Угости Ричи яблоком';
      byId('richi-task-copy').textContent = named ? (goal.play ? 'Сыграть в «Найди пару»' : 'Открыть задание в домике') : 'Первая встреча в домике';
      byId('richi-task-art').src = named ? 'assets/shop-bed.webp' : 'assets/fruit.webp';
    }
    const showProgress = location.hash.split('/')[1] === 'progress';
    panel.hidden = !showProgress;
    const progressLink = byId('richi-progress-link');
    const target = showProgress ? 'richi' : 'richi/progress';
    progressLink.href = '#' + target;
    progressLink.dataset.go = target;
    progressLink.setAttribute('aria-expanded', String(showProgress));
  }
  document.addEventListener('petprofile', refresh);
  document.addEventListener('conceptscreen', ({detail}) => {
    if (detail !== 'richi') return;
    refresh();
    if (!panel.hidden) requestAnimationFrame(() => {
      if (!hub.classList.contains('current')) return;
      panel.focus({preventScroll:true});
      panel.scrollIntoView({block:'nearest',behavior:'instant'});
    });
  });
  refresh();
})();
