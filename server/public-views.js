// قوالب الصفحات العامة (تُولَّد على الخادم: سريعة، مفهرسة لمحركات البحث، ومعاينات واتساب).
import { escapeHtml as e } from '../shared/text.js';
import { TYPES, DEALS_PUBLIC, FEATURES } from '../shared/vocab.js';
import { formatAmountWords, formatNumber, PRICE_BASIS } from '../shared/money.js';
import { displayPhone, normalizePhone } from '../shared/phone.js';

export function priceText(l) {
  if (l.price_hidden || l.price_amount == null) return { main: 'السعر عند التواصل', alt: '' };
  const basis = l.price_basis && l.price_basis !== 'total' ? ' ' + PRICE_BASIS[l.price_basis] : '';
  const mru = l.price_currency === 'MRO' ? l.price_amount / 10 : l.price_amount;
  const mro = mru * 10;
  return { main: `${formatAmountWords(mru)} أوقية جديدة${basis}`, alt: `(${formatAmountWords(mro)} أوقية قديمة)` };
}

const icon = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.47-.72-1.7-.8s-.39-.13-.56.12-.64.8-.78.97-.29.19-.54.06a6.7 6.7 0 0 1-3.3-2.9c-.25-.43.25-.4.71-1.33a.45.45 0 0 0-.02-.42c-.06-.12-.56-1.34-.76-1.84s-.4-.42-.56-.43h-.48a.92.92 0 0 0-.67.31 2.8 2.8 0 0 0-.87 2.08 4.9 4.9 0 0 0 1.02 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.23.75 3.03.63a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .15-1.2c-.06-.1-.23-.17-.48-.29z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z"/></svg>',
  area: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v2H5v5H3zm11 0h7v7h-2V5h-5zM3 14h2v5h5v2H3zm16 0h2v7h-7v-2h5z"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v2H4zm0 6h16v2H4zm0 6h16v2H4z"/></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-6-2-6 2v16l6-2 6 2 6-2V3zm-1 13.7-4-1.3V5.3l4 1.3z"/></svg>',
};
export { icon };

export function layout(site, { title, description, canonical, ogImage, body, staff, head = '', bodyClass = '' }) {
  const t = title ? `${title} | ${site.site_name}` : `${site.site_name} — ${site.site_tagline}`;
  const wa = normalizePhone(site.contact_whatsapp || site.contact_phone || '');
  const tel = normalizePhone(site.contact_phone || '');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(t)}</title>
