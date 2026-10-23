import crypto from 'node:crypto';
import { db, now, uid, audit } from './db.js';
import { config } from './config.js';

const COOKIE = 'wasit_sid';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, salt, hash] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(expected, got);
  } catch { return false; }
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function passwordProblems(pw) {
  if (!pw || pw.length < 10) return 'كلمة المرور يجب أن تكون 10 أحرف على الأقل';
  return null;
}

export function createUser({ email, name, password, role }) {
  const t = now();
  const id = uid();
  db().prepare('INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, email.trim(), name || '', hashPassword(password), role, t, t);
  return id;
}

export function generateRecoveryCodes(userId) {
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-'));
  const d = db();
  d.transaction(() => {
    d.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    const ins = d.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
    for (const c of codes) ins.run(userId, sha(c.replace(/-/g, '')));
  })();
  return codes;
}

export function createSession(userId, userAgent) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = new Date();
  const exp = new Date(+t + config.sessionDays * 86400000);
  db().prepare('INSERT INTO sessions (id_hash,user_id,user_agent,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?)').run(sha(token), userId, (userAgent || '').slice(0, 200), t.toISOString(), t.toISOString(), exp.toISOString());
  return { token, expires: exp };
}

export function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE, token, { httpOnly: true, secure: config.secureCookies, sameSite: 'lax', path: '/', expires });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.secureCookies, sameSite: 'lax', path: '/' });
}

function readCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// يقرأ الجلسة من قاعدة البيانات في كل طلب. الصلاحية تؤخذ من جدول users، لا من الكعكة.
export function loadSession(req, _res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = db().prepare(`SELECT s.id_hash, s.expires_at, s.last_seen_at, u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`).get(sha(token));
    if (row && row.expires_at > now()) {
      req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
      req.sessionHash = row.id_hash;
      // تمديد منزلق للجلسة مرة في الساعة على الأكثر
      if (Date.now() - Date.parse(row.last_seen_at) > 3600000) {
        const exp = new Date(Date.now() + config.sessionDays * 86400000).toISOString();
        db().prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?').run(now(), exp, row.id_hash);
      }
    }
  }
  next();
}

export const isStaff = (user) => !!user && (user.role === 'owner' || user.role === 'admin');

export function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated', message: 'يلزم تسجيل الدخول' });
  if (!isStaff(req.user)) return res.status(403).json({ error: 'forbidden', message: 'هذا الحساب لا يملك صلاحية الوصول' });
  next();
}

// حماية من الطلبات المزوّرة: كل كتابة على /api تتطلب ترويسة مخصصة لا يرسلها متصفح من موقع آخر،
// ومصدر Origin مطابق إن وُجد.
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-wasit') !== '1') return res.status(403).json({ error: 'csrf', message: 'طلب غير مقبول' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'origin', message: 'طلب من مصدر غير مقبول' });
  next();
}

export function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = (config.trustProxy && req.get('x-forwarded-host')) || req.get('host');
    return o.host === host;
  } catch { return false; }
}

// محدد معدل بسيط في الذاكرة
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || t - b.start > windowMs) { buckets.set(key, { start: t, count: 1 }); return true; }
  b.count++;
  return b.count <= limit;
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (t - b.start > 3600000) buckets.delete(k); }, 600000).unref();

export function attemptLogin(email, password, ip) {
  if (!rateLimit('login-ip:' + ip, 20, 15 * 60000)) return { error: 'محاولات كثيرة، حاول بعد قليل', status: 429 };
  const u = db().prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
  const generic = { error: 'البريد أو كلمة المرور غير صحيحة', status: 401 };
  if (!u) { verifyPassword(password || '', hashPassword('dummy-password-x')); return generic; }
  if (u.locked_until && u.locked_until > now()) return { error: 'الحساب مقفل مؤقتاً بعد محاولات خاطئة، حاول لاحقاً', status: 429 };
  if (!verifyPassword(password || '', u.password_hash)) {
    const f = u.failed_logins + 1;
    const lock = f >= 6 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
    db().prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(lock ? 0 : f, lock, u.id);
    audit(u.id, 'login_failed', 'user', u.id);
    return generic;
  }
  db().prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(u.id);
  audit(u.id, 'login', 'user', u.id);
  return { user: u };
}

export function recoverWithCode(email, code, newPassword, ip) {
  if (!rateLimit('recover-ip:' + ip, 10, 60 * 60000)) return { error: 'محاولات كثيرة، حاول لاحقاً', status: 429 };
  const prob = passwordProblems(newPassword);
  if (prob) return { error: prob, status: 400 };
  const u = db().prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
  if (!u) return { error: 'البيانات غير صحيحة', status: 400 };
  const h = sha(String(code || '').toUpperCase().replace(/[^A-F0-9]/g, ''));
  const rc = db().prepare('SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL').get(u.id, h);
  if (!rc) { audit(u.id, 'recover_failed', 'user', u.id); return { error: 'البيانات غير صحيحة', status: 400 }; }
  db().transaction(() => {
    db().prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?').run(now(), rc.id);
    db().prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(hashPassword(newPassword), now(), u.id);
    db().prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  })();
  audit(u.id, 'recovered', 'user', u.id);
  const left = db().prepare('SELECT COUNT(*) c FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').get(u.id).c;
  return { user: u, codesLeft: left };
}

export function destroySession(hash) { if (hash) db().prepare('DELETE FROM sessions WHERE id_hash = ?').run(hash); }
export function destroyAllSessions(userId) { db().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); }
