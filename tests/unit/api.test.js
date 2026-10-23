// اختبار تكامل للخادم: صلاحيات، CSRF، تكرار العمليات، التعارض، النشر/السحب، الوارد، واتساب.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasit-test-'));
process.env.WASIT_DATA_DIR = dir;
process.env.WA_APP_SECRET = 'test-secret';
process.env.WA_VERIFY_TOKEN = 'verify-me';
const { openDatabases, closeDatabases, db } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser } = await import('../../server/auth.js');

let server, base;
before(async () => {
  openDatabases();
  createUser({ email: 'admin@x.test', name: 'مدير', password: 'Admin-pass-123', role: 'owner' });
  createUser({ email: 'none@x.test', name: 'بلا صلاحية', password: 'None-pass-1234', role: 'none' });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); closeDatabases(); fs.rmSync(dir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  const req = async (method, url, body, headers = {}) => {
    const h = { 'x-wasit': '1', ...headers };
    if (cookie) h.cookie = cookie;
    if (body !== undefined && !(body instanceof FormData)) { h['content-type'] = 'application/json'; body = JSON.stringify(body); }
    const r = await fetch(base + url, { method, headers: h, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.text() };
  };
  return { req, login: (email, password) => req('POST', '/api/auth/login', { email, password }) };
}

const admin = client();

test('بلا جلسة: 401 لكل واجهات الإدارة', async () => {
  const c = client();
  for (const u of ['/api/admin/sync', '/api/admin/export.xlsx', '/api/admin/backup', '/api/admin/export.json']) assert.equal((await c.req('GET', u)).status, 401, u);
});

test('حساب بلا صلاحية لا يدخل', async () => {
  const c = client();
  const r = await c.login('none@x.test', 'None-pass-1234');
  assert.equal(r.status, 403);
  assert.equal((await c.req('GET', '/api/admin/sync')).status, 401);
});

test('كلمة مرور خاطئة ثم دخول صحيح', async () => {
  assert.equal((await admin.login('admin@x.test', 'wrong-password')).status, 401);
  const r = await admin.login('admin@x.test', 'Admin-pass-123');
  assert.equal(r.status, 200);
  assert.equal((await admin.req('GET', '/api/admin/sync')).status, 200);
});

test('CSRF: كتابة بدون الرأس أو من مصدر آخر تُرفض', async () => {
  const r1 = await admin.req('POST', '/api/admin/e/people', { name: 'x' }, { 'x-wasit': '0' });
  assert.equal(r1.status, 403);
  const r2 = await admin.req('POST', '/api/admin/e/people', { name: 'x' }, { origin: 'https://evil.example' });
  assert.equal(r2.status, 403);
});

test('إعادة إرسال العملية نفسها لا تكررها (x-op-id + معرّف العميل)', async () => {
  const id = crypto.randomUUID();
  const op = 'op-' + crypto.randomUUID();
  const a = await admin.req('POST', '/api/admin/e/people', { id, name: 'سالم' }, { 'x-op-id': op });
  const b = await admin.req('POST', '/api/admin/e/people', { id, name: 'سالم' }, { 'x-op-id': op });
  assert.equal(a.status, 201);
  assert.equal(b.headers.get('x-op-replayed'), '1');
  const c = await admin.req('POST', '/api/admin/e/people', { id, name: 'سالم' }, { 'x-op-id': 'op-' + crypto.randomUUID() });
  assert.equal(c.body.existed, true);
  assert.equal(db().prepare('SELECT COUNT(*) n FROM people WHERE id = ?').get(id).n, 1);
});

test('تعارض التعديل: الحقل نفسه = 409، حقل مختلف = دمج', async () => {
  const { body: { row } } = await admin.req('POST', '/api/admin/e/requests', { id: crypto.randomUUID(), deal: 'sale', notes: 'أ' });
  const v = row.version;
  const phone = await admin.req('PATCH', `/api/admin/e/requests/${row.id}`, { base_version: v, patch: { notes: 'من الهاتف' } });
  assert.equal(phone.status, 200);
  const laptopSame = await admin.req('PATCH', `/api/admin/e/requests/${row.id}`, { base_version: v, patch: { notes: 'من الحاسوب' } });
  assert.equal(laptopSame.status, 409);
  assert.deepEqual(laptopSame.body.fields, ['notes']);
  assert.equal(laptopSame.body.current.notes, 'من الهاتف');
  const laptopOther = await admin.req('PATCH', `/api/admin/e/requests/${row.id}`, { base_version: v, patch: { priority: 'high' } });
  assert.equal(laptopOther.status, 200);
  const cur = db().prepare('SELECT notes, priority FROM requests WHERE id = ?').get(row.id);
  assert.deepEqual({ ...cur }, { notes: 'من الهاتف', priority: 'high' });
});

let prop;
test('النشر يُظهر العقار للعامة، والسحب يوقف الوصول فوراً', async () => {
  const r = await admin.req('POST', '/api/admin/e/properties', { id: crypto.randomUUID(), deal: 'sale', type: 'land', wilaya_code: 'NKN', moughataa_code: 'TJN', lot_number: '245', price_amount: 3000000, price_currency: 'unknown', owner_notes: 'سر داخلي', lat: 18.07, lng: -15.92 });
  prop = r.body.row;
  const pub = await admin.req('POST', `/api/admin/properties/${prop.id}/publish`, {});
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  const anon = client();
  const page = await anon.req('GET', '/p/' + prop.ref);
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('السعر عند التواصل'), 'عملة مجهولة لا تُعرض كسعر');
  assert.ok(!page.body.includes('سر داخلي'));
  assert.ok(!page.body.includes('245'), 'رقم القطعة مخفي افتراضياً');
  assert.ok(!page.body.includes('18.07,') && !page.body.includes('"lat":18.07'), 'الموقع الدقيق لا يُكشف في الوضع التقريبي');
  const listing = await anon.req('GET', '/api/public/listings?map=1');
  assert.ok(JSON.stringify(listing.body).includes(prop.ref));
  await admin.req('POST', `/api/admin/properties/${prop.id}/unpublish`, {});
  assert.equal((await anon.req('GET', '/p/' + prop.ref)).status, 404);
  assert.ok(!JSON.stringify((await anon.req('GET', '/api/public/listings?map=1')).body).includes(prop.ref));
});

test('تغيير التوفر إلى «بيع» يسحب العقار المنشور تلقائياً', async () => {
  await admin.req('POST', `/api/admin/properties/${prop.id}/publish`, {});
  const row = db().prepare('SELECT version FROM properties WHERE id = ?').get(prop.id);
  await admin.req('PATCH', `/api/admin/e/properties/${prop.id}`, { base_version: row.version, patch: { availability: 'sold' } });
  assert.equal((await client().req('GET', '/p/' + prop.ref)).status, 404);
});

test('قاعدة البيانات العامة لا تحتوي بيانات خاصة', () => {
  const pub = new (db().constructor)(path.join(dir, 'public.db'), { readonly: true });
  const tables = pub.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  pub.close();
  for (const t of ['people', 'phones', 'users', 'sessions', 'inbox', 'properties']) assert.ok(!tables.includes(t), t);
});

test('نموذج الزائر: هاتف خاطئ يُرفض، والإرسال المكرر لا يتكرر، والفخ لا يحفظ', async () => {
  const anon = client();
  const bad = await anon.req('POST', '/api/public/inbox', { kind: 'search', phone: '12' });
  assert.equal(bad.status, 400);
  const token = crypto.randomUUID();
  const a = await anon.req('POST', '/api/public/inbox', { kind: 'search', phone: '22334455', name: 'زائر', deal: 'rent', client_token: token });
  const b = await anon.req('POST', '/api/public/inbox', { kind: 'search', phone: '22334455', name: 'زائر', deal: 'rent', client_token: token });
  assert.equal(a.body.ok, true);
  assert.equal(b.body.duplicate, true);
  assert.equal(a.body.receipt, b.body.receipt);
  assert.equal(db().prepare('SELECT COUNT(*) n FROM inbox WHERE client_token = ?').get(token).n, 1);
  const before = db().prepare('SELECT COUNT(*) n FROM inbox').get().n;
  await anon.req('POST', '/api/public/inbox', { kind: 'search', phone: '22334455', website: 'spam' });
  assert.equal(db().prepare('SELECT COUNT(*) n FROM inbox').get().n, before);
  const interest = await anon.req('POST', '/api/public/inbox', { kind: 'interest', phone: '22334455', property_ref: 'W9999' });
  assert.equal(interest.status, 400, 'الاهتمام بعقار غير منشور يُرفض');
});

test('تحويل الوارد إلى شخص وطلب', async () => {
  const item = db().prepare("SELECT id FROM inbox WHERE kind = 'search' LIMIT 1").get();
  const r = await admin.req('POST', `/api/admin/inbox/${item.id}/convert`, { request: { deal: 'rent', types: ['house'] }, task: { title: 'اتصل بالزائر' } });
  assert.equal(r.status, 200);
  assert.ok(r.body.created.person_id && r.body.created.request_id && r.body.created.task_id);
  assert.equal(db().prepare('SELECT status FROM inbox WHERE id = ?').get(item.id).status, 'converted');
  assert.equal(db().prepare('SELECT normalized FROM phones WHERE person_id = ?').get(r.body.created.person_id).normalized, '22222334455');
});

test('واتساب: التحقق والتوقيع وعدم التكرار، ولا «متصل» دون فحص حقيقي', async () => {
  const anon = client();
  assert.equal((await anon.req('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1')).status, 403);
  const ok = await anon.req('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42');
  assert.equal(ok.body, '42');
  const payload = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: '22246123456', profile: { name: 'زبون' } }], messages: [{ id: 'wamid.1', from: '22246123456', timestamp: '1761213600', type: 'text', text: { body: 'أبحث عن شقة' } }] } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');
  const post = (s) => fetch(base + '/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': s }, body: payload });
  assert.equal((await post('sha256=00')).status, 401);
  assert.equal((await post(sig)).status, 200);
  assert.equal((await post(sig)).status, 200);
  assert.equal(db().prepare("SELECT COUNT(*) n FROM inbox WHERE source = 'whatsapp'").get().n, 1);
  // صدى رسالة أرسلها الوسيط من تطبيق واتساب (Coexistence) يُسجَّل في سجل الشخص المعروف فقط
  const pid = crypto.randomUUID();
  await admin.req('POST', '/api/admin/e/people', { id: pid, name: 'معروف' });
  await admin.req('POST', '/api/admin/e/phones', { person_id: pid, raw: '46 99 88 77', whatsapp: true });
  const echo = JSON.stringify({ entry: [{ changes: [{ field: 'smb_message_echoes', value: { message_echoes: [{ id: 'wamid.e1', from: '22222334455', to: '22246998877', timestamp: '1761213600', type: 'text', text: { body: 'العرض متاح' } }] } }] }] });
  const esig = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(echo).digest('hex');
  for (let k = 0; k < 2; k++) await fetch(base + '/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': esig }, body: echo });
  assert.equal(db().prepare('SELECT COUNT(*) n FROM activities WHERE person_id = ? AND body LIKE ?').get(pid, '%العرض متاح%').n, 1);
  const st = await admin.req('GET', '/api/admin/integrations/whatsapp');
  assert.notEqual(st.body.state, 'connected');
});

test('تصدير Excel وجلب الملفات الخاصة يتطلب جلسة', async () => {
  const x = await fetch(base + '/api/admin/export.xlsx', { headers: { cookie: '' } });
  assert.equal(x.status, 401);
  assert.equal((await client().req('GET', '/media/../main.db')).status, 404);
});

test('الخروج يُبطل الجلسة على الخادم', async () => {
  const c = client();
  await c.login('admin@x.test', 'Admin-pass-123');
  await c.req('POST', '/api/auth/logout', {});
  assert.equal((await c.req('GET', '/api/admin/sync')).status, 401);
});