<meta name="description" content="${e(description || site.site_intro || site.site_tagline)}">
${canonical ? `<link rel="canonical" href="${e(canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_AR">
<meta property="og:site_name" content="${e(site.site_name)}">
<meta property="og:title" content="${e(title || site.site_name)}">
<meta property="og:description" content="${e(description || site.site_tagline)}">
${canonical ? `<meta property="og:url" content="${e(canonical)}">` : ''}
${ogImage ? `<meta property="og:image" content="${e(ogImage)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#0e5a4c">
<link rel="icon" href="/static/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/public.css?v=${site.__v}">
${head}
</head>
<body class="${bodyClass}">
${staff ? `<div class="staffbar"><span>أنت مسجّل كمدير. هذه هي الصفحة كما يراها الزوار.</span><a href="/admin/">مساحة العمل ←</a></div>` : ''}
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/"><img src="/static/icon.svg" alt="" width="34" height="34"><span><strong>${e(site.site_name)}</strong><small>${e(site.site_tagline)}</small></span></a>
    <nav class="main-nav" aria-label="القائمة الرئيسية">
      <a href="/#results">العقارات</a>
      <a href="/request">أبحث عن عقار</a>
      <a href="/offer">اعرض عقارك</a>
    </nav>
    <div class="header-contact">
      ${tel ? `<a class="btn btn-ghost btn-sm" href="tel:+${tel}">${icon.phone}<span>اتصل</span></a>` : ''}
      ${wa ? `<a class="btn btn-wa btn-sm" href="https://wa.me/${wa}" rel="noopener">${icon.wa}<span>واتساب</span></a>` : ''}
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <strong>${e(site.site_name)}</strong>
      <p>${e(site.site_tagline)}</p>
      ${site.office_address ? `<p>${e(site.office_address)}</p>` : ''}
      ${site.office_hours ? `<p>${e(site.office_hours)}</p>` : ''}
    </div>
    <div>
      ${tel ? `<p><a href="tel:+${tel}" dir="ltr">${e(displayPhone(tel))}</a></p>` : ''}
      ${site.contact_email ? `<p><a href="mailto:${e(site.contact_email)}">${e(site.contact_email)}</a></p>` : ''}
    </div>
    <nav aria-label="روابط">
      <a href="/request">أبحث عن عقار</a>
      <a href="/offer">اعرض عقارك</a>
      <a href="/privacy">الخصوصية</a>
      <a href="/terms">الشروط</a>
      <a href="/content-rights">حقوق المحتوى</a>
    </nav>
  </div>
  <div class="wrap footnote">المعلومات المعروضة يقدمها الوسيط حسب ما وصله، ولا تُثبت ملكية العقار ولا تغني عن المعاينة والتحقق من الوثائق والحدود.</div>
</footer>
<script src="/static/public.js?v=${site.__v}" defer></script>
</body>
</html>`;
}

export function card(l, base = '') {
  const photos = safeJson(l.photos);
  const cover = l.cover ? `/media/${encodeURIComponent(l.ref)}/${l.cover}-t.webp` : null;
  const p = priceText(l);
  return `<article class="card" data-ref="${e(l.ref)}">
  <a href="/p/${encodeURIComponent(l.ref)}" class="card-link">
    <div class="card-img${cover ? '' : ' noimg'}">${cover ? `<img src="${cover}" alt="${e(l.title)}" loading="lazy" width="520" height="400">` : `<span>${e(TYPES[l.type] || 'عقار')}</span>`}
      <span class="badge badge-${e(l.deal)}">${e(DEALS_PUBLIC[l.deal] || '')}</span>
      ${photos.length > 1 ? `<span class="count">${photos.length} صور</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-type">${e(TYPES[l.type] || 'عقار')}</div>
      <h3>${e(l.title)}</h3>
      <div class="card-place">${icon.pin}<span>${e(l.place_label)}</span></div>
      <div class="card-meta">
        ${l.area_m2 ? `<span>${icon.area}${formatNumber(l.area_m2)} م²</span>` : ''}
        ${l.lot_number ? `<span>قطعة ${e(l.lot_number)}</span>` : ''}
        ${l.bedrooms ? `<span>${l.bedrooms} غرف</span>` : ''}
      </div>
      <div class="card-price${l.price_hidden ? ' hidden-price' : ''}"><strong>${e(p.main)}</strong>${p.alt ? `<small>${e(p.alt)}</small>` : ''}</div>
    </div>
  </a>
</article>`;
}

export function safeJson(s, d = []) { try { return typeof s === 'string' ? JSON.parse(s) : (s ?? d); } catch { return d; } }

export function searchForm(geo, q, { compact = false } = {}) {
  const opt = (v, label, cur) => `<option value="${e(v)}"${String(cur || '') === String(v) ? ' selected' : ''}>${e(label)}</option>`;
  const locOptions = geo.wilayas.map((w) => `<optgroup label="${e(w.name_ar)}">${opt('w:' + w.code, 'كل ' + w.name_ar, q.loc)}${geo.moughataas.filter((m) => m.wilaya_code === w.code).map((m) => opt('m:' + m.code, m.name_ar, q.loc)).join('')}</optgroup>`).join('');
  const more = q.area_min || q.bedrooms || q.q;
  return `<form class="search${compact ? ' compact' : ''}" action="/" method="get" role="search" id="search-form">
  <div class="seg" role="radiogroup" aria-label="نوع العملية">
    <label><input type="radio" name="deal" value=""${!q.deal ? ' checked' : ''}><span>الكل</span></label>
    <label><input type="radio" name="deal" value="sale"${q.deal === 'sale' ? ' checked' : ''}><span>للبيع</span></label>
    <label><input type="radio" name="deal" value="rent"${q.deal === 'rent' ? ' checked' : ''}><span>للإيجار</span></label>
  </div>
  <div class="fields">
    <label class="f"><span>نوع العقار</span><select name="type">${opt('', 'كل الأنواع', q.type)}${Object.entries(TYPES).map(([k, v]) => opt(k, v, q.type)).join('')}</select></label>
    <label class="f"><span>الموقع</span><select name="loc">${opt('', 'كل موريتانيا', q.loc)}${locOptions}</select></label>
    <label class="f price-f"><span>السعر الأقصى</span><span class="pair"><input name="max" inputmode="decimal" placeholder="مثلاً 5" value="${e(q.max || '')}"><select name="unit" aria-label="وحدة السعر">${opt('m_mru', 'مليون أوقية جديدة', q.unit || 'm_mru')}${opt('m_mro', 'مليون أوقية قديمة', q.unit)}${opt('k_mru', 'ألف أوقية جديدة', q.unit)}</select></span></label>
  </div>
  <details class="more"${more ? ' open' : ''}><summary>فلاتر إضافية</summary>
    <div class="fields">
      <label class="f"><span>المساحة من (م²)</span><input name="area_min" inputmode="numeric" value="${e(q.area_min || '')}"></label>
      <label class="f"><span>غرف على الأقل</span><input name="bedrooms" inputmode="numeric" value="${e(q.bedrooms || '')}"></label>
      <label class="f"><span>كلمة، حي، معلم، أو رقم قطعة</span><input name="q" value="${e(q.q || '')}" placeholder="مثلاً: كارفور مدريد"></label>
    </div>
  </details>
  <input type="hidden" name="view" value="${e(q.view || 'list')}">
  <button class="btn btn-primary" type="submit">ابحث</button>
</form>`;
}

export function inboxForm(kind, { token, site, property, prefill = {} }) {
  const common = `<input type="hidden" name="kind" value="${kind}"><input type="hidden" name="client_token" value="${e(token)}">
  <div class="hp" aria-hidden="true"><label>اترك هذا الحقل فارغاً<input name="website" tabindex="-1" autocomplete="off"></label></div>`;
  const nameF = `<label class="f"><span>الاسم</span><input name="name" autocomplete="name" maxlength="120" value="${e(prefill.name || '')}"></label>`;
  const phoneF = `<label class="f"><span>رقم الهاتف أو واتساب <b class="req">*</b></span><input name="phone" type="tel" inputmode="tel" dir="ltr" autocomplete="tel" required maxlength="25" placeholder="مثلاً 22 33 44 55" value="${e(prefill.phone || '')}"></label>`;
  const contactPref = `<fieldset class="f inline"><legend>التواصل المفضل</legend><label><input type="radio" name="contact_pref" value="whatsapp" checked> واتساب</label><label><input type="radio" name="contact_pref" value="call"> اتصال</label></fieldset>`;
  const dealF = (label) => `<fieldset class="f inline"><legend>${label}</legend><label><input type="radio" name="deal" value="sale" checked> بيع</label><label><input type="radio" name="deal" value="rent"> إيجار</label></fieldset>`;
  const typeF = `<label class="f"><span>نوع العقار</span><select name="type"><option value="">—</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${e(v)}</option>`).join('')}</select></label>`;
  let fields = '';
  if (kind === 'search') fields = `${dealF('أبحث عن')}${typeF}
    <label class="f"><span>المكان المطلوب</span><input name="location" maxlength="200" placeholder="مثلاً: تفرغ زينة أو قرب كارفور مدريد"></label>
    <label class="f"><span>الميزانية التقريبية</span><input name="budget" maxlength="100" placeholder="مثلاً: 30 مليون قديمة"></label>
    <label class="f"><span>تفاصيل أخرى</span><textarea name="message" rows="3" maxlength="2000" placeholder="المساحة، عدد الغرف، أي شرط مهم"></textarea></label>
    ${nameF}${phoneF}${contactPref}`;
  if (kind === 'offer') fields = `${dealF('العرض')}${typeF}
    <label class="f"><span>المكان</span><input name="location" maxlength="200" placeholder="الحي، المقاطعة، أو معلم قريب"></label>
    <label class="f"><span>المساحة (م²)</span><input name="area" inputmode="decimal" maxlength="20"></label>
    <label class="f"><span>السعر المطلوب</span><input name="price" maxlength="100" placeholder="اذكر العملة: قديمة أو جديدة"></label>
    <label class="f"><span>وصف مختصر</span><textarea name="message" rows="3" maxlength="2000"></textarea></label>
    <label class="f"><span>صور (اختياري، حتى 6)</span><input type="file" name="photos" accept="image/*" multiple data-max="6"><small class="hint">تُرسل الصور إلينا فقط، ولا تُنشر دون مراجعة.</small></label>
    <fieldset class="f inline"><legend>صفتك</legend><label><input type="radio" name="relation" value="owner" checked> المالك</label><label><input type="radio" name="relation" value="broker"> وسيط</label><label><input type="radio" name="relation" value="other"> أخرى</label></fieldset>
    ${nameF}${phoneF}${contactPref}`;
  if (kind === 'interest') fields = `<input type="hidden" name="property_ref" value="${e(property?.ref || '')}">
    ${nameF}${phoneF}
    <label class="f"><span>رسالتك (اختياري)</span><textarea name="message" rows="2" maxlength="1000" placeholder="مثلاً: أريد المعاينة يوم السبت"></textarea></label>
    ${contactPref}`;
  if (kind === 'contact') fields = `${nameF}${phoneF}<label class="f"><span>رسالتك <b class="req">*</b></span><textarea name="message" rows="3" maxlength="2000" required></textarea></label>${contactPref}`;
  const btn = { search: 'أرسل طلبي', offer: 'أرسل العرض', interest: 'أنا مهتم، تواصلوا معي', contact: 'أرسل' }[kind];
  return `<form class="inbox-form" method="post" action="/submit" enctype="multipart/form-data" data-kind="${kind}" novalidate>
  ${common}
  ${fields}
  <p class="hint">نستخدم بياناتك للتواصل معك بخصوص طلبك فقط. <a href="/privacy">الخصوصية</a></p>
  <div class="form-status" role="status" aria-live="polite"></div>
  <button class="btn btn-primary btn-block" type="submit">${btn}</button>
</form>`;
}

export function featuresList(l) {
  return safeJson(l.features).map((f) => FEATURES[f]).filter(Boolean);
}
