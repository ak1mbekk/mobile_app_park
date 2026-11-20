(() => {
  const base = new URL('./', location.href);
  const { pack, wasm } = document.currentScript.dataset;
  const paths = new Map([['index.pck', pack], ['index.wasm', wasm]]);
  const download = window.fetch.bind(window);
  let cache;
  try {
    cache = window.caches?.open('animal-park-godot:' + base.href).catch(() => null);
  } catch {}
  const controller = new AbortController();
  window.addEventListener('pagehide', event => {
    if (!event.persisted) controller.abort();
  });

  // The generated Godot loader fetches the pack and engine by their original
  // filenames. Use the build's content-addressed URLs without changing the loader.
  window.fetch = async (input, options) => {
    if (!paths.has(input) || options !== undefined) {
      return download(input, options);
    }

    const key = new URL(input, base).href;
    const source = new URL(paths.get(input), base).href;
    const storage = await cache;
    const saved = await storage?.match(key).catch(() => undefined);
    if (saved?.url === source) return saved;

    const response = await download(source, { signal: controller.signal });
    if (storage && response.status === 200 && response.url === source &&
        !response.headers.get('Content-Type')?.startsWith('text/html')) {
      // A completed put atomically replaces the previous version of this file.
      void storage.put(key, response.clone()).catch(() => {});
    }
    return response;
  };
})();
