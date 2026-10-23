import express from 'express';
import multer from 'multer';
import { db, now, uid, getSettings, audit } from './db.js';
import { config } from './config.js';
import { ENTITIES, createRow, updateRow, getRow, syncSince, HttpError, parseRow, touchRow } from './entities.js';
import { requireStaff, attemptLogin, createSession, setSessionCookie, clearSessionCookie, destroySession, destroyAllSessions, recoverWithCode, isStaff, verifyPassword, hashPassword, passwordProblems, rateLimit } from './auth.js';
import { publishProperty, unpublishProperty, refreshIfPublished, syncPublicSettings, publishProblems } from './publish.js';
import { storeUpload, sendPrivateFile } from './media.js';
import { buildWorkbook } from './export.js';
import { createBackup } from './backup.js';
import * as whatsapp from './whatsapp.js';
import { parseCapture, buildGazetteer } from '../shared/capture.js';
import { computeToday } from '../shared/today.js';
import { searchStore, personDuplicates, propertyDuplicates } from '../shared/search.js';
import { matchRequestProperty, rankMatches } from '../shared/matching.js';
import { parseLocation, SHORT_LINK_HOSTS } from '../shared/geolink.js';
import { normalizePhone } from '../shared/phone.js';
import { DEFAULT_SETTINGS } from './defaults.js';

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMB * 1024 * 1024, files: 1 } });

// كل كتابة تحمل x-op-id؛ إعادة إرسال العملية نفسها بعد انقطاع تُرجع النتيجة المحفوظة ولا تُنفّذ مرتين
function idempotent(req, res, next) {
  if (['GET', 'HEAD'].includes(req.method)) return next();
  const op = req.get('x-op-id');
  if (!op) return next();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(op)) return res.status(400).json({ error: 'bad_op' });
  const prev = db().prepare('SELECT status, response FROM client_ops WHERE op_id = ?').get(op);
  if (prev) { res.set('x-op-replayed', '1'); return res.status(prev.status).type('json').send(prev.response); }
  const json = res.json.bind(res);
  res.json = (body) => {
    // نحفظ النجاحات والأخطاء النهائية فقط (لا 5xx ولا 409 حتى يمكن إعادة المحاولة بعد الحل)
    if (res.statusCode < 500 && res.statusCode !== 409 && res.statusCode !== 401) {
      try { db().prepare('INSERT OR IGNORE INTO client_ops (op_id, status, response, created_at) VALUES (?, ?, ?, ?)').run(op, res.statusCode, JSON.stringify(body), now()); } catch {}
    }
    return json(body);
  };
  next();
}

function loadStore() {
  const out = syncSince(null);
  out.wilayas = db().prepare('SELECT * FROM wilayas ORDER BY sort').all().map((w) => ({ ...w, aliases: JSON.parse(w.aliases) }));
  out.moughataas = db().prepare('SELECT * FROM moughataas').all().map((m) => ({ ...m, aliases: JSON.parse(m.aliases) }));
  return out;
}

function gazetteerFrom(store) {
  return buildGazetteer({ wilayas: store.wilayas, moughataas: store.moughataas, areas: (store.areas || []).filter((a) => !a.archived_at) });
}

