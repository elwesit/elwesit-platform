// الموقع العام. لا يستعمل إلا: publicReadDb (المنشور فقط، قراءة) و submitInbox (إضافة إلى الوارد).
import express from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { publicReadDb } from './db.js';
import { config } from './config.js';
import { submitInbox } from './inbox-intake.js';
import { isStaff, rateLimit, sameOrigin } from './auth.js';
import { layout, card, searchForm, inboxForm, priceText, featuresList, safeJson, icon } from './public-views.js';
import { escapeHtml as e, norm, normLot } from '../shared/text.js';
import { TYPES, DEALS_PUBLIC } from '../shared/vocab.js';
import { formatNumber } from '../shared/money.js';
import { normalizePhone } from '../shared/phone.js';
import { directionsLinks } from '../shared/geolink.js';

const VERSION = Date.now().toString(36);
const uploadPublic = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 6, fields: 30, fieldSize: 8000 } });

function site() {
  const s = {};
  for (const r of publicReadDb().prepare('SELECT key, value FROM site').all()) s[r.key] = JSON.parse(r.value);
  s.__v = VERSION;
  s.site_name ||= 'الوسيط العقاري';
  s.site_tagline ||= '';
  return s;
}
function geo() { return site().geo || { wilayas: [], moughataas: [] }; }

