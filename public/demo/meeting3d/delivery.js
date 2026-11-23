(() => {
  const base = new URL('./', location.href);
  const { pack, wasm, home } = document.currentScript.dataset;
  const query = new URLSearchParams(location.search);
  const paths = new Map([['index.pck', pack], ['index.wasm', wasm]].filter(([, value]) => value));
  const download = window.fetch.bind(window);
  let cache;
  // Capacitor ships the engine and both packs inside the installed application.
  if (query.get('bundled') !== '1') {
    try {
      cache = window.caches?.open('animal-park-godot:' + base.href).catch(() => null);
    } catch {}
  }
  const controller = new AbortController();
  window.addEventListener('pagehide', event => {
    if (!event.persisted) controller.abort();
  });

  // The generated Godot loader fetches the pack and engine by their original
  // filenames. Use the build's content-addressed URLs without changing the loader.
  async function fetchFile(name, file, reload = false) {
    const key = new URL(name, base).href;
    const source = new URL(file, base).href;
    const storage = file !== name ? await cache : null;
    const saved = !reload && await storage?.match(key).catch(() => undefined);
    if (saved?.url === source) return saved;

    const response = await download(source, { signal: controller.signal, cache: reload ? 'reload' : 'default' });
    if (storage && response.status === 200 && response.url === source &&
        !response.headers.get('Content-Type')?.startsWith('text/html')) {
      // A completed put atomically replaces the previous version of this file.
      void storage.put(key, response.clone()).catch(() => {});
    }
    return response;
  }

  window.fetch = (input, options) => paths.has(input) && options === undefined
    ? fetchFile(input, paths.get(input))
    : download(input, options);

  if (!home) return;
  let payload;
  let mounting;
  let reload = false;

  function readHome() {
    if (!payload) {
      payload = fetchFile('home.pck', home, reload).then(async response => {
        if (response.status !== 200) throw new Error('Home pack HTTP ' + response.status);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length < 4 || bytes[0] !== 71 || bytes[1] !== 68 || bytes[2] !== 80 || bytes[3] !== 67) {
          throw new Error('Invalid Godot home pack');
        }
        return bytes;
      }).catch(error => {
        payload = undefined;
        reload = true;
        throw error;
      });
    }
    return payload;
  }

  const loader = window.parkHomePack = {
    state: 'idle',
    ensure() {
      if (this.state === 'ready') return Promise.resolve();
      if (mounting) return mounting;
      this.state = 'loading';
      mounting = readHome().then(bytes => {
        // The generated shell initializes its Engine before Godot requests Home.
        engine.copyToFS('/park-home.pck', bytes);
        this.state = 'ready';
        payload = undefined;
      }).catch(error => {
        this.rejectMount();
        throw error;
      }).finally(() => { mounting = undefined; });
      return mounting;
    },
    rejectMount() {
      this.state = 'failed';
      reload = true;
      payload = undefined;
    },
  };

  function prefetch() {
    if (loader.state === 'idle' && !controller.signal.aborted) void readHome().catch(() => {});
  }
  if (query.get('host') === 'animal-park' && query.get('scene') === 'home') prefetch();
  else window.addEventListener('park-intro-visible', () => setTimeout(prefetch, 1000), { once: true });
})();