export function authRouter() {
  const r = express.Router();
  r.get('/me', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.user ? { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role } : null, staff: isStaff(req.user) });
  });
  r.post('/login', (req, res) => {
    const out = attemptLogin(req.body?.email, req.body?.password, req.ip);
    if (out.error) return res.status(out.status).json({ error: 'login', message: out.error });
    if (!isStaff(out.user)) return res.status(403).json({ error: 'forbidden', message: 'هذا الحساب لا يملك صلاحية الوصول إلى مساحة الإدارة' });
    const { token, expires } = createSession(out.user.id, req.get('user-agent'));
    setSessionCookie(res, token, expires);
    res.json({ ok: true, user: { id: out.user.id, email: out.user.email, name: out.user.name, role: out.user.role } });
  });
  r.post('/logout', (req, res) => { destroySession(req.sessionHash); clearSessionCookie(res); res.json({ ok: true }); });
  r.post('/logout-all', requireStaff, (req, res) => { destroyAllSessions(req.user.id); clearSessionCookie(res); audit(req.user.id, 'logout_all', 'user', req.user.id); res.json({ ok: true }); });
  r.post('/recover', (req, res) => {
    const out = recoverWithCode(req.body?.email, req.body?.code, req.body?.password, req.ip);
    if (out.error) return res.status(out.status).json({ error: 'recover', message: out.error });
    res.json({ ok: true, codesLeft: out.codesLeft });
  });
  r.post('/password', requireStaff, (req, res) => {
    const u = db().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(req.body?.current || '', u.password_hash)) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
    const prob = passwordProblems(req.body?.next);
    if (prob) return res.status(400).json({ message: prob });
    db().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(req.body.next), now(), u.id);
    db().prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').run(u.id, req.sessionHash);
    audit(u.id, 'password_changed', 'user', u.id);
    res.json({ ok: true });
  });
  return r;
}

