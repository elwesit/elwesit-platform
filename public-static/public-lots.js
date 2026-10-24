// صفحة «ابحث عن قطعة»: خانات مترابطة (المقاطعة ← المنطقة ← المخطط ← الرقم)، ثم القطعة وحدها على الخريطة.
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (x) => Number(x).toLocaleString('ar-u-nu-latn', { maximumFractionDigits: 1 });
  const form = $('#lot-form'); if (!form) return;
  const { m: selM, a: selA, plan: selP, lot: inLot } = form.elements;
  const status = $('#lot-status'), card = $('#lot-card');
  const NO_AREA = '-';
  let plans = [], map = null, layer = null;
  const say = (cls, msg) => { status.className = 'form-status ' + cls; status.textContent = msg; };
  const opts = (sel, first, list) => { sel.innerHTML = `<option value="">${esc(first)}</option>` + list.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); };

  // الخانات: كل خانة تعرض ما يتبع السابقة فقط، وتغييرها يمسح ما بعدها
  const inM = () => plans.filter((p) => p.m === selM.value);
  const inA = () => inM().filter((p) => !selA.value || (selA.value === NO_AREA ? !p.area : p.area === selA.value));
  function fillM() {
    const by = {};
    for (const p of plans) (by[p.m] ||= { name: p.m_name, n: 0 }).n++;
    opts(selM, Object.keys(by).length ? 'اختر المقاطعة' : 'لا توجد مخططات متاحة بعد', Object.entries(by).sort((x, y) => x[1].name.localeCompare(y[1].name, 'ar')).map(([k, v]) => [k, `${v.name} (${v.n})`]));
  }
  function fillA() {
    const areas = {}; let none = 0;
    for (const p of inM()) p.area ? (areas[p.area] = (areas[p.area] || 0) + 1) : none++;
    const list = Object.entries(areas).sort((x, y) => x[0].localeCompare(y[0], 'ar')).map(([k, n]) => [k, `${k} (${n})`]);
    if (none) list.push([NO_AREA, `بلا منطقة محددة (${none})`]);
    opts(selA, list.length ? 'كل المناطق' : 'لا مناطق محددة', list);
    selA.disabled = !selM.value;
  }
  function fillP() {
    opts(selP, 'اختر المخطط', inA().map((p) => [p.id, p.label + (p.verified ? '' : ' (المقاطعة تقديرية)')]));
    selP.disabled = !selM.value;
  }
  const clear = () => { card.hidden = true; card.innerHTML = ''; layer?.clearLayers(); say('', ''); };
  selM.addEventListener('change', () => { fillA(); fillP(); clear(); });
  selA.addEventListener('change', () => { fillP(); clear(); });
  selP.addEventListener('change', () => { clear(); if (inLot.value.trim() && selP.value) find(); });

  async function ensureMap() {
    if (map) return;
    const L = await window.wasitMap.loadLeaflet();
    map = window.wasitMap.baseMap($('#lot-map'));
    layer = L.layerGroup().addTo(map);
  }

  async function find() {
    clear();
    if (!selP.value) { say('err', 'اختر المقاطعة ثم المخطط أولاً.'); selP.disabled ? selM.focus() : selP.focus(); return; }
    const lot = inLot.value.trim();
    if (!lot) { say('err', 'اكتب رقم القطعة.'); inLot.focus(); return; }
    say('wait', 'جارٍ البحث…');
    let j;
    try {
      const r = await fetch(`/api/public/lots?plan=${encodeURIComponent(selP.value)}&lot=${encodeURIComponent(lot)}`, { headers: { Accept: 'application/json' } });
      j = await r.json();
      if (!r.ok) throw new Error(j.message || 'تعذر البحث');
    } catch (e) { say('err', e.message || 'تعذر البحث، تحقق من الاتصال.'); return; }
    history.replaceState(null, '', `?plan=${encodeURIComponent(selP.value)}&lot=${encodeURIComponent(lot)}`);
    if (!j.hits.length) { say('err', `القطعة ${lot} غير موجودة في فهرس «${j.plan.label}». تأكد من الرقم ومن المخطط، أو راسلنا لنبحث لك.`); return; }
    say('', j.hits.length > 1 ? `الرقم ${lot} يتكرر ${j.hits.length} مرات في هذا المخطط (تجزئات مختلفة):` : '');
    await ensureMap();
    show(j, 0);
  }

  function show(j, i) {
    const L = window.L, h = j.hits[i], pr = h.precision;
    layer.clearLayers();
    if (h.shape && pr.level === 'plan') {
      L.polygon(h.shape.poly, { color: '#7a4ab8', weight: 3, fillOpacity: 0.18 }).addTo(layer);
      h.shape.poly.forEach((p, k) => {
        const q = h.shape.poly[(k + 1) % h.shape.poly.length];
        if (h.shape.sides[k] < 2) return;
        L.marker([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], { interactive: false, icon: L.divIcon({ className: 'lot-side', html: `<span>${num(h.shape.sides[k])} م</span>`, iconSize: null }) }).addTo(layer);
      });
      map.fitBounds(L.latLngBounds(h.shape.poly).pad(0.8), { maxZoom: 19 });
    } else {
      // موقع غير مؤكد: دائرة متقطعة لا حدود
      L.circle([h.lat, h.lng], { radius: 20, color: '#b8860b', weight: 2, dashArray: '5 4', fillOpacity: 0.1 }).addTo(layer);
      map.setView([h.lat, h.lng], 18);
    }
    const others = j.hits.length > 1 ? `<p class="lot-pick">${j.hits.map((x, k) => `<button type="button" class="btn btn-sm ${k === i ? 'btn-primary' : 'btn-outline'}" data-k="${k}">موضع ${k + 1}</button>`).join(' ')}</p>` : '';
    const wa = j.wa ? `https://wa.me/${j.wa}?text=${encodeURIComponent(`السلام عليكم، أستفسر عن القطعة ${h.lot} في مخطط ${j.plan.label}${j.plan.area ? ' (' + j.plan.area + ')' : ''}.\n${location.href}`)}` : '';
    card.innerHTML = `${others}
      <h2>قطعة ${esc(h.lot)} · ${esc(j.plan.label)} <span class="tag prec-${esc(pr.level)}">${esc(pr.label)}</span></h2>
      <p class="muted">${esc(pr.text)}</p>
      <ul class="lot-facts">
        ${h.shape && pr.level === 'plan' ? `<li><b>المساحة</b> ${num(h.shape.area)} م² تقريباً</li><li><b>الأضلاع</b> ${esc(h.sides_text)}</li>` : '<li>الحدود والمساحة غير متوفرة لهذه القطعة.</li>'}
        ${h.elevation != null ? `<li><b>الارتفاع التقريبي عن سطح البحر</b> ${num(h.elevation)} م</li>` : ''}
        ${h.status ? `<li><b>الحالة في المخطط</b> ${esc(h.status)}</li>` : ''}
        ${j.plan.area ? `<li><b>المنطقة</b> ${esc(j.plan.area)}${j.plan.verified ? '' : ' (تقديرية)'}</li>` : ''}
      </ul>
      ${j.listings.length ? `<p><b>معروضة لدينا:</b> ${j.listings.map((l) => `<a href="${esc(l.url)}">${esc(l.title)}</a>`).join('، ')}</p>` : ''}
      <div class="lot-actions">${wa ? `<a class="btn btn-wa" href="${esc(wa)}" rel="noopener">استفسر عن هذه القطعة عبر واتساب</a>` : ''}<a class="btn btn-outline" href="https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}" rel="noopener" target="_blank">الاتجاهات</a></div>
      <p class="hint">الأضلاع والمساحة محسوبة من خطوط المخطط، والارتفاع من نموذج Copernicus (دقته بضعة أمتار). للاسترشاد فقط.</p>`;
    card.hidden = false;
    card.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => show(j, +b.dataset.k)));
    setTimeout(() => map.invalidateSize(), 50);
    $('#lot-map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); find(); });

  fetch('/api/public/lots/plans', { headers: { Accept: 'application/json' } }).then((r) => r.json()).then((j) => {
    plans = j.plans || [];
    fillM(); fillA(); fillP();
    // رابط مشاركة: ?plan=…&lot=…
    const q = new URLSearchParams(location.search), p = plans.find((x) => x.id === q.get('plan'));
    if (p) {
      selM.value = p.m; fillA(); selA.value = p.area || NO_AREA; fillP(); selP.value = p.id;
      inLot.value = q.get('lot') || '';
      if (inLot.value) find();
    }
  }).catch(() => say('err', 'تعذر تحميل المخططات، تحقق من الاتصال.'));
});
