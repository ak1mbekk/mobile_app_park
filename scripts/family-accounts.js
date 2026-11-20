import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const scrypt = promisify(derive);
const cookie = 'park_family';
const lifetime = 30 * 86400;
const limit = 80000;
const digest = value => createHash('sha256').update(value).digest('hex');

async function readBody(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw { status: 413 };
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw { status: 400 }; }
}

// Separate from staff authentication. The browser explicitly saves or restores a family snapshot.
export default function familyAccounts({ directory } = {}) {
  const attempts = new Map();
  let database;
  async function open(root) {
    if (!database) database = import('node:sqlite').then(({ DatabaseSync }) => {
      const dir = directory ?? process.env.ANIMAL_PARK_FAMILY_DIR ?? path.resolve(root, '..', '.animal-park-private');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const db = new DatabaseSync(path.join(dir, 'families.sqlite'));
      db.exec(`PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS families(
          id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL, salt TEXT NOT NULL,
          verifier TEXT NOT NULL, snapshot TEXT, revision INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sessions(
          token TEXT PRIMARY KEY, family INTEGER NOT NULL REFERENCES families(id), expires INTEGER NOT NULL
        );`);
      return db;
    }).catch(error => { database = undefined; throw error; });
    return database;
  }
  function install(server) {
    server.httpServer?.once('close', () => {
      database?.then(db => db.close()).catch(() => {});
      database = undefined;
    });
    server.middlewares.use('/api/family', async (req, res) => {
      const send = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(JSON.stringify(data));
      };
      try {
        const address = req.socket.remoteAddress;
        const tls = Boolean(req.socket.encrypted);
        if (!tls && !['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(address)) return send(403, { error: 'Для входа с телефона нужен HTTPS.' });
        const action = req.url.split('?')[0];
        const change = req.method === 'POST';
        if (!change && req.method !== 'GET') return send(405, {});
        if (change && (req.headers.origin !== (tls ? 'https://' : 'http://') + req.headers.host ||
            req.headers['content-type']?.split(';')[0] !== 'application/json')) return send(403, {});
        const db = await open(server.config.root);
        const now = Date.now();
        const key = req.headers.cookie?.split(/;\s*/).find(entry => entry.startsWith(cookie+'='))?.slice(cookie.length+1);
        const user = key && db.prepare('SELECT f.id,f.login,f.revision FROM sessions s JOIN families f ON f.id=s.family WHERE s.token=? AND s.expires>?').get(digest(key), now);
        const options = '; Path=/api/family; HttpOnly; SameSite=Strict' + (tls ? '; Secure' : '');
        if (!change && action === '/session') return send(200, { login: user?.login ?? null, revision: user?.revision ?? 0 });
        if (change && (action === '/login' || action === '/register')) {
          const body = await readBody(req);
          const login = typeof body?.login === 'string' ? body.login.trim().toLowerCase() : '';
          const pass = body?.password;
          if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(login) || typeof pass !== 'string' || pass.length < 10 || pass.length > 128)
            return send(422, { error: 'Логин — 3–32 буквы, цифры или знаки . _ -. Пароль — 10–128 символов.' });
          for (const [ip, bucket] of attempts) if (bucket.end <= now) attempts.delete(ip);
          const bucket = attempts.get(address) ?? { end: now + 600000, count: 0 };
          attempts.set(address, bucket);
          if (++bucket.count > 20) return send(429, { error: 'Слишком много попыток. Попробуйте через 10 минут.' });
          let row = db.prepare('SELECT id,salt,verifier,revision FROM families WHERE login=?').get(login);
          const salt = action === '/register' || !row ? randomBytes(16).toString('hex') : row.salt;
          const verifier = await scrypt(pass, salt, 64);
          if (action === '/register') {
            const inserted = db.prepare('INSERT INTO families(login,salt,verifier) VALUES (?,?,?) ON CONFLICT(login) DO NOTHING').run(login,salt,verifier.toString('hex'));
            if (!inserted.changes) return send(409, { error: 'Этот логин занят.' });
            row = { id: inserted.lastInsertRowid, revision: 0 };
          } else if (!row || !timingSafeEqual(verifier, Buffer.from(row.verifier, 'hex'))) {
            return send(401, { error: 'Проверьте логин и пароль.' });
          }
          if (key) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(key));
          db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
          const token = randomBytes(32).toString('hex');
          db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), row.id, now + lifetime*1000);
          res.setHeader('Set-Cookie', cookie+'='+token+options+'; Max-Age='+lifetime);
          return send(200, { login, revision: row.revision });
        }
        if (!user) return send(401, {});
        if (change && action === '/logout') {
          db.prepare('DELETE FROM sessions WHERE token=?').run(digest(key));
          res.setHeader('Set-Cookie', cookie+'='+options+'; Max-Age=0');
          return send(200, {});
        }
        if (action !== '/save') return send(404, {});
        if (!change) {
          const row = db.prepare('SELECT snapshot,revision FROM families WHERE id=?').get(user.id);
          return send(200, { pet: row.snapshot ? JSON.parse(row.snapshot) : null, revision: row.revision });
        }
        const body = await readBody(req);
        const pet = body?.pet;
        if (!Number.isSafeInteger(body?.revision) || !pet || pet.onboardingDone !== true ||
            typeof pet.name !== 'string' || !pet.name.trim() || pet.name.length > 24 ||
            ![pet.xp,pet.leaves].every(n => Number.isSafeInteger(n) && n >= 0))
          return send(422, { error: 'Сначала познакомьтесь с енотом и дайте ему имя.' });
        const result = db.prepare('UPDATE families SET snapshot=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(pet),user.id,body.revision);
        if (!result.changes) return send(409, { error: 'С другого устройства уже сохранили игру. Заново откройте профиль и выберите нужное сохранение.' });
        send(200, { revision: body.revision + 1 });
      } catch (error) { send(error.status ?? 503, { error: 'Не удалось выполнить запрос к семейному профилю.' }); }
    });
  }
  return { name: 'park-family-accounts', configureServer: install, configurePreviewServer: install };
}
