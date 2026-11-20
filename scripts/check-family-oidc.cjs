const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, rm } = require('node:fs/promises');
const { createHash, generateKeyPairSync, randomBytes, sign } = require('node:crypto');

const origin = 'https://park.example';
const prefix = '/api/family';
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
const google = { clientId: 'mock-google', secret: 'local-fixture-google', scope: 'openid email', pkce: true, mode: 'query' };
const apple = { clientId: 'mock-apple', secret: 'local-fixture-apple', scope: 'name email', pkce: false, mode: 'form_post' };
const config = { google, apple };
const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const codes = new Map();
let issuer;

function json(response, data, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

async function mock(request, response) {
  if (request.url === '/.well-known/openid-configuration') {
    return json(response, {
      issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token',
      jwks_uri: issuer + '/keys', token_endpoint_auth_methods_supported: ['client_secret_post'],
      id_token_signing_alg_values_supported: ['RS256'], response_types_supported: ['code'],
      subject_types_supported: ['pairwise'], code_challenge_methods_supported: ['S256'],
    });
  }
  if (request.url === '/keys') {
    return json(response, { keys: [{ ...key.publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' }] });
  }
  if (request.url !== '/token') return json(response, {}, 404);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = new URLSearchParams(Buffer.concat(chunks).toString());
  const code = body.get('code');
  const grant = codes.get(code);
  codes.delete(code);
  const provider = Object.values(config).find(item => item.clientId === body.get('client_id'));
  const verifier = body.get('code_verifier');
  if (!grant || !provider || provider.secret !== body.get('client_secret') || grant.aud !== provider.clientId ||
      body.get('redirect_uri') !== grant.redirect ||
      (provider.pkce && (!verifier || createHash('sha256').update(verifier).digest('base64url') !== grant.challenge))) {
    return json(response, { error: 'invalid_grant' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({ alg: 'RS256', kid: 'fixture' }) + '.' + encode({
    iss: issuer, sub: 'fixture-only', aud: grant.aud, iat: now, exp: now + 100, nonce: grant.nonce,
  });
  const idToken = payload + '.' + sign('sha256', Buffer.from(payload), key.privateKey).toString('base64url');
  return json(response, { id_token: idToken, access_token: 'discard-this-fixture', token_type: 'Bearer' });
}

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function run() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'animal-park-oidc-qa-'));
  const provider = http.createServer(mock);
  let app;
  try {
    await listen(provider);
    issuer = 'http://127.0.0.1:' + provider.address().port;
    for (const provider of Object.values(config)) provider.issuer = issuer;
    const { createServer } = await import('vite');
    const { default: familyAccounts } = await import('./family-accounts.js');
    app = await createServer({
      configFile: false, cacheDir: path.join(directory, 'vite'), plugins: [familyAccounts({ directory, oauth: {
        origin, providers: config, trustProxy: true, allowLocalIssuer: true,
      } })],
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, allowedHosts: ['park.example'] },
    });
    await app.listen();
    const base = 'http://127.0.0.1:' + app.httpServer.address().port + prefix;

    function client() {
      const cookies = new Map();
      function call(action, options = {}) {
        const { method = 'GET', body, callback = false } = options;
        const headers = {
          host: 'park.example', 'x-forwarded-proto': 'https',
          cookie: [...cookies.values()].join('; '), origin: callback ? issuer : origin,
        };
        if (options.login !== undefined) headers['x-park-family'] = encodeURIComponent(options.login);
        if (body !== undefined) {
          headers['content-type'] = callback ? 'application/x-www-form-urlencoded' : 'application/json';
        }
        return new Promise((resolve, reject) => {
          const request = http.request(base + action, { method, headers }, async response => {
            const chunks = [];
            for await (const chunk of response) chunks.push(chunk);
            for (const cookie of response.headers['set-cookie'] ?? []) {
              const [value] = cookie.split(';');
              const [name] = value.split('=');
              if (cookie.includes('Max-Age=0')) cookies.delete(name);
              else cookies.set(name, value);
            }
            const body = Buffer.concat(chunks).toString();
            resolve({ status: response.statusCode, headers: response.headers, data: body ? JSON.parse(body) : null });
          });
          request.on('error', reject);
          request.end(body === undefined ? undefined : callback ? body : JSON.stringify(body));
        });
      }
      return call;
    }

    async function enter(call, name, login, cancel = false) {
      const start = await call('/oauth/' + name + '/start', { method: 'POST', body: {}, login });
      assert.equal(start.status, 200);
      const [binding] = start.headers['set-cookie'];
      assert.match(binding, /HttpOnly/);
      assert.match(binding, name === 'apple' ? /SameSite=None; Secure/ : /SameSite=Lax; Secure/);
      const authorization = new URL(start.data.url);
      const params = authorization.searchParams;
      const redirect = new URL(params.get('redirect_uri'));
      assert.equal(redirect.href, origin + prefix + '/oauth/' + name + '/callback');
      assert.equal(params.get('response_mode'), config[name].mode);
      assert.equal(params.has('code_challenge'), name === 'google');
      const code = randomBytes(16).toString('hex');
      codes.set(code, {
        aud: params.get('client_id'), nonce: params.get('nonce'),
        challenge: params.get('code_challenge'), redirect: redirect.href,
      });
      const result = new URLSearchParams({ state: params.get('state'), ...(cancel ? { error: 'access_denied' } : { code }) });
      const callback = '/oauth/' + name + '/callback';
      const answer = name === 'apple'
        ? await call(callback, { method: 'POST', body: result.toString(), callback: true })
        : await call(callback + '?' + result, { callback: true });
      assert.equal(answer.status, 303);
      assert.equal(answer.headers.location, '/demo/index.html?panel=profile' + (cancel ? '&family=cancelled' : '') + '#park');
    }

    const firstDevice = client();
    const secondDevice = client();
    assert.deepEqual((await firstDevice('/session')).data.providers, ['google', 'apple']);
    await enter(firstDevice, 'google', '', true);
    assert.equal((await firstDevice('/session')).data.login, null);
    await enter(firstDevice, 'google', '');
    const family = (await firstDevice('/session')).data;
    assert.ok(family.login.startsWith('@google-'));
    assert.deepEqual(family.linked, ['google']);
    const pet = { name: 'Ричи QA', onboardingDone: true, xp: 12, leaves: 9 };
    assert.equal((await firstDevice('/save', { method: 'POST', body: { pet, revision: 0 }, login: family.login })).status, 200);
    await enter(firstDevice, 'apple', family.login);
    assert.deepEqual((await firstDevice('/session')).data.linked.sort(), ['apple', 'google']);
    const exit = await firstDevice('/logout', { method: 'POST', body: {}, login: family.login });
    assert.equal(exit.status, 200);
    assert.equal((await firstDevice('/session')).data.login, null);
    await enter(secondDevice, 'apple', '');
    assert.equal((await secondDevice('/session')).data.login, family.login);
    assert.deepEqual((await secondDevice('/save', { login: family.login })).data, { pet, revision: 1 });
    console.log('PASS Google code/PKCE, Apple form_post, identity linking, cancellation, session logout and second-device save lookup');
  } finally {
    await app?.close();
    if (issuer) await close(provider);
    if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('animal-park-oidc-qa-')) {
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
