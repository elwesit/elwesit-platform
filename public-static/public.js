// سلوك الموقع العام: عرض المزيد، التبديل بين القائمة والخريطة، الخرائط عند الطلب، المشاركة، والنماذج.
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const mapCfg = (() => { try { return JSON.parse($('meta[name="wasit-map"]')?.content || '{}'); } catch { return {}; } })();

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  // ---------- Leaflet عند الحاجة فقط ----------
  let leafletP = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js'; s.onload = () => resolve(window.L); s.onerror = () => { leafletP = null; reject(new Error('map')); };
      document.head.appendChild(s);
    });
    return leafletP;
  }
  function baseMap(el, center, zoom) {
    const L = window.L;
    const m = L.map(el, { scrollWheelZoom: false, tap: true }).setView(center || mapCfg.center || [18.0858, -15.9785], zoom || mapCfg.zoom || 12);
    L.tileLayer(mapCfg.tiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: mapCfg.maxZoom || 19, attribution: mapCfg.attribution || '&copy; OpenStreetMap' }).addTo(m);
    m.attributionControl.setPrefix(false);
    return m;
  }
  const pinIcon = () => window.L.divIcon({ className: 'wpin', html: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="#0e5a4c" stroke="#fff" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>', iconSize: [30, 30], iconAnchor: [15, 29], popupAnchor: [0, -26] });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- صفحة النتائج ----------
  const results = $('#results');
  if (results) {
    const query = results.dataset.query || '';
    let map = null, layer = null;
    async function showMap() {
      $('#map-panel').hidden = false; $('#list-panel').hidden = true;
      const el = $('#map');
      if (map) { map.invalidateSize(); return; }
      el.innerHTML = '<p class="muted" style="padding:16px">جارٍ تحميل الخريطة…</p>';
      try { await loadLeaflet(); } catch { el.innerHTML = '<p style="padding:16px">تعذر تحميل الخريطة. تحقق من الاتصال وأعد المحاولة.</p>'; return; }
      el.innerHTML = '';
      map = baseMap(el);
      layer = window.L.featureGroup().addTo(map);
      const params = new URLSearchParams(query); params.set('map', '1'); params.delete('view');
      const r = await fetch('/api/public/listings?' + params, { headers: { Accept: 'application/json' } }).then((x) => x.json()).catch(() => null);
      if (!r) { toast('تعذر جلب العقارات للخريطة'); return; }
      for (const l of r.items) {
        const html = `<div class="mini">${l.cover ? `<img src="${esc(l.cover)}" alt="">` : ''}<div><b>${esc(l.title)}</b><span>${esc(l.price)}</span><br>${l.area_m2 ? esc(l.area_m2) + ' م² · ' : ''}${l.loc_mode === 'approximate' ? 'موقع تقريبي' : 'موقع محدد'}<br><a href="${esc(l.url)}">التفاصيل ←</a></div></div>`;
        if (l.loc_mode === 'approximate') window.L.circle([l.lat, l.lng], { radius: l.radius_m || 500, color: '#b57d21', weight: 2, fillOpacity: 0.15 }).bindPopup(html).addTo(layer);
        else window.L.marker([l.lat, l.lng], { icon: pinIcon() }).bindPopup(html).addTo(layer);
      }
      if (r.items.length) map.fitBounds(layer.getBounds().pad(0.15), { maxZoom: 15 });
      const note = $('.map-note');
      if (note) note.textContent = `${r.items.length} عقار على الخريطة${r.without_location ? ` · ${r.without_location} بدون موقع على الخريطة (تظهر في القائمة)` : ''}. الدوائر = موقع تقريبي. العلامة لا تثبت حدود العقار أو ملكيته.`;
    }
    function showList() { $('#map-panel').hidden = true; $('#list-panel').hidden = false; }
    $$('.view-toggle a').forEach((a) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      $$('.view-toggle a').forEach((x) => { x.classList.toggle('on', x === a); x.setAttribute('aria-selected', x === a); });
      const v = a.dataset.view;
      const u = new URL(location.href); u.searchParams.set('view', v); history.replaceState(null, '', u);
      const hv = $('#search-form input[name="view"]'); if (hv) hv.value = v;
      v === 'map' ? showMap() : showList();
    }));
    if (!$('#map-panel').hidden) showMap();

    const more = $('#load-more');
    if (more) more.addEventListener('click', async (ev) => {
      ev.preventDefault();
      more.setAttribute('disabled', ''); more.textContent = 'جارٍ التحميل…';
      const params = new URLSearchParams(query); params.set('cursor', more.dataset.next);
      try {
        const r = await fetch('/api/public/listings?' + params, { headers: { Accept: 'application/json' } }).then((x) => { if (!x.ok) throw 0; return x.json(); });
        $('#grid').insertAdjacentHTML('beforeend', r.html);
        if (r.next) { more.dataset.next = r.next; more.removeAttribute('disabled'); more.textContent = 'عرض المزيد'; }
        else more.parentElement.remove();
      } catch { more.removeAttribute('disabled'); more.textContent = 'تعذر التحميل — أعد المحاولة'; }
    });
  }

  // ---------- خريطة صفحة العقار ----------
  const pmap = $('#pmap');
  if (pmap) {
    const btn = $('.map-load', pmap);
    btn?.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'جارٍ تحميل الخريطة…';
      try { await loadLeaflet(); } catch { btn.disabled = false; btn.textContent = 'تعذر التحميل — أعد المحاولة'; return; }
      pmap.innerHTML = '';
      const lat = +pmap.dataset.lat, lng = +pmap.dataset.lng, mode = pmap.dataset.mode;
      const m = baseMap(pmap, [lat, lng], mode === 'approximate' ? 15 : 17);
      if (mode === 'approximate') {
        const c = window.L.circle([lat, lng], { radius: +pmap.dataset.radius || 500, color: '#b57d21', weight: 2, fillOpacity: 0.15 }).addTo(m).bindTooltip('موقع تقريبي', { permanent: true, direction: 'center' });
        m.fitBounds(c.getBounds());
      } else window.L.marker([lat, lng], { icon: pinIcon() }).addTo(m);
      if (pmap.dataset.boundary) { try { window.L.geoJSON(JSON.parse(pmap.dataset.boundary), { style: { color: '#0e5a4c', weight: 2, fillOpacity: 0.1 } }).addTo(m); } catch {} }
    });
  }

  // ---------- مشاركة ----------
  $$('.share-btn').forEach((b) => b.addEventListener('click', async () => {
    const data = { title: b.dataset.title, text: b.dataset.title, url: b.dataset.url };
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(b.dataset.url); toast('نُسخ الرابط'); }
    catch { prompt('انسخ الرابط:', b.dataset.url); }
  }));

  // ---------- النماذج ----------
  // ضغط الصور في المتصفح (يحوّل HEIC إلى JPEG حيث يستطيع المتصفح قراءته، ويزيل بيانات الموقع المضمنة)
  async function compress(file) {
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) return file;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.84));
      return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch { return file; }
  }
  const draftKey = (f) => 'wasit-draft:' + f.dataset.kind + ':' + location.pathname;
  function saveDraft(f) {
    const data = {};
    for (const el of f.elements) if (el.name && el.type !== 'file' && el.name !== 'website') { if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue; data[el.name] = el.value; }
    try { localStorage.setItem(draftKey(f), JSON.stringify(data)); } catch {}
  }
  function restoreDraft(f) {
    let data; try { data = JSON.parse(localStorage.getItem(draftKey(f)) || 'null'); } catch { data = null; }
    if (!data) return;
    for (const el of f.elements) {
      if (!el.name || !(el.name in data) || el.type === 'file') continue;
      if (el.type === 'radio') el.checked = el.value === data[el.name]; else el.value = data[el.name];
    }
  }
  $$('form.inbox-form').forEach((f) => {
    restoreDraft(f);
    f.addEventListener('input', () => saveDraft(f));
    const status = $('.form-status', f);
    const btn = $('button[type="submit"]', f);
    const setStatus = (cls, msg) => { status.className = 'form-status ' + cls; status.textContent = msg; };
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const phone = f.elements.phone?.value || '';
      if (phone.replace(/\D/g, '').length < 8) { setStatus('err', 'اكتب رقم هاتف صحيحاً (8 أرقام).'); f.elements.phone.focus(); return; }
      if (f.elements.message?.required && !f.elements.message.value.trim()) { setStatus('err', 'اكتب رسالتك.'); return; }
      const photos = f.elements.photos?.files ? Array.from(f.elements.photos.files).slice(0, 6) : [];
      btn.disabled = true;
      setStatus('wait', photos.length ? 'جارٍ تجهيز الصور والإرسال…' : 'جارٍ الإرسال…');
      const fd = new FormData();
      for (const el of f.elements) if (el.name && el.type !== 'file') { if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue; fd.append(el.name, el.value); }
      for (const p of photos) fd.append('photos', await compress(p));
      try {
        const r = await fetch('/api/public/inbox', { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.message || 'تعذر الإرسال');
        try { localStorage.removeItem(draftKey(f)); } catch {}
        f.querySelectorAll('input:not([type=hidden]), textarea, select, button').forEach((x) => (x.disabled = true));
        setStatus('ok', `✓ وصل طلبك (رقم الإيصال ${j.receipt}). سنتواصل معك قريباً.${j.photos_failed ? ` تعذر استلام ${j.photos_failed} صورة؛ يمكنك إرسالها عبر واتساب.` : ''}`);
        status.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (e) {
        btn.disabled = false;
        const offline = !navigator.onLine || e instanceof TypeError;
        setStatus('err', offline ? 'لا يوجد اتصال بالإنترنت. معلوماتك محفوظة على هذا الجهاز؛ اضغط «إرسال» مجدداً عند عودة الاتصال، ولن يتكرر الطلب.' : `${e.message}. معلوماتك ما زالت هنا؛ يمكنك إعادة المحاولة.`);
      }
    });
  });
})();
