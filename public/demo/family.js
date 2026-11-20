(() => {
  const find = id => document.getElementById(id);
  const section = find('family-account');
  const form = find('family-access');
  const status = find('family-status');
  let session = {}, registering = false, pending = null;
  let busy = false;
  async function request(path, body) {
    const options = { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(9000) };
    if (body !== undefined) Object.assign(options, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const response = await fetch('/api/family/' + path, options);
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Сервер аккаунтов недоступен. Енот сохранён на устройстве.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Сессия закончилась. Откройте профиль ещё раз.');
    return data;
  }
  function task(action) {
    return async event => {
      event?.preventDefault();
      if (busy) return;
      busy = true;
      section.setAttribute('aria-busy', 'true');
      try { await action(); }
      catch (error) { status.textContent = error instanceof TypeError || error.name === 'TimeoutError' ? 'Нет связи с сервером. Игра сохранена на устройстве.' : error.message; }
      finally { busy = false; section.removeAttribute('aria-busy'); }
    };
  }
  function paint() {
    form.hidden = Boolean(session.login);
    find('family-signed').hidden = !session.login;
    find('family-review').hidden = true;
    find('family-restore').disabled = !session.revision;
    find('family-save').disabled = !window.petDemo.stats().onboardingDone;
    status.textContent = session.login ? 'Выполнен вход · ' + session.login : 'Взрослый может сохранить игру и перенести её на другой телефон.';
    find('family-submit').textContent = registering ? 'Создать аккаунт' : 'Войти';
    find('family-mode').textContent = registering ? 'Уже есть аккаунт' : 'Создать аккаунт';
    form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  }
  const connect = task(async () => {
    form.hidden = find('family-review').hidden = find('family-signed').hidden = true;
    find('family-retry').hidden = false;
    status.textContent = 'Подключение…';
    pending = null;
    session = await request('session');
    find('family-retry').hidden = true;
    paint();
  });
  document.addEventListener('click', event => { if(event.target.closest('[data-profile]')) connect(); });
  find('family-retry').onclick = connect;
  find('family-mode').onclick = () => { if (!busy) { registering = !registering; paint(); } };
  form.onsubmit = task(async () => {
    session = await request(registering ? 'register' : 'login', { login: form.elements.login.value, password: form.elements.password.value });
    form.reset(); registering = false; paint();
  });
  find('family-logout').onclick = task(async () => {
    await request('logout', {}); session = {}; pending = null; paint();
  });
  function confirm(action, message, caption) {
    pending = action;
    find('family-signed').hidden = true;
    find('family-comparison').textContent = message;
    find('family-confirm').textContent = caption;
    find('family-review').hidden = false;
  }
  find('family-cancel').onclick = () => { if (!busy) { pending = null; paint(); } };
  find('family-confirm').onclick = task(async () => { if (pending) await pending(); });
  async function save() {
    const pet = window.petDemo.stats();
    const result = await request('save', { revision: session.revision, pet });
    session.revision = result.revision; pending = null; paint();
    status.textContent = pet.name + ' сохранён в семейном аккаунте.';
  }
  find('family-save').onclick = task(async () => {
    if (session.revision) {
      const copy = await request('save');
      if (session.revision !== copy.revision) throw new Error('Сохранение изменилось. Откройте профиль заново.');
      confirm(save, 'Заменить сохранение «' + copy.pet.name + '» в аккаунте текущей игрой?', 'Заменить сохранение');
    } else await save();
  });
  find('family-restore').onclick = task(async () => {
    const copy = await request('save');
    if (!copy.pet) throw new Error('В аккаунте пока нет сохранения.');
    session.revision = copy.revision;
    const local = window.petDemo.stats();
    const prompt = 'Восстановить «' + copy.pet.name + '» с ' + copy.pet.xp + ' опыта?' +
      (local.onboardingDone ? ' Текущая игра «' + local.name + '» на этом устройстве будет заменена.' : '');
    confirm(() => {
      const text = JSON.stringify(copy.pet);
      const key = 'aki-concept-demo';
      const old = localStorage.getItem(key);
      if (old) localStorage.setItem(key+'.before-restore', old);
      localStorage.setItem(key, text);
      try { localStorage.setItem(key+'.backup', text); } catch { /* primary save is sufficient */ }
      history.replaceState(null, '', '#home'); location.reload();
    }, prompt, 'Восстановить игру');
  });
  find('profileDialog').addEventListener('close', () => { form.elements.password.value = ''; pending = null; });
  if (new URLSearchParams(location.search).get('panel') === 'profile') {
    document.querySelector('#park [data-profile]').click();
  }
})();
