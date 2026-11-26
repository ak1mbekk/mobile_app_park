const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { createContext, runInContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../public/demo/guide-worker.js'), 'utf8');
const scope = 'https://guide.example/demo/';
const origin = new URL(scope).origin;
const currentCache = source.match(/const cacheName = '([^']+)'/)[1];
const catalogue = JSON.stringify([{slug:'alpaka', name:'Альпака', category:'Млекопитающие'}]);

function worker({ fetch, failOpen = false, put, saved, cacheKeys = [] }) {
  const listeners = new Map();
  const deleted = [];
  const match = async () => saved?.();
  const context = createContext({
    URL, Request, Response, AbortController, fetch, setTimeout, clearTimeout, location: { origin },
    importScripts(file) {
      assert.equal(file,'audio-stops.js');
      runInContext(readFileSync(join(__dirname, '../public/demo', file), 'utf8'), context);
    },
    caches: {
      async open() {
        if (failOpen) throw new Error('Cache storage unavailable');
        return {match, put};
      },
      match,
      keys: async () => cacheKeys,
      delete: async key => { deleted.push(key); },
    },
    self: {
      registration: {scope},
      clients: {claim: async () => {}},
      addEventListener(name, listener) { listeners.set(name, listener); },
    },
  });
  runInContext(source, context);

  return {
    request(path, options, mode) {
      let response;
      const work = [];
      const request = new Request(new URL(path, scope), options);
      if (mode) Object.defineProperty(request, 'mode', {value:mode});
      listeners.get('fetch')({
        request,
        respondWith(promise) { response = promise; },
        waitUntil(promise) { work.push(promise); },
      });
      return {response, settled: () => Promise.all(work)};
    },
    async activate() {
      const work = [];
      listeners.get('activate')({waitUntil(promise) { work.push(promise); }});
      await Promise.all(work);
      return deleted;
    },
  };
}

test('a failed cache write cannot replace a successful online response', async () => {
  const app = worker({
    fetch: async () => new Response(catalogue),
    put: async () => { throw new DOMException('Cache is full', 'QuotaExceededError'); },
    saved: () => new Response('saved'),
  });
  const {response, settled} = app.request('catalogue.json');
  assert.equal(await (await response).text(), catalogue);
  await settled();
});

test('online content works when cache storage is unavailable', async () => {
  const app = worker({fetch: async () => new Response(catalogue), failOpen: true});
  const {response, settled} = app.request('catalogue.json');
  assert.equal(await (await response).text(), catalogue);
  await settled();
});

test('a slow cache write runs independently of the online response', {timeout:3000}, async () => {
  let finishWrite;
  let startWrite;
  const started = new Promise(resolve => { startWrite = resolve; });
  let delivered = false;
  const app = worker({
    fetch: async () => new Response(catalogue),
    put: async () => {
      startWrite();
      await new Promise(resolve => { finishWrite = resolve; });
    },
  });
  const {response, settled} = app.request('catalogue.json');
  const result = response.then(value => { delivered = true; return value; });
  try {
    await started;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(delivered, true);
  } finally {
    finishWrite?.();
  }
  assert.equal(await (await result).text(), catalogue);
  await settled();
});

test('offline audio supports a byte range from the saved recording', async () => {
  const app = worker({
    fetch: async () => { throw new TypeError('Network unavailable'); },
    saved: () => new Response(new Uint8Array([10, 20, 30, 40, 50])),
  });
  const {response} = app.request('assets/audio/llama.mp3', {headers: {Range: 'bytes=1-3'}});
  const part = await response;
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('Content-Range'), 'bytes 1-3/5');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [20, 30, 40]);
});

test('a server failure falls back to saved data', async () => {
  const app = worker({
    fetch: async () => new Response('unavailable', {status: 503}),
    saved: () => new Response('saved'),
  });
  assert.equal(await (await app.request('catalogue.json').response).text(), 'saved');
});

test('without a saved copy, the server status reaches the caller', async () => {
  const app = worker({fetch: async () => new Response('unavailable', {status: 503})});
  const {response} = app.request('catalogue.json');
  assert.equal((await response).status, 503);
});

test('schema-invalid JSON cannot overwrite the last valid programme', async () => {
  let writes = 0;
  const saved = JSON.stringify({verifiedOn:'2026-11-19', daily:[], byDate:{}});
  const app = worker({
    fetch: async () => new Response('{}'),
    saved: () => new Response(saved),
    put: async () => { writes++; },
  });
  const {response, settled} = app.request('feeding-programme.json');
  assert.equal(await (await response).text(), saved);
  await settled();
  assert.equal(writes, 0);
});

test('a stalled network request with a saved copy is cancelled', async () => {
  const app = worker({
    fetch: async (_url, {signal}) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {once:true});
    }),
    saved: () => new Response('stored map'),
  });
  const {response} = app.request('map.html?view=3d');
  assert.equal(await (await response).text(), 'stored map');
});

test('navigation uses the page from the same installed release as its stylesheet', async () => {
  let requests = 0;
  const app = worker({
    fetch: async () => { requests++; return new Response('new release'); },
    saved: () => new Response('installed release'),
  });
  assert.equal(await (await app.request('index.html', undefined, 'navigate').response).text(), 'installed release');
  assert.equal(requests, 0);
});

test('pinned manifest URLs do not fall back to a different revision', () => {
  const app = worker({saved: () => new Response(catalogue)});
  assert.equal(app.request('catalogue.json?v=old').response, undefined);
});

test('activation removes obsolete guide caches and keeps sibling app data', async () => {
  const oldGuide = 'animal-park-map:zoo-guide5';
  const sibling = 'animal-park-tickets:offline';
  const app = worker({cacheKeys: [oldGuide, currentCache, sibling]});
  assert.deepEqual(await app.activate(), [oldGuide]);
});