export function adminRouter() {
  const r = express.Router();
  r.use(requireStaff);
  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  r.use(idempotent);

  r.get('/sync', (req, res) => {
    const since = typeof req.query.since === 'string' && req.query.since ? req.query.since : null;
    const serverTime = now();
    const data = syncSince(since);
    if (!since) {
      data.wilayas = db().prepare('SELECT * FROM wilayas ORDER BY sort').all().map((w) => ({ ...w, aliases: JSON.parse(w.aliases) }));
      data.moughataas = db().prepare('SELECT * FROM moughataas').all().map((m) => ({ ...m, aliases: JSON.parse(m.aliases) }));
    }
    res.json({ server_time: serverTime, full: !since, data });
  });

  r.get('/settings', (req, res) => res.json({ settings: getSettings(), preview: config.preview, whatsapp_configured: whatsapp.isConfigured() }));
  r.put('/settings', (req, res) => {
    const allowed = Object.keys(DEFAULT_SETTINGS);
    const up = db().prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
    const body = req.body || {};
    db().transaction(() => { for (const k of allowed) if (k in body) up.run(k, JSON.stringify(body[k]), now()); })();
    syncPublicSettings();
    audit(req.user.id, 'settings', 'settings', null, Object.keys(body).join(','));
    res.json({ settings: getSettings() });
  });

  r.get('/today', (req, res) => {
    const s = getSettings();
    res.json(computeToday(loadStore(), { staleDays: s.stale_days || 30 }));
  });

  r.get('/search', (req, res) => res.json({ results: searchStore(loadStore(), req.query.q, { includeArchived: req.query.archived === '1' }) }));

  r.get('/duplicates/person', (req, res) => res.json({ results: personDuplicates(loadStore(), { name: req.query.name, phone: req.query.phone, excludeId: req.query.exclude }) }));
  r.get('/duplicates/property', (req, res) => {
    const q = req.query;
    res.json({ results: propertyDuplicates(loadStore(), { lot_number: q.lot, plan: q.plan, sector: q.sector, moughataa_code: q.moughataa, lat: q.lat ? +q.lat : null, lng: q.lng ? +q.lng : null, type: q.type, excludeId: q.exclude }) });
  });

  r.get('/matches/request/:id', (req, res) => {
    const store = loadStore();
    const rq = store.requests.find((x) => x.id === req.params.id);
    if (!rq) throw new HttpError(404, 'غير موجود');
    const s = getSettings();
    const list = store.properties.map((p) => ({ property_id: p.id, match: matchRequestProperty(rq, p, { staleDays: s.stale_days }) })).filter((x) => x.match);
    res.json({ results: rankMatches(list) });
  });
  r.get('/matches/property/:id', (req, res) => {
    const store = loadStore();
    const p = store.properties.find((x) => x.id === req.params.id);
    if (!p) throw new HttpError(404, 'غير موجود');
    const s = getSettings();
    const list = store.requests.filter((x) => !x.archived_at && ['new', 'active'].includes(x.status)).map((rq) => ({ request_id: rq.id, match: matchRequestProperty(rq, p, { staleDays: s.stale_days }) })).filter((x) => x.match);
    res.json({ results: rankMatches(list) });
  });

  r.post('/capture/parse', (req, res) => {
    const store = loadStore();
    const people = store.people.filter((p) => !p.archived_at).map((p) => ({ id: p.id, name: p.name, phones: store.phones.filter((x) => x.person_id === p.id).map((x) => x.normalized) }));
    res.json({ parsed: parseCapture(req.body?.text || '', { gazetteer: gazetteerFrom(store), people }) });
  });

  // حفظ إدخال سريع بعد مراجعته: شخص + طلب/عرض/تذكير في معاملة واحدة
  r.post('/capture/commit', wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.capture?.raw_text) throw new HttpError(400, 'النص الأصلي مطلوب');
    const created = {};
    let propertyToRefresh = null;
    db().transaction(() => {
      const cap = createRow('captures', { id: b.capture.id, raw_text: b.capture.raw_text, method: b.capture.method || 'text', parsed: b.capture.parsed || {}, status: 'saved' }, req.user);
      created.capture_id = cap.row.id;
      let personId = b.person?.id || null;
      if (!personId && b.person?.new && (b.person.new.name || b.person.new.phone)) {
        const p = createRow('people', { id: b.person.new.id, name: b.person.new.name || '', roles: b.person.new.roles || [], source: b.person.new.source || 'إدخال سريع' }, req.user);
        personId = p.row.id; created.person_id = personId;
        if (b.person.new.phone) createRow('phones', { id: b.person.new.phone_id, person_id: personId, raw: b.person.new.phone, whatsapp: true }, req.user);
      }
      if (b.intent === 'request' && b.request) {
        const rq = createRow('requests', { ...b.request, person_id: personId, source: b.request.source || 'إدخال سريع', notes: [b.request.notes, 'النص الأصلي: ' + b.capture.raw_text].filter(Boolean).join('\n') }, req.user);
        created.request_id = rq.row.id;
      }
      if (b.intent === 'offer' && b.property) {
        const pr = createRow('properties', { ...b.property, owner_person_id: b.source?.relation === 'owner' ? personId : b.property.owner_person_id, internal_notes: [b.property.internal_notes, 'النص الأصلي: ' + b.capture.raw_text].filter(Boolean).join('\n') }, req.user);
        created.property_id = pr.row.id;
        if (personId || b.source) createRow('property_sources', { ...(b.source || {}), id: b.source?.id, property_id: pr.row.id, person_id: personId, price_raw: b.property.price_raw, price_amount: b.property.price_amount, price_currency: b.property.price_currency, price_basis: b.property.price_basis, verified_at: b.property.verified_at }, req.user);
      }
      if (b.task && b.task.title) {
        const t = createRow('tasks', { ...b.task, person_id: personId, request_id: created.request_id || b.task.request_id, property_id: created.property_id || b.task.property_id }, req.user);
        created.task_id = t.row.id;
      }
      if (b.note) createRow('activities', { kind: 'note', body: b.note, person_id: personId, request_id: created.request_id, property_id: created.property_id, occurred_at: now() }, req.user);
      if (b.audio_file_id) {
        const f = db().prepare('SELECT id FROM files WHERE id = ?').get(b.audio_file_id);
        if (f) db().prepare('UPDATE files SET owner_type = ?, owner_id = ?, updated_at = ?, version = version + 1 WHERE id = ?').run(personId ? 'person' : 'capture', personId || created.capture_id, now(), f.id);
      }
      touchRow('captures', created.capture_id, { result: JSON.stringify(created) });
    })();
    res.json({ ok: true, created });
  }));

  // تحويل وارد إلى شخص/طلب/عرض دون إعادة كتابة
  r.post('/inbox/:id/convert', wrap(async (req, res) => {
    const b = req.body || {};
    const item = db().prepare('SELECT * FROM inbox WHERE id = ?').get(req.params.id);
    if (!item) throw new HttpError(404, 'غير موجود');
    const created = {};
    db().transaction(() => {
      let personId = b.person_id || null;
      if (!personId) {
        const p = createRow('people', { id: b.new_person_id, name: b.name ?? item.name, roles: b.roles || [], source: item.source === 'site' ? 'الموقع' : 'واتساب' }, req.user);
        personId = p.row.id; created.person_id = personId;
        if (item.phone || b.phone) createRow('phones', { person_id: personId, raw: b.phone || item.phone, whatsapp: true }, req.user);
      } else {
        // أضف الرقم إن كان جديداً لهذا الشخص
        const norm = normalizePhone(item.phone);
        if (norm && !db().prepare('SELECT 1 FROM phones WHERE person_id = ? AND normalized = ? AND archived_at IS NULL').get(personId, norm)) createRow('phones', { person_id: personId, raw: item.phone, whatsapp: true }, req.user);
      }
      created.person_id = personId;
      if (b.request) created.request_id = createRow('requests', { ...b.request, person_id: personId, source: item.source === 'site' ? 'الموقع' : 'واتساب' }, req.user).row.id;
      if (b.property) {
        const pr = createRow('properties', { ...b.property, owner_person_id: b.property.owner_person_id }, req.user).row;
        created.property_id = pr.id;
        createRow('property_sources', { property_id: pr.id, person_id: personId, relation: b.source_relation || 'owner', channel: item.source === 'site' ? 'الموقع' : 'واتساب', price_raw: b.property.price_raw || '', price_amount: b.property.price_amount, price_currency: b.property.price_currency || 'unknown' }, req.user);
        // نقل صور الوارد إلى العقار
        db().prepare("UPDATE files SET owner_type = 'property', owner_id = ?, updated_at = ?, version = version + 1 WHERE owner_type = 'inbox' AND owner_id = ?").run(pr.id, now(), item.id);
      }
      if (b.deal) created.deal_id = createRow('deals', { ...b.deal, client_person_id: personId, request_id: created.request_id || b.deal.request_id }, req.user).row.id;
      if (b.task?.title) created.task_id = createRow('tasks', { ...b.task, person_id: personId, request_id: created.request_id, deal_id: created.deal_id }, req.user).row.id;
      createRow('activities', { kind: item.source === 'whatsapp' ? 'whatsapp' : 'other', body: `وارد من ${item.source === 'site' ? 'الموقع' : 'واتساب'}: ${item.message || ''}`.trim(), person_id: personId, request_id: created.request_id, property_id: created.property_id, deal_id: created.deal_id, occurred_at: item.created_at }, req.user);
      touchRow('inbox', item.id, { status: 'converted', converted: JSON.stringify(created) });
    })();
    res.json({ ok: true, created });
  }));

  // دمج شخصين يدوياً: ينقل كل الارتباطات ويحفظ الملاحظات، ويُبقي السجل القديم مؤرشفاً للرجوع
  r.post('/people/merge', (req, res) => {
    const { source_id, target_id } = req.body || {};
    if (!source_id || !target_id || source_id === target_id) throw new HttpError(400, 'اختر شخصين مختلفين');
    const src = db().prepare('SELECT * FROM people WHERE id = ?').get(source_id), dst = db().prepare('SELECT * FROM people WHERE id = ?').get(target_id);
    if (!src || !dst) throw new HttpError(404, 'غير موجود');
    db().transaction(() => {
      const moves = [['phones', 'person_id'], ['requests', 'person_id'], ['properties', 'owner_person_id'], ['property_sources', 'person_id'], ['activities', 'person_id'], ['tasks', 'person_id'], ['appointments', 'person_id'], ['deals', 'client_person_id'], ['deals', 'owner_person_id'], ['commissions', 'party_person_id'], ['sent_offers', 'person_id']];
      for (const [t, c] of moves) db().prepare(`UPDATE ${t} SET ${c} = ?, updated_at = ?, version = version + 1 WHERE ${c} = ?`).run(target_id, now(), source_id);
      db().prepare("UPDATE files SET owner_id = ?, updated_at = ?, version = version + 1 WHERE owner_type = 'person' AND owner_id = ?").run(target_id, now(), source_id);
      const roles = [...new Set([...JSON.parse(dst.roles), ...JSON.parse(src.roles)])];
      const notes = [dst.notes, src.notes ? `[من ${src.name || 'سجل مدموج'}] ${src.notes}` : ''].filter(Boolean).join('\n');
      touchRow('people', target_id, { roles: JSON.stringify(roles), notes, name_alt: dst.name_alt || (src.name !== dst.name ? src.name : '') });
      touchRow('people', source_id, { merged_into: target_id, archived_at: now() });
    })();
    audit(req.user.id, 'merge', 'people', target_id, source_id);
    res.json({ ok: true });
  });

  // إنشاء/تعديل عام
  r.post('/e/:entity', wrap(async (req, res) => {
    const ent = req.params.entity;
    if (!ENTITIES[ent]) throw new HttpError(404, 'غير موجود');
    const out = createRow(ent, req.body || {}, req.user);
    res.status(out.existed ? 200 : 201).json({ row: out.row, existed: out.existed });
  }));
  r.patch('/e/:entity/:id', wrap(async (req, res) => {
    const ent = req.params.entity;
    if (!ENTITIES[ent]) throw new HttpError(404, 'غير موجود');
    const { base_version, patch, force } = req.body || {};
    const out = updateRow(ent, req.params.id, patch || {}, base_version, req.user, { force: !!force });
    let publish = null;
    if (ent === 'properties' && out.changed.length) publish = await refreshIfPublished(req.params.id, req.user);
    if (ent === 'files' && out.changed.length) {
      const f = db().prepare('SELECT owner_type, owner_id FROM files WHERE id = ?').get(req.params.id);
      if (f?.owner_type === 'property') publish = await refreshIfPublished(f.owner_id, req.user);
    }
    const row = ent === 'properties' ? getRow('properties', req.params.id) : out.row;
    if (row && row.storage_key) delete row.storage_key;
    res.json({ row, changed: out.changed, publish });
  }));
  r.get('/e/:entity/:id', (req, res) => {
    const row = getRow(req.params.entity, req.params.id);
    if (!row) throw new HttpError(404, 'غير موجود');
    delete row.storage_key;
    res.json({ row });
  });

  r.get('/properties/:id/publish-preview', wrap(async (req, res) => {
    const out = await publishProperty(req.params.id, req.user, { dryRun: true });
    res.json(out);
  }));
  r.post('/properties/:id/publish', wrap(async (req, res) => {
    const out = await publishProperty(req.params.id, req.user);
    if (out.problems) return res.status(422).json({ error: 'cannot_publish', message: 'لا يمكن النشر بعد', problems: out.problems });
    res.json({ ok: true, warnings: out.warnings, row: getRow('properties', req.params.id) });
  }));
  r.post('/properties/:id/unpublish', (req, res) => {
    const out = unpublishProperty(req.params.id, req.user, 'manual');
    if (out.error) throw new HttpError(404, out.error);
    res.json({ ok: true, row: getRow('properties', req.params.id) });
  });

  r.post('/files', upload.single('file'), wrap(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'لم يصل أي ملف');
    const f = await storeUpload({ buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), kind: req.body.kind, owner_type: req.body.owner_type, owner_id: req.body.owner_id, id: req.body.id }, req.user);
    res.status(201).json({ row: f });
  }));
  r.get('/files/:id', wrap(async (req, res) => sendPrivateFile(res, req.params.id, { thumb: req.query.thumb === '1' })));

  r.post('/location/resolve', wrap(async (req, res) => {
    const input = String(req.body?.url || '').trim();
    let loc = parseLocation(input);
    if (loc) return res.json({ ok: true, ...loc, method: 'parsed' });
    // روابط مختصرة (maps.app.goo.gl ...): نتبع التحويل لمضيفين معروفين فقط
    let url;
    try { url = new URL(input); } catch { return res.json({ ok: false, message: 'لم نجد إحداثيات في النص. الصق رابط الموقع أو الإحداثيات مثل 18.0858, -15.9785' }); }
    if (url.protocol !== 'https:' || !SHORT_LINK_HOSTS.includes(url.hostname)) return res.json({ ok: false, message: 'هذا الرابط غير مدعوم. استخدم رابط Google Maps أو Apple Maps أو OpenStreetMap' });
    if (!rateLimit('resolve:' + req.user.id, 30, 60000)) throw new HttpError(429, 'محاولات كثيرة');
    let current = url.toString();
    for (let i = 0; i < 4; i++) {
      const r2 = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 WasitLocationResolver' } }).catch(() => null);
      if (!r2) break;
      const loc2 = r2.headers.get('location');
      if (loc2) {
        const next = new URL(loc2, current);
        loc = parseLocation(next.toString());
        if (loc) return res.json({ ok: true, ...loc, method: 'link' });
        if (!SHORT_LINK_HOSTS.includes(next.hostname) || next.protocol !== 'https:') break;
        current = next.toString();
        continue;
      }
      const html = (await r2.text().catch(() => '')).slice(0, 200000);
      loc = parseLocation(html.match(/@-?\d+\.\d+,-?\d+\.\d+/)?.[0] || html.match(/center=-?\d+\.\d+(%2C|,)-?\d+\.\d+/)?.[0]?.replace('%2C', ',') || '');
      if (loc) return res.json({ ok: true, ...loc, method: 'link' });
      break;
    }
    res.json({ ok: false, message: 'تعذر استخراج الموقع من الرابط. افتح الرابط وانسخ الإحداثيات، أو ضع العلامة على الخريطة' });
  }));

  r.get('/export.xlsx', wrap(async (req, res) => {
    const sheets = typeof req.query.sheets === 'string' ? req.query.sheets.split(',') : undefined;
    const wb = await buildWorkbook(sheets);
    audit(req.user.id, 'export_xlsx', null, null, req.query.sheets || 'all');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('الوسيط-' + new Date().toISOString().slice(0, 10) + '.xlsx')}`);
    await wb.xlsx.write(res);
    res.end();
  }));
  r.get('/export.json', (req, res) => {
    const data = loadStore();
    audit(req.user.id, 'export_json');
    res.set('Content-Disposition', `attachment; filename="wasit-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ app: 'wasit', exported_at: now(), data });
  });
  r.get('/backup', wrap(async (req, res) => {
    if (!rateLimit('backup:' + req.user.id, 6, 3600000)) throw new HttpError(429, 'نسخ كثيرة في وقت قصير');
    const file = await createBackup();
    audit(req.user.id, 'backup_download', null, null, file);
    res.download(file);
  }));

  r.get('/integrations/whatsapp', wrap(async (req, res) => res.json(await whatsapp.status({ refresh: req.query.refresh === '1' }))));
  r.get('/sessions', (req, res) => res.json({ sessions: db().prepare('SELECT created_at, last_seen_at, user_agent, id_hash = ? current FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC').all(req.sessionHash, req.user.id) }));
  return r;
}

export function apiErrorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json(err.body || { error: 'error', message: err.message });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'too_large', message: `الملف أكبر من الحد المسموح (${config.maxUploadMB} ميغابايت)` });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'البيانات المرسلة كبيرة جداً' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'بيانات غير صالحة' });
  // أخطاء الملفات الثابتة (غير موجود/ممنوع) ليست أخطاء خادم
  if (err?.status === 404 || err?.status === 403) return res.status(err.status).type('text/plain').send(err.status === 404 ? 'غير موجود' : 'ممنوع');
  console.error(err);
  res.status(500).json({ error: 'server', message: 'حدث خطأ في الخادم، لم يُحفظ التعديل. حاول مرة أخرى.' });
}
