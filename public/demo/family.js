(() => {
  const find = id => document.getElementById(id);
  const dialog = find('profileDialog');
  const section = find('family-account');
  const form = find('family-access');
  const status = find('family-status');
  const signed = find('family-signed');
  const review = find('family-review');
  const retry = find('family-retry');
  const saveButton = find('family-save');
  const restoreButton = find('family-restore');
  let session = { login: null, revision: 0 };
  let registering = false;
  let pending = null;
  let busy = false;
  const names = { google: 'Google', apple: 'Apple' };
  const external = document.createElement('div');
  external.id = 'family-external';
  external.setAttribute('role', 'group');
  external.setAttribute('aria-label', 'Вход через Google и Apple');
  external.style.cssText = 'display:grid;gap:9px;margin-top:9px';
  external.hidden = true;
  const externalStatus = document.createElement('p');
  const providerButtons = Object.entries(names).map(([provider, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'family-' + provider;
    button.onclick = task(async () => {
      const result = await request('oauth/' + provider + '/start', {});
      window.top.location.assign(result.url);
    });
    return [provider, label, button];
  });
  external.append(...providerButtons.map(([, , button]) => button), externalStatus);
  signed.after(external);

  async function request(action, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const options = { cache: 'no-store', credentials: 'same-origin', signal: controller.signal, headers: {} };
      if ((session.login && ['save', 'logout'].includes(action)) || action.startsWith('oauth/')) {
        options.headers['X-Park-Family'] = encodeURIComponent(session.login ?? '');
      }
      if (body !== undefined) {
        options.method = 'POST';
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
      const response = await fetch('/api/family/' + action, options);
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Сервер аккаунтов недоступен. Можно продолжить игру на этом устройстве.');
      }
      const data = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(data.error || 'Не удалось связаться с семейным аккаунтом.'), {
          code: data.code,
          revision: data.revision,
        });
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function paint(message) {
    pending = null;
    form.hidden = Boolean(session.login);
    signed.hidden = !session.login;
    review.hidden = true;
    retry.hidden = true;
    external.hidden = false;
    const missingProviders = [];
    for (const [provider, label, button] of providerButtons) {
      const available = session.providers?.includes(provider);
      const linked = session.linked?.includes(provider);
      button.textContent = linked ? label + ' подключён' : (session.login ? 'Подключить ' : 'Войти через ') + label;
      button.disabled = !available || linked;
      if (!available && !linked) missingProviders.push(label);
    }
    externalStatus.hidden = missingProviders.length === 0;
    externalStatus.textContent = 'Недоступные способы входа · ' + missingProviders.join(', ');
    restoreButton.disabled = !session.revision;
    saveButton.disabled = !window.petDemo.stats().onboardingDone;
    const login = Object.keys(names).find(provider => session.login?.startsWith('@' + provider + '-'));
    status.textContent = message ?? (session.login
      ? 'Выполнен вход · ' + (login ? names[login] : session.login) + (session.revision ? '' : '. В аккаунте пока нет сохранения.')
      : 'Взрослый может сохранить игру в аккаунте и перенести её на другое устройство.');
    find('family-submit').textContent = registering ? 'Создать аккаунт' : 'Войти';
    find('family-mode').textContent = registering ? 'Уже есть аккаунт' : 'Создать аккаунт';
    form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  }

  async function connect() {
    pending = null;
    form.hidden = review.hidden = signed.hidden = external.hidden = true;
    retry.hidden = false;
    status.textContent = 'Подключение…';
    session = await request('session');
    paint(entryNotice);
    entryNotice = undefined;
  }

  function task(action) {
    return async event => {
      event?.preventDefault();
      if (busy) return;
      busy = true;
      section.setAttribute('aria-busy', 'true');
      try {
        await action();
      } catch (error) {
        if (error.code === 'save_conflict') {
          session.revision = error.revision ?? session.revision;
          paint(error.message);
          saveButton.focus();
        } else if (error.code === 'session_changed') {
          pending = null;
          form.hidden = review.hidden = signed.hidden = external.hidden = true;
          retry.hidden = false;
          status.textContent = error.message;
          retry.focus();
        } else {
          status.textContent = error instanceof TypeError || error.name === 'AbortError'
            ? 'Нет связи с сервером. Можно продолжить игру на этом устройстве.'
            : error.message;
        }
      } finally {
        busy = false;
        section.removeAttribute('aria-busy');
      }
    };
  }

  const open = task(connect);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-profile]')) open();
  });
  retry.onclick = open;
  find('family-mode').onclick = () => {
    if (busy) return;
    registering = !registering;
    paint();
  };
  form.onsubmit = task(async () => {
    session = await request(registering ? 'register' : 'login', {
      login: form.elements.login.value,
      password: form.elements.password.value,
    });
    form.reset();
    registering = false;
    paint();
  });
  find('family-logout').onclick = task(async () => {
    await request('logout', {});
    session = { login: null, revision: 0, providers: session.providers };
    paint();
  });

  function confirm(action, message, caption, opener) {
    pending = { action, opener };
    signed.hidden = true;
    external.hidden = true;
    find('family-comparison').textContent = message;
    find('family-confirm').textContent = caption;
    review.hidden = false;
    find('family-cancel').focus();
  }

  find('family-cancel').onclick = () => {
    if (busy || !pending) return;
    const { opener } = pending;
    paint();
    opener.focus();
  };
  find('family-confirm').onclick = task(async () => {
    if (pending) await pending.action();
  });

  async function save(revision, pet) {
    const result = await request('save', { revision, pet });
    session.revision = result.revision;
    paint(pet.name + ' сохранён в семейном аккаунте.');
    saveButton.focus();
  }

  function describe(pet) {
    return '«' + pet.name + '» · опыт ' + pet.xp + ' · листья ' + pet.leaves;
  }

  saveButton.onclick = task(async () => {
    const copy = await request('save');
    const pet = window.petDemo.stats();
    session.revision = copy.revision;
    if (!copy.pet) {
      await save(copy.revision, pet);
      return;
    }
    confirm(
      () => save(copy.revision, pet),
      'Заменить сохранение в аккаунте? В аккаунте ' + describe(copy.pet) + '. На устройстве ' + describe(pet) + '.',
      'Заменить сохранение',
      saveButton
    );
  });

  function restore(pet) {
    const key = 'aki-concept-demo';
    const record = JSON.stringify(pet);
    try {
      const local = localStorage.getItem(key) ?? localStorage.getItem(key + '.backup');
      if (local) localStorage.setItem(key + '.before-restore', local);
      localStorage.setItem(key, record);
    } catch {
      throw new Error('Не удалось записать игру на этом устройстве. Проверьте, доступно ли хранилище браузера.');
    }
    try { localStorage.setItem(key + '.backup', record); } catch { /* The primary save is already written. */ }
    history.replaceState(history.state, '', '#home');
    location.reload();
  }

  restoreButton.onclick = task(async () => {
    const copy = await request('save');
    session.revision = copy.revision;
    if (!copy.pet) {
      paint();
      return;
    }
    const local = window.petDemo.stats();
    const comparison = 'Восстановить игру из аккаунта? В аккаунте ' + describe(copy.pet) + '.' +
      (local.onboardingDone ? ' На устройстве ' + describe(local) + '. Эта игра будет заменена.' : '');
    confirm(() => restore(copy.pet), comparison, 'Восстановить игру', restoreButton);
  });

  dialog.addEventListener('close', () => {
    form.elements.password.value = '';
    pending = null;
  });
  const entry = new URL(location.href);
  const notices = {
    cancelled: 'Вход через провайдера отменён.',
    failed: 'Не удалось войти через провайдера. Попробуйте ещё раз или войдите по паролю.',
    linked_elsewhere: 'Не удалось подключить этот аккаунт. Возможно, он уже связан с другой семьёй.',
  };
  let entryNotice = Object.hasOwn(notices, entry.searchParams.get('family')) ? notices[entry.searchParams.get('family')] : undefined;
  if (entry.searchParams.get('panel') === 'profile') {
    entry.searchParams.delete('panel');
    entry.searchParams.delete('family');
    history.replaceState(history.state, '', entry);
    find('guide-profile')?.click();
  }
})();
