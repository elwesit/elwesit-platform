// شريط «طلب عاجل»: الطلبات من الإعدادات أو من ملف المحتوى، والرسالة الجاهزة إلى واتساب.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasit-urgent-'));
process.env.WASIT_DATA_DIR = path.join(dir, 'data');
const { openDatabases, closeDatabases, getSettings, db, now } = await import('../../server/db.js');
const { importUrgentRequests } = await import('../../server/urgent-requests.js');
const { createApp } = await import('../../server/app.js');
const { createUser } = await import('../../server/auth.js');
const { cleanUrgent, activeUrgent, urgentMessage } = await import('../../shared/urgent.js');

let server, base;
before(async () => {
  openDatabases();
  createUser({ email: 'admin@x.test', name: 'مدير', password: 'Admin-pass-123', role: 'owner' });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); closeDatabases(); fs.rmSync(dir, { recursive: true, force: true }); });

const file = path.join(dir, 'urgent.json');
const write = (requests) => fs.writeFileSync(file, JSON.stringify({ requests }));
const texts = () => getSettings().urgent_requests.map((r) => r.text);

test('التنظيف والانتهاء والرسالة', () => {
  const l = cleanUrgent([{ text: '  مطلوب   قطعة ' }, { text: '' }, { text: 'منتهٍ', until: '2020-01-01' }, { text: 'x'.repeat(300), until: 'bad' }, 'junk']);
  assert.equal(l.length, 3);
  assert.equal(l[0].text, 'مطلوب قطعة');
  assert.equal(l[2].text.length, 160);
  assert.equal(l[2].until, '');
  assert.deepEqual(activeUrgent(l, '2026-11-01').map((r) => r.text), ['مطلوب قطعة', 'x'.repeat(160)]);
  const m = urgentMessage('مطلوب قطعة 300 م² في تفرغ زينة');
  assert.match(m, /الطلب: مطلوب قطعة 300 م² في تفرغ زينة/);
  assert.match(m, /الوسيط العقاري/);
});

test('ملف المحتوى: يضيف ويعدّل ويحذف، ولا يعيد ما حذفه المالك', () => {
  write([{ key: 'tvz-300', text: 'مطلوب قطعة 300 م² في تفرغ زينة' }, { key: 'BAD KEY', text: 'لا' }, { key: 'ksr-house', text: 'مطلوب منزل في لكصر', until: '2099-01-01' }]);
  assert.equal(importUrgentRequests(file).changed, true);
  assert.deepEqual(texts(), ['مطلوب قطعة 300 م² في تفرغ زينة', 'مطلوب منزل في لكصر']);
  assert.equal(importUrgentRequests(file).changed, false);
  // المالك يحذف طلباً ويضيف طلبه
  const own = { id: 'u1', text: 'مطلوب شقة للإيجار' };
  const db = getSettings().urgent_requests.filter((r) => r.key !== 'tvz-300');
  ownerSaves([own, ...db]);
  importUrgentRequests(file);
  assert.deepEqual(texts(), ['مطلوب شقة للإيجار', 'مطلوب منزل في لكصر']);
  // تعديل الملف يطبّق، وحذف الطلب من الملف يحذفه من الموقع
  write([{ key: 'ksr-house', text: 'مطلوب منزل كبير في لكصر' }, { key: 'new-one', text: 'مطلوب قطعة في عرفات' }]);
  importUrgentRequests(file);
  assert.deepEqual(texts(), ['مطلوب قطعة في عرفات', 'مطلوب شقة للإيجار', 'مطلوب منزل كبير في لكصر']);
  write([{ key: 'new-one', text: 'مطلوب قطعة في عرفات' }]);
  importUrgentRequests(file);
  assert.deepEqual(texts(), ['مطلوب قطعة في عرفات', 'مطلوب شقة للإيجار']);
});

function ownerSaves(list) {
  db().prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'urgent_requests'").run(JSON.stringify(list), now());
}

test('الشريط في كل صفحة برابط واتساب جاهز، وإدارته من الإعدادات', async () => {
  let cookie = '';
  const req = async (method, url, body) => {
    const h = { 'x-wasit': '1', ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
    const r = await fetch(base + url, { method, headers: h, body: body && JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, text: await r.text() };
  };
  assert.equal((await req('POST', '/api/auth/login', { email: 'admin@x.test', password: 'Admin-pass-123' })).status, 200);
  const put = await req('PUT', '/api/admin/settings', { contact_whatsapp: '26463808', urgent_requests: [{ text: 'مطلوب قطعة 300 م² في <تفرغ زينة>' }, { text: 'قديم', until: '2020-01-01' }, { text: '' }] });
  assert.equal(put.status, 200);
  assert.equal(JSON.parse(put.text).settings.urgent_requests.length, 2);
  cookie = '';
  for (const url of ['/', '/request', '/urgent']) {
    const html = (await req('GET', url)).text;
    assert.match(html, /class="urgent-bar"/, url);
    assert.match(html, /https:\/\/wa\.me\/22226463808\?text=/, url);
    assert.ok(html.includes('&lt;تفرغ زينة&gt;'), url);
    assert.ok(!html.includes('قديم</span>'), url);
  }
  const html = (await req('GET', '/')).text;
  const href = html.match(/href="(https:\/\/wa\.me\/[^"]+)"/g).find((h) => h.includes('text='));
  const text = decodeURIComponent(href.split('text=')[1].replace(/"$/, '').replace(/&amp;/g, '&'));
  assert.match(text, /الطلب: مطلوب قطعة 300 م² في <تفرغ زينة>/);
  // قائمة فارغة: لا شريط
  cookie = '';
  await req('POST', '/api/auth/login', { email: 'admin@x.test', password: 'Admin-pass-123' });
  await req('PUT', '/api/admin/settings', { urgent_requests: [] });
  assert.doesNotMatch((await req('GET', '/')).text, /class="urgent-bar"/);
});