function baseUrl(req, s) {
  return (s.base_url || config.baseUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// تحويل قيم البحث إلى شروط SQL على public.db
function buildQuery(q) {
  const where = [], args = [];
  if (q.deal === 'sale' || q.deal === 'rent') { where.push('deal = ?'); args.push(q.deal); }
  if (q.type && TYPES[q.type]) { where.push('type = ?'); args.push(q.type); }
  if (typeof q.loc === 'string') {
    if (q.loc.startsWith('w:')) { where.push('wilaya_code = ?'); args.push(q.loc.slice(2)); }
    if (q.loc.startsWith('m:')) { where.push('moughataa_code = ?'); args.push(q.loc.slice(2)); }
  }
  const max = parseFloat(String(q.max || '').replace(/[^\d.]/g, ''));
  if (max > 0) {
    const mult = { m_mru: 1e6, m_mro: 1e5, k_mru: 1e3 }[q.unit] || 1e6;
    where.push('price_mru IS NOT NULL AND price_mru <= ?'); args.push(max * mult);
  }
  const amin = parseFloat(q.area_min);
  if (amin > 0) { where.push('area_m2 >= ?'); args.push(amin); }
  const bd = parseInt(q.bedrooms, 10);
  if (bd > 0) { where.push('bedrooms >= ?'); args.push(bd); }
  if (q.q) {
    const words = norm(q.q).split(' ').filter(Boolean).slice(0, 6);
    const lot = normLot(q.q);
    const parts = words.map(() => 'search_text LIKE ?');
    if (parts.length) { where.push(`((${parts.join(' AND ')}) OR REPLACE(LOWER(lot_number), ' ', '') = ?)`); args.push(...words.map((w) => `%${w}%`), lot); }
  }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

function listListings(q, { limit = 10, cursor } = {}) {
  const { where, args } = buildQuery(q);
  let w = where, a = [...args];
  if (cursor) {
    const [pa, ref] = String(cursor).split('|');
    w += (w ? ' AND ' : 'WHERE ') + '(published_at < ? OR (published_at = ? AND ref < ?))';
    a.push(pa, pa, ref);
  }
  const rows = publicReadDb().prepare(`SELECT * FROM listings ${w} ORDER BY published_at DESC, ref DESC LIMIT ?`).all(...a, limit + 1);
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const total = publicReadDb().prepare(`SELECT COUNT(*) c FROM listings ${where}`).get(...args).c;
  return { items, next: more && last ? `${last.published_at}|${last.ref}` : null, total };
}

function publicJson(l) {
  const p = priceText(l);
  return { ref: l.ref, deal: l.deal, type: l.type, type_label: TYPES[l.type] || '', title: l.title, place: l.place_label, price: p.main, price_alt: p.alt, area_m2: l.area_m2, lot: l.lot_number || null, bedrooms: l.bedrooms, loc_mode: l.loc_mode, lat: l.lat, lng: l.lng, radius_m: l.radius_m, cover: l.cover ? `/media/${encodeURIComponent(l.ref)}/${l.cover}-t.webp` : null, url: `/p/${encodeURIComponent(l.ref)}` };
}

export function publicRouter() {
  const r = express.Router();
  r.use((req, res, next) => { res.set('Cache-Control', 'private, no-cache'); next(); });

  r.get('/', (req, res) => {
    const s = site(); const q = req.query;
    const size = s.listing_page_size || 10;
    const { items, next, total } = listListings(q, { limit: size });
    const filtered = ['deal', 'type', 'loc', 'max', 'area_min', 'bedrooms', 'q'].some((k) => q[k]);
    const view = q.view === 'map' ? 'map' : 'list';
    const qs = new URLSearchParams(Object.entries(q).filter(([k, v]) => typeof v === 'string' && v && k !== 'cursor')).toString();
    const body = `
<section class="hero"><div class="wrap">
  <h1>${e(s.site_tagline || 'عقارات في موريتانيا')}</h1>
  <p class="lead">${e(s.site_intro || '')}</p>
  ${searchForm(geo(), q)}
  <div class="hero-actions"><a class="btn btn-outline" href="/request">لم تجد ما تريد؟ أرسل طلبك</a><a class="btn btn-outline" href="/offer">اعرض عقارك</a></div>
</div></section>
<section class="wrap results" id="results" data-query="${e(qs)}">
  <div class="results-head">
    <h2>${filtered ? 'نتائج البحث' : 'أحدث العقارات'} <small>${total ? formatNumber(total) + ' عقار' : ''}</small></h2>
    <div class="view-toggle" role="tablist" aria-label="طريقة العرض">
      <a role="tab" href="?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), view: 'list' })}#results" class="${view === 'list' ? 'on' : ''}" aria-selected="${view === 'list'}" data-view="list">${icon.list}<span>قائمة</span></a>
      <a role="tab" href="?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), view: 'map' })}#results" class="${view === 'map' ? 'on' : ''}" aria-selected="${view === 'map'}" data-view="map">${icon.map}<span>خريطة</span></a>
    </div>
  </div>
  <div class="map-panel" id="map-panel" ${view === 'map' ? '' : 'hidden'}>
    <div id="map" class="map" aria-label="خريطة العقارات"></div>
    <p class="map-note">الدوائر تشير إلى موقع تقريبي. العلامة لا تثبت حدود العقار أو ملكيته.</p>
  </div>
  <div class="list-panel" id="list-panel" ${view === 'map' ? 'hidden' : ''}>
  ${items.length ? `<div class="grid" id="grid">${items.map((l) => card(l)).join('')}</div>` : `<div class="empty"><p>${filtered ? 'لا توجد عقارات منشورة تطابق بحثك حالياً.' : 'لا توجد عقارات منشورة حالياً.'}</p><a class="btn btn-primary" href="/request">أرسل طلبك وسنبحث لك</a></div>`}
  ${next ? `<div class="more-wrap"><a class="btn btn-outline" id="load-more" href="?${qs ? qs + '&' : ''}cursor=${encodeURIComponent(next)}#results" data-next="${e(next)}">عرض المزيد</a></div>` : ''}
  </div>
</section>`;
    res.send(layout(s, { body, canonical: baseUrl(req, s) + '/', staff: isStaff(req.user), head: mapHead(s) }));
  });

  r.get('/api/public/listings', (req, res) => {
    const s = site();
    if (req.query.map === '1') {
      const { where, args } = buildQuery(req.query);
      const rows = publicReadDb().prepare(`SELECT * FROM listings ${where} ${where ? 'AND' : 'WHERE'} loc_mode != 'hidden' AND lat IS NOT NULL ORDER BY published_at DESC LIMIT 1000`).all(...args);
      const hiddenCount = publicReadDb().prepare(`SELECT COUNT(*) c FROM listings ${where} ${where ? 'AND' : 'WHERE'} (loc_mode = 'hidden' OR lat IS NULL)`).get(...args).c;
      return res.json({ items: rows.map(publicJson), without_location: hiddenCount });
    }
    const out = listListings(req.query, { limit: Math.min(30, s.listing_page_size || 10), cursor: req.query.cursor });
    res.json({ items: out.items.map(publicJson), html: out.items.map((l) => card(l)).join(''), next: out.next, total: out.total });
  });

  r.get('/p/:ref', (req, res) => {
    const s = site();
    const l = publicReadDb().prepare('SELECT * FROM listings WHERE ref = ?').get(req.params.ref);
    if (!l) return res.status(404).send(layout(s, { title: 'العقار غير متوفر', body: `<section class="wrap narrow page"><h1>هذا العقار لم يعد معروضاً</h1><p>ربما بيع أو سُحب من العرض. يمكنك تصفح العروض الحالية أو إرسال طلبك.</p><p><a class="btn btn-primary" href="/">العقارات المعروضة</a> <a class="btn btn-outline" href="/request">أبحث عن عقار</a></p></section>`, staff: isStaff(req.user) }));
    const url = `${baseUrl(req, s)}/p/${encodeURIComponent(l.ref)}`;
    const photos = safeJson(l.photos);
    const p = priceText(l);
    const wa = normalizePhone(s.contact_whatsapp || s.contact_phone || '');
    const tel = normalizePhone(s.contact_phone || '');
    const waText = `السلام عليكم، أستفسر عن العقار ${l.ref}: ${l.title}\n${url}`;
    const feats = featuresList(l);
    const dir = l.lat != null ? directionsLinks(l.lat, l.lng) : null;
    const facts = [
      ['النوع', TYPES[l.type]], ['العملية', DEALS_PUBLIC[l.deal]], ['المساحة', l.area_m2 ? `${formatNumber(l.area_m2)} م²` : null],
      ['رقم القطعة', l.lot_number || null], ['المخطط', l.plan || null], ['القطاع', l.sector || null],
      ['الغرف', l.bedrooms], ['الحمامات', l.bathrooms], ['الطوابق', l.floors], ['معلم قريب', l.landmark || null], ['المرجع', l.ref],
    ].filter(([, v]) => v != null && v !== '');
    const jsonld = { '@context': 'https://schema.org', '@type': 'RealEstateListing', name: l.title, url, datePosted: l.published_at, description: l.description || undefined, image: photos.slice(0, 3).map((ph) => `${baseUrl(req, s)}/media/${encodeURIComponent(l.ref)}/${ph.key}.webp`) };
    if (!l.price_hidden && l.price_amount != null) jsonld.offers = { '@type': 'Offer', price: l.price_currency === 'MRO' ? l.price_amount / 10 : l.price_amount, priceCurrency: 'MRU' };
    const body = `
<article class="wrap property" data-ref="${e(l.ref)}">
  <nav class="crumbs"><a href="/">العقارات</a> ‹ <span>${e(l.ref)}</span></nav>
  ${photos.length ? `<div class="gallery" tabindex="0" aria-label="صور العقار">${photos.map((ph, i) => `<figure><img src="/media/${encodeURIComponent(l.ref)}/${ph.key}.webp" alt="${e(l.title)} — صورة ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="${ph.w}" height="${ph.h}"></figure>`).join('')}</div>${photos.length > 1 ? `<p class="gallery-hint">${photos.length} صور — اسحب للمزيد</p>` : ''}` : `<div class="noimg-hero">${e(TYPES[l.type] || 'عقار')}</div>`}
  <div class="property-grid">
    <div class="property-main">
      <div class="tags"><span class="badge badge-${e(l.deal)}">${e(DEALS_PUBLIC[l.deal] || '')}</span><span class="tag">${e(TYPES[l.type] || '')}</span></div>
      <h1>${e(l.title)}</h1>
      <p class="place">${icon.pin}<span>${e(l.place_label)}</span></p>
      <div class="price-box${l.price_hidden ? ' hidden-price' : ''}"><strong>${e(p.main)}</strong>${p.alt ? `<small>${e(p.alt)}</small>` : ''}${l.price_negotiable ? '<span class="tag">قابل للتفاوض</span>' : ''}</div>
      <dl class="facts">${facts.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>
      ${feats.length ? `<ul class="features">${feats.map((f) => `<li>${e(f)}</li>`).join('')}</ul>` : ''}
      ${l.description ? `<div class="desc">${e(l.description).replace(/\n/g, '<br>')}</div>` : ''}
      <section class="loc-section">
        <h2>الموقع</h2>
        ${l.loc_mode === 'hidden' || l.lat == null ? `<p class="muted">${e(l.place_label)}. الموقع الدقيق يُحدَّد عند التواصل.</p>` : `
        <p class="loc-note ${l.loc_mode}">${l.loc_mode === 'approximate' ? `<strong>موقع تقريبي:</strong> العقار يقع داخل الدائرة (نصف قطرها نحو ${formatNumber(l.radius_m)} م)، وليس في مركزها بالضرورة.` : '<strong>موقع محدد</strong> كما أدخله الوسيط.'} العلامة لا تثبت حدود العقار أو ملكيته.</p>
        <div class="map map-small" id="pmap" data-lat="${l.lat}" data-lng="${l.lng}" data-mode="${e(l.loc_mode)}" data-radius="${l.radius_m || 0}" ${l.boundary ? `data-boundary='${e(l.boundary)}'` : ''}><button class="btn btn-outline map-load" type="button">${icon.map}<span>اعرض الخريطة</span></button></div>
        ${l.boundary ? `<p class="hint">الحدود المعروضة مصدرها: ${e(l.boundary_source || '')}. للتأكد من الحدود يُرجع إلى الوثائق الرسمية.</p>` : ''}
        <div class="dir-links"><span>${l.loc_mode === 'approximate' ? 'اتجاهات إلى المنطقة التقريبية:' : 'الاتجاهات:'}</span><a href="${dir.google}" target="_blank" rel="noopener">خرائط Google</a><a href="${dir.apple}" target="_blank" rel="noopener">خرائط Apple</a><a href="${dir.osm}" target="_blank" rel="noopener">OpenStreetMap</a></div>`}
      </section>
      <p class="disclaimer">هذه المعلومات حسب ما وصل الوسيط وتاريخ تحديثها ${new Date(l.updated_at).toISOString().slice(0, 10)}. لا تُثبت الملكية ولا تغني عن المعاينة والتحقق من الوثائق والحدود والالتزامات.</p>
    </div>
    <aside class="property-side">
      <div class="contact-box">
        <h2>تواصل بخصوص ${e(l.ref)}</h2>
        <div class="contact-actions">
          ${tel ? `<a class="btn btn-primary btn-block" href="tel:+${tel}">${icon.phone}<span>اتصل</span></a>` : ''}
          ${wa ? `<a class="btn btn-wa btn-block" href="https://wa.me/${wa}?text=${encodeURIComponent(waText)}" rel="noopener">${icon.wa}<span>واتساب</span></a>` : ''}
          <button class="btn btn-outline btn-block share-btn" type="button" data-url="${e(url)}" data-title="${e(l.title)}">${icon.share}<span>مشاركة الرابط</span></button>
        </div>
        <h3>أو اترك رقمك ونتصل بك</h3>
        ${inboxForm('interest', { token: crypto.randomUUID(), site: s, property: l })}
      </div>
    </aside>
  </div>
</article>
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`;
    res.send(layout(s, { title: l.title, description: [DEALS_PUBLIC[l.deal], l.place_label, l.area_m2 ? `${formatNumber(l.area_m2)} م²` : '', p.main].filter(Boolean).join(' · '), canonical: url, ogImage: photos[0] ? `${baseUrl(req, s)}/media/${encodeURIComponent(l.ref)}/${photos[0].key}.webp` : `${baseUrl(req, s)}/static/og.png`, body, staff: isStaff(req.user), head: mapHead(s) }));
  });

  const formPage = (kind, title, intro) => (req, res) => {
    const s = site();
    const body = `<section class="wrap narrow page"><h1>${title}</h1><p class="lead">${intro}</p>${inboxForm(kind, { token: crypto.randomUUID(), site: s })}</section>`;
    res.send(layout(s, { title, description: intro, canonical: baseUrl(req, s) + req.path, body, staff: isStaff(req.user) }));
  };
  r.get('/request', formPage('search', 'أبحث عن عقار', 'أخبرنا بما تبحث عنه، وسنتواصل معك بالعروض المناسبة. يكفي رقم هاتفك ووصف بسيط.'));
  r.get('/offer', formPage('offer', 'اعرض عقارك', 'أرسل معلومات عقارك وسنتواصل معك لمراجعتها قبل أي نشر. المعلومات الناقصة يمكن إكمالها لاحقاً.'));
  r.get('/contact', formPage('contact', 'تواصل معنا', 'اكتب استفسارك وسنعاود الاتصال بك.'));

  // استقبال النماذج: JSON/multipart من الواجهة، أو نموذج عادي بدون جافاسكربت
  r.post(['/submit', '/api/public/inbox'], uploadPublic.array('photos', 6), async (req, res) => {
    const wantsJson = req.path.startsWith('/api/') || req.get('accept')?.includes('application/json');
    const fail = (status, message) => wantsJson ? res.status(status).json({ ok: false, message }) : res.status(status).send(layout(site(), { title: 'تعذر الإرسال', body: `<section class="wrap narrow page"><h1>تعذر الإرسال</h1><p>${e(message)}</p><p><a class="btn btn-primary" href="javascript:history.back()">رجوع وإعادة المحاولة</a></p></section>` }));
    if (!sameOrigin(req)) return fail(403, 'طلب من مصدر غير مقبول');
    if (!rateLimit('inbox:' + req.ip, 12, 3600000)) return fail(429, 'أرسلت طلبات كثيرة خلال وقت قصير. حاول بعد قليل أو تواصل عبر الهاتف.');
    try {
      const out = await submitInbox(req.body || {}, req.files || []);
      if (out.error) return fail(400, out.error);
      if (wantsJson) return res.json({ ok: true, duplicate: out.duplicate, receipt: out.receipt, photos_failed: out.photosFailed });
      return res.redirect(303, '/thanks?r=' + encodeURIComponent(out.receipt));
    } catch (err) {
      console.error('[inbox]', err);
      return fail(500, 'حدث خطأ أثناء الحفظ ولم يصل طلبك. حاول مرة أخرى؛ لن يتكرر الطلب.');
    }
  });

  r.get('/thanks', (req, res) => {
    const s = site();
    res.send(layout(s, { title: 'وصل طلبك', body: `<section class="wrap narrow page ok-page"><h1>✓ وصل طلبك</h1><p>رقم الإيصال: <strong dir="ltr">${e(String(req.query.r || '').slice(0, 20))}</strong></p><p>سنتواصل معك في أقرب وقت على الرقم الذي أدخلته.</p><p><a class="btn btn-primary" href="/">تصفح العقارات</a></p></section>` }));
  });

  r.get('/privacy', (req, res) => { const s = site(); res.send(layout(s, { title: 'الخصوصية', body: privacyPage(s) })); });
  r.get('/terms', (req, res) => { const s = site(); res.send(layout(s, { title: 'الشروط', body: termsPage(s) })); });
  r.get('/content-rights', (req, res) => { const s = site(); res.send(layout(s, { title: 'حقوق المحتوى', body: contentPage(s) })); });

  r.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /submit\nSitemap: ${baseUrl(req, site())}/sitemap.xml\n`));
  r.get('/sitemap.xml', (req, res) => {
    const s = site(); const b = baseUrl(req, s);
    const rows = publicReadDb().prepare('SELECT ref, updated_at FROM listings ORDER BY published_at DESC LIMIT 5000').all();
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${b}/</loc></url>\n<url><loc>${b}/request</loc></url>\n<url><loc>${b}/offer</loc></url>\n${rows.map((r) => `<url><loc>${b}/p/${encodeURIComponent(r.ref)}</loc><lastmod>${r.updated_at.slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>`);
  });
  return r;
}

function mapHead(s) {
  // إعدادات الخريطة فقط؛ مكتبة Leaflet تُحمّل عند الحاجة من public.js
  const cfg = { tiles: s.map_tiles_url, attribution: s.map_tiles_attribution, maxZoom: s.map_tiles_max_zoom || 19, center: s.map_center || [18.0858, -15.9785], zoom: s.map_zoom || 12 };
  return `<meta name="wasit-map" content="${e(JSON.stringify(cfg))}">`;
}

function privacyPage(s) {
  return `<section class="wrap narrow page prose"><h1>الخصوصية</h1>
<p>آخر تحديث: ${new Date().toISOString().slice(0, 7)}. تشرح هذه الصفحة كيف يتعامل ${e(s.business_name_legal || s.site_name)} مع المعلومات التي ترسلها عبر هذا الموقع.</p>
<h2>ما نجمعه</h2><p>عند إرسال نموذج («أبحث عن عقار»، «اعرض عقارك»، الاهتمام بعقار، أو الاستفسار) نحفظ ما تكتبه: الاسم إن ذكرته، رقم الهاتف، تفاصيل الطلب أو العرض، والصور التي ترفعها. لا يلزم إنشاء حساب لتصفح الموقع.</p>
<p>لحماية الموقع من الإساءة نستخدم عنوان الشبكة (IP) مؤقتاً في الذاكرة لتحديد عدد الإرسالات، ولا نحفظه مع طلبك. لا نستخدم ملفات تتبع إعلانية.</p>
<h2>كيف نستخدمه</h2><p>للتواصل معك بخصوص طلبك أو عرضك، وللبحث عن عقارات مناسبة لك. لا نبيع بياناتك ولا ننشر رقمك. صور العقار التي ترسلها لا تُنشر إلا بعد مراجعتها والاتفاق معك.</p>
<h2>الصور وبيانات الموقع</h2><p>عند نشر صورة عقار نزيل منها البيانات الوصفية المضمنة مثل إحداثيات GPS. قد يُعرض موقع العقار تقريبياً أو يُخفى حسب ما يتفق عليه مع صاحب العرض.</p>
<h2>المدة وحقوقك</h2><p>نحتفظ بالمعلومات ما دامت لازمة لمتابعة طلبك أو لالتزامات العمل. يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها بالتواصل معنا${s.contact_phone ? ' على ' + e(s.contact_phone) : ''}.</p>
<h2>الحماية</h2><p>نتخذ إجراءات معقولة لحماية البيانات (اتصال مشفر عند تفعيله على الخادم، وصلاحيات مقيدة، ونسخ احتياطية). لا يمكن لأي نظام أن يضمن الحماية المطلقة.</p>
${s.privacy_extra ? `<div>${e(s.privacy_extra).replace(/\n/g, '<br>')}</div>` : ''}
</section>`;
}
function termsPage(s) {
  return `<section class="wrap narrow page prose"><h1>شروط الاستخدام</h1>
<p>هذا الموقع يعرض عقارات يقدمها ${e(s.business_name_legal || s.site_name)} بصفته وسيطاً، ويستقبل طلبات البحث والعروض.</p>
<h2>طبيعة المعلومات</h2><p>المعلومات المعروضة (السعر، المساحة، الموقع، التوفر) هي حسب ما وصل الوسيط من المالك أو المصدر وفي تاريخ تحديثها، وقد تتغير. الموقع على الخريطة توضيحي، والموقع التقريبي مُزاح عمداً.</p>
<p><strong>المنصة لا تثبت ملكية العقار</strong>، ولا تغني عن المعاينة الميدانية والتحقق من الوثائق الرسمية والحدود والالتزامات والرسوم لدى الجهات المختصة.</p>
<h2>العمولات والاتفاقات</h2><p>أي عمولة أو اتفاق يُحدَّد مباشرة بين الأطراف، ولا يُفترض أي نسبة ثابتة.</p>
<h2>ما ترسله</h2><p>عند إرسال عرض فإنك تؤكد أن لك الحق في عرضه وفي مشاركة صوره، وتسمح لنا بمراجعته والتواصل معك بشأنه.</p>
${s.terms_extra ? `<div>${e(s.terms_extra).replace(/\n/g, '<br>')}</div>` : ''}
</section>`;
}
function contentPage(s) {
  return `<section class="wrap narrow page prose"><h1>حقوق المحتوى</h1>
<p>نصوص الإعلانات وصورها ملك أصحابها أو ${e(s.site_name)}، ولا يجوز نسخها لإعادة نشرها دون إذن.</p>
<h2>الخرائط</h2><p>الخرائط الأساسية من <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> (رخصة ODbL) ما لم يُذكر غير ذلك على الخريطة. حدود القطع، إن ظهرت، تُعرض فقط من مصدر موثق مذكور بجانبها، ولا تمثل وثيقة رسمية.</p>
<p>إذا رأيت محتوى تعتقد أنه يخالف حقوقك، تواصل معنا لمراجعته.</p>
</section>`;
}
