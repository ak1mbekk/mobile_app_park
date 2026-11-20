import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import * as oidc from 'openid-client';

const localAddresses = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);
const MAX_AGE = 600;
const oauthRoot = '/api/family/oauth';
const profile = '/demo/index.html?panel=profile';
const hash = value => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const providerSettings = {
  google: { issuer: 'https://accounts.google.com', scope: 'openid email', pkce: true, mode: 'query' },
  apple: { issuer: 'https://appleid.apple.com', scope: 'name email', pkce: false, mode: 'form_post' },
};

function configuredProviders() {
  return Object.fromEntries(Object.entries(providerSettings).map(([id, value]) => {
    const prefix = 'ANIMAL_PARK_' + id.toUpperCase();
    return [id, { ...value, clientId: process.env[prefix + '_CLIENT_ID'], secret: process.env[prefix + '_CLIENT_SECRET'] }];
  }));
}

function parsePublicOrigin(text) {
  try {
    const url = new URL(text);
    if (url.origin === text && (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))) return url;
  } catch { /* Configuration is optional. */ }
  return null;
}

export function familyOidc({
  origin = process.env.ANIMAL_PARK_FAMILY_ORIGIN,
  trustProxy = process.env.ANIMAL_PARK_FAMILY_TRUST_PROXY === '1',
  providers = configuredProviders(),
  allowLocalIssuer = false,
} = {}) {
  const publicUrl = parsePublicOrigin(origin);
  const configs = new Map();

  function isTls(req) {
    return Boolean(req.socket.encrypted) || (
      trustProxy && publicUrl?.protocol === 'https:' && req.headers.host === publicUrl.host &&
      localAddresses.has(req.socket.remoteAddress) && req.headers['x-forwarded-proto'] === 'https'
    );
  }

  function active(provider, requestOrigin) {
    if (!publicUrl || requestOrigin !== publicUrl.origin) return false;
    if (provider === 'apple' && (
      publicUrl.protocol !== 'https:' || !publicUrl.hostname.includes('.') || isIP(publicUrl.hostname)
    )) return false;
    return Boolean(providers[provider]?.clientId && providers[provider]?.secret);
  }

  function sessionDetails(db, user, requestOrigin) {
    const available = Object.keys(providerSettings).filter(provider => active(provider, requestOrigin));
    if (!available.length) return {};
    const linked = user ? db.prepare('SELECT provider FROM family_identities WHERE family=?').all(user.id).map(row => row.provider) : [];
    return { providers: available, linked };
  }

  function configuration(provider) {
    if (!configs.has(provider)) {
      const config = providers[provider];
      const execute = [oidc.enableNonRepudiationChecks];
      if (allowLocalIssuer) execute.unshift(oidc.allowInsecureRequests);
      configs.set(provider, oidc.discovery(
        new URL(config.issuer), config.clientId,
        { client_secret: config.secret, id_token_signed_response_alg: 'RS256' },
        oidc.ClientSecretPost(config.secret), { execute },
      ).then(verified => {
        verified.timeout = 7;
        return verified;
      }).catch(error => {
        configs.delete(provider);
        throw error;
      }));
    }
    return configs.get(provider);
  }

  function flowCookie(provider, value, age, tls) {
    const crossSite = providers[provider].mode === 'form_post';
    return 'park_oidc_' + provider + '=' + value + '; Path=' + oauthRoot + '/' + provider + '; Max-Age=' + age +
      '; HttpOnly; SameSite=' + (crossSite ? 'None' : 'Lax') + (tls ? '; Secure' : '');
  }

  async function start(provider, { db, user, tokenHash, res, tls, send }) {
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const binding = randomToken();
    const config = providers[provider];
    const verifier = config.pkce ? oidc.randomPKCECodeVerifier() : null;
    const authorization = {
      redirect_uri: publicUrl.origin + oauthRoot + '/' + provider + '/callback',
      scope: config.scope,
      response_mode: config.mode,
      state,
      nonce,
    };
    if (provider === 'google') authorization.prompt = 'select_account';
    if (verifier) {
      authorization.code_challenge = await oidc.calculatePKCECodeChallenge(verifier);
      authorization.code_challenge_method = 'S256';
    }
    const url = oidc.buildAuthorizationUrl(await configuration(provider), authorization);
    const now = Date.now();
    db.prepare('DELETE FROM family_oidc_attempts WHERE expires<=?').run(now);
    db.prepare('INSERT INTO family_oidc_attempts VALUES (?,?,?,?,?,?,?)').run(
      hash(state), provider, hash(binding), nonce, verifier, user ? tokenHash : null, now + MAX_AGE * 1000,
    );
    res.setHeader('Set-Cookie', flowCookie(provider, binding, MAX_AGE, tls));
    return send(200, { url: url.href });
  }

  function familyForIdentity(db, provider, key, priorSession) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const linked = db.prepare('SELECT family FROM family_identities WHERE provider=? AND identity=?').get(provider, key);
      let family = linked?.family;
      if (priorSession) {
        const current = db.prepare('SELECT family FROM sessions WHERE token=? AND expires>?').get(priorSession, Date.now());
        if (!current || (linked && linked.family !== current.family)) return null;
        if (db.prepare('SELECT 1 FROM family_identities WHERE family=? AND provider=? AND identity<>?').get(current.family, provider, key)) return null;
        family = current.family;
      }
      if (!family) {
        family = db.prepare('INSERT INTO families(login,salt,verifier) VALUES (?,?,?)').run(
          '@' + provider + '-' + randomToken(), '', '',
        ).lastInsertRowid;
      }
      if (!linked) db.prepare('INSERT INTO family_identities VALUES (?,?,?)').run(provider, key, family);
      db.exec('COMMIT');
      return family;
    } finally {
      if (db.isTransaction) db.exec('ROLLBACK');
    }
  }

  async function callback(provider, { db, req, res, tls, readPayload, getCookie, createSession }) {
    const redirect = notice => {
      res.writeHead(303, { Location: profile + (notice ? '&family=' + notice : '') + '#park', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      res.end();
    };
    const config = providers[provider];
    if (req.method !== (config.mode === 'form_post' ? 'POST' : 'GET')) return redirect('failed');
    const current = new URL(publicUrl.origin + oauthRoot + '/' + provider + '/callback');
    current.search = new URL(req.url, publicUrl.origin).search;
    try {
      let input = current;
      let params = current.searchParams;
      if (config.mode === 'form_post') {
        if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') return redirect('failed');
        const body = await readPayload(req, 8192);
        params = new URLSearchParams(body);
        input = new Request(current, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
        });
      }
      const state = params.get('state');
      const binding = getCookie(req, 'park_oidc_' + provider);
      if (!state || !binding) return redirect('failed');
      const attempt = db.prepare(
        'DELETE FROM family_oidc_attempts WHERE state=? AND provider=? AND binding=? AND expires>? RETURNING *',
      ).get(hash(state), provider, hash(binding), Date.now());
      if (!attempt) return redirect('failed');
      res.setHeader('Set-Cookie', flowCookie(provider, '', 0, tls));
      if (params.has('error')) return redirect(
        ['access_denied', 'user_cancelled_authorize'].includes(params.get('error')) ? 'cancelled' : 'failed',
      );
      const verified = await oidc.authorizationCodeGrant(await configuration(provider), input, {
        expectedState: state, expectedNonce: attempt.nonce, idTokenExpected: true,
        ...(attempt.verifier ? { pkceCodeVerifier: attempt.verifier } : {}),
      });
      const claims = verified.claims();
      if (!claims?.sub || !claims.iss) return redirect('failed');
      const family = familyForIdentity(db, provider, hash(claims.iss + '\0' + claims.sub), attempt.session);
      if (!family) return redirect('linked_elsewhere');
      createSession(family, attempt.session);
      return redirect();
    } catch {
      return redirect('failed');
    }
  }

  async function handle(action, context) {
    const match = /^\/oauth\/(google|apple)\/(start|callback)$/.exec(action);
    if (!match) return context.send(404, {});
    const [, provider, operation] = match;
    if (!active(provider, context.requestOrigin)) {
      return context.send(503, { error: 'Этот способ входа пока недоступен.' });
    }
    if (operation === 'callback') return callback(provider, context);
    if (!context.change) return context.send(405, {});
    if (context.req.headers['x-park-family'] !== encodeURIComponent(context.user?.login ?? '')) {
      return context.send(401, { code: 'session_changed', error: 'Вход в аккаунт изменился. Подключитесь заново.' });
    }
    return start(provider, context);
  }

  return { handle, isTls, sessionDetails };
}
