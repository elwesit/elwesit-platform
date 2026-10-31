// أدوات التسويق: الإحصاءات المجمّعة، صورة المشاركة، صفحات المقاطعات، وسوم التحقق، وخريطة الموقع.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasit-mkt-'));
process.env.WASIT_DATA_DIR = dir;
const { openDatabases, closeDatabases, db } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser } = await import('../../server/auth.js');
const { sourceOf, isBot } = await import('../../server/stats.js');
const { verificationToken } = await import('../../server/public-views.js');

let server, base;
before(async () => {
  openDatabases();
  createUser({ email: 'admin@x.test', name: 'مدير', password: 'Admin-pass-123', role: 'owner' });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); closeDatabases(); fs.rmSync(dir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  const req = async (method, url, body, headers = {}) => {
    const h = { 'x-wasit': '1', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Mobile', ...headers };
    if (cookie) h.cookie = cookie;
    if (body !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(body); }
    const r = await fetch(base + url, { method, headers: h, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : ct.startsWith('image/') ? Buffer.from(await r.arrayBuffer()) : await r.text() };
  };
  return { req, login: (email, password) => req('POST', '/api/auth/login', { email, password }) };
}
const admin = client();
let listing;

test('المصدر: ?src= أولاً، ثم الموقع المحيل، وإلا مباشر؛ وبرامج المعاينة لا تُحسب', () => {
  assert.equal(sourceOf('FB', 'google.com'), 'fb');
  assert.equal(sourceOf('', 'm.facebook.com'), 'fb');
  assert.equal(sourceOf('', 'l.facebook.com'), 'fb');
  assert.equal(sourceOf('', 'www.google.mr'), 'google');
  assert.equal(sourceOf('', 'www.tiktok.com'), 'tt');
  assert.equal(sourceOf('', 'example.org'), 'other');
  assert.equal(sourceOf('', ''), 'direct');
  assert.equal(sourceOf('<script>', ''), 'direct');
  assert.ok(isBot('WhatsApp/2.23.20.0'));
  assert.ok(isBot('facebookexternalhit/1.1'));
  assert.ok(isBot('Googlebot/2.1'));
  assert.ok(!isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'));
});

test('رمز التحقق: يقبل الرمز أو وسم meta كاملاً، ويرفض ما سواه', () => {
  assert.equal(verificationToken('abc123_-XYZ'), 'abc123_-XYZ');
  assert.equal(verificationToken('<meta name="google-site-verification" content="Tok3n_value" />'), 'Tok3n_value');
  assert.equal(verificationToken('"><script>alert(1)</script>'), '');
  assert.equal(verificationToken(''), '');
});

test('نشر عرض في تفرغ زينة', async () => {
  assert.equal((await admin.login('admin@x.test', 'Admin-pass-123')).status, 200);
  await admin.req('PUT', '/api/admin/settings', { contact_whatsapp: '26463808', google_site_verification: '<meta name="google-site-verification" content="G00gle-T0ken" />' });
  const r = await admin.req('POST', '/api/admin/e/properties', { id: crypto.randomUUID(), deal: 'rent', type: 'apartment', wilaya_code: 'NKW', moughataa_code: 'TVZ', area_m2: 140, bedrooms: 3, price_amount: 25000, price_currency: 'MRU', price_basis: 'monthly', pub_show_price: 1 });
  listing = r.body.row;
  assert.equal((await admin.req('POST', `/api/admin/properties/${listing.id}/publish`, {})).status, 200);
});

test('صفحة العرض: صورة مشاركة 1200×630 مولدة، ووسم التحقق، ورابط صفحة المقاطعة', async () => {
  const anon = client();
  const page = await anon.req('GET', '/p/' + listing.ref);
  assert.match(page.body, /<meta name="google-site-verification" content="G00gle-T0ken">/);
  const og = page.body.match(/<meta property="og:image" content="([^"]+)">/);
  assert.ok(og && og[1].includes(`/og/${listing.ref}.jpg?v=`), 'og:image يشير إلى الصورة المولدة');
  assert.match(page.body, /og:image:width" content="1200"/);
  assert.match(page.body, /href="\/m\/tevragh-zeina\/rent"/);
  assert.match(page.body, /data-url="[^"]+\?src=share"/, 'زر المشاركة يحمل مصدره');
  const img = await anon.req('GET', new URL(og[1]).pathname);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  const sharp = (await import('sharp')).default;
  const meta = await sharp(img.body).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
  assert.equal((await anon.req('GET', '/og/W9999.jpg')).status, 404);
});

test('الإحصاءات: الزيارات ونقرات واتساب تُجمع حسب المصدر، والمدير لا يُحسب', async () => {
  const anon = client();
  const ok = await anon.req('POST', '/api/public/hit', { ev: 'view', page: 'listing', ref: listing.ref, src: 'fb' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.src, 'fb');
  await anon.req('POST', '/api/public/hit', { ev: 'view', page: 'listing', ref: listing.ref, src: 'fb' });
  await anon.req('POST', '/api/public/hit', { ev: 'wa', page: 'listing', ref: listing.ref, src: 'fb' });
  await anon.req('POST', '/api/public/hit', { ev: 'view', page: 'home', ref_host: 'www.google.com' });
  assert.equal((await anon.req('POST', '/api/public/hit', { ev: 'view', page: 'listing', ref: 'W9999' })).status, 400, 'مرجع غير منشور يُرفض');
  assert.equal((await anon.req('POST', '/api/public/hit', { ev: 'hack', page: 'home' })).status, 400);
  const bot = await anon.req('POST', '/api/public/hit', { ev: 'view', page: 'home' }, { 'user-agent': 'facebookexternalhit/1.1' });
  assert.equal(bot.body.skipped, true);
  const staff = await admin.req('POST', '/api/public/hit', { ev: 'view', page: 'home' });
  assert.equal(staff.body.skipped, true);
  const st = (await admin.req('GET', '/api/admin/stats?days=7')).body;
  assert.equal(st.totals.views, 3);
  assert.equal(st.totals.wa, 1);
  const fb = st.by_src.find((x) => x.src === 'fb');
  assert.equal(fb.views, 2); assert.equal(fb.wa, 1); assert.equal(fb.label, 'فيسبوك');
  assert.equal(st.by_src.find((x) => x.src === 'google').views, 1);
  assert.equal(st.top[0].ref, listing.ref);
  assert.equal(st.top[0].id, listing.id);
  const cols = db().prepare('PRAGMA table_info(stat_daily)').all().map((c) => c.name);
  assert.ok(!cols.some((c) => /ip|agent|phone|name/.test(c)), 'لا بيانات تعريفية في الإحصاءات');
  assert.equal((await client().req('GET', '/api/admin/stats')).status, 401);
});

test('صفحات المقاطعات: عنوان مفهرس، وتبويب البيع/الإيجار، والفارغة لا تُفهرس، وتظهر في خريطة الموقع', async () => {
  const anon = client();
  const all = await anon.req('GET', '/m/tevragh-zeina');
  assert.equal(all.status, 200);
  assert.match(all.body, /<title>عقارات للبيع والإيجار في تفرغ زينة/);
  assert.ok(all.body.includes(`data-ref="${listing.ref}"`));
  assert.ok(!all.body.includes('noindex'), 'صفحة فيها عروض تُفهرس');
  const rent = await anon.req('GET', '/m/tevragh-zeina/rent');
  assert.match(rent.body, /عقارات للإيجار في تفرغ زينة/);
  const sale = await anon.req('GET', '/m/tevragh-zeina/sale');
  assert.ok(!sale.body.includes(`data-ref="${listing.ref}"`));
  assert.match(sale.body, /<meta name="robots" content="noindex, follow">/);
  assert.equal((await anon.req('GET', '/m/nowhere')).status, 404);
  assert.equal((await anon.req('GET', '/m/tevragh-zeina/buy')).status, 404);
  const home = await anon.req('GET', '/');
  assert.match(home.body, /href="\/m\/tevragh-zeina"/);
  const sm = await anon.req('GET', '/sitemap.xml');
  assert.match(sm.body, /\/m\/tevragh-zeina<\/loc>/);
  assert.match(sm.body, /\/m\/tevragh-zeina\/rent<\/loc>/);
  assert.ok(!sm.body.includes('/m/tevragh-zeina/sale<'), 'لا نضيف صفحات فارغة');
});

test('سحب النشر يحذف صورة المشاركة', async () => {
  await admin.req('POST', `/api/admin/properties/${listing.id}/unpublish`, {});
  assert.equal((await client().req('GET', `/og/${listing.ref}.jpg`)).status, 404);
  const cache = path.join(dir, 'og-cache');
  assert.ok(!fs.existsSync(cache) || !fs.readdirSync(cache).some((f) => f.startsWith(listing.ref + '-')));
});

test('الصفحة الرئيسية: بيانات منظمة باسم الموقع وأسمائه البديلة وحساباته، ووصف يذكر نواكشوط', async () => {
  const home = (await client().req('GET', '/')).body;
  assert.match(home, /<meta name="description" content="الوسيط العقاري في نواكشوط/);
  const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.equal(ld[0]['@type'], 'WebSite');
  assert.ok(ld[0].alternateName.includes('الوسيط'));
  assert.equal(ld[1]['@type'], 'RealEstateAgent');
  assert.ok(ld[1].sameAs.some((u) => u.includes('facebook.com')));
  assert.equal(ld[1].telephone, '+22226463808');
  assert.ok(!(await client().req('GET', '/?deal=rent')).body.includes('ld+json'), 'نتائج البحث بلا بيانات الموقع');
});
