import React, { useEffect, useRef, useState } from 'react';
import { Sheet, Btn, Field, Input } from './ui.jsx';
import { loadLeaflet, tileLayer, useSettings, attachPlans } from './components.jsx';
import { twoPointGeo } from '@shared/geopdf.js';
import { renderPlanSource, warpToBounds, planRow, baseName } from './geopdfImport.js';
import { table } from './data.js';

const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LETTERS = ['أ', 'ب'];
const ptIcon = (L, i, color) => L.divIcon({ className: 'align-pt', html: `<span style="background:${color}">${LETTERS[i]}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });

// ضبط مخطط بلا إحداثيات (PDF ممسوح أو صورة) بنقطتين: نقطة على المخطط ثم المكان نفسه على الخريطة، مرتين
export default function PlanAlign({ file, onDone, onClose }) {
  const settings = useSettings();
  const el = useRef();
  const st = useRef({});
  const [step, setStep] = useState('load'); // load → plan → map → check
  const [imgPts, setImgPts] = useState([]);
  const [geoPts, setGeoPts] = useState([]);
  const [name, setName] = useState(baseName(file.name));
  const [result, setResult] = useState(null);
  const [opacity, setOpacity] = useState(0.7);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // تجهيز الصورة مرة واحدة
  useEffect(() => {
    let dead = false;
    Promise.all([loadLeaflet(), renderPlanSource(file)]).then(async ([L, canvas]) => {
      if (dead) { canvas.width = canvas.height = 0; return; }
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      st.current = { L, canvas, url: URL.createObjectURL(blob) };
      setStep('plan');
    }).catch((e) => setMsg('تعذر فتح الملف: ' + (e?.message || '')));
    return () => { dead = true; const s = st.current; s.map?.remove(); if (s.url) URL.revokeObjectURL(s.url); if (s.preview) URL.revokeObjectURL(s.preview); if (s.canvas) s.canvas.width = s.canvas.height = 0; };
  }, []); // eslint-disable-line

  // خريطة لكل خطوة (لا تُعاد عند إضافة نقطة كي لا يضيع التقريب)
  useEffect(() => {
    const s = st.current; const L = s.L;
    if (!L || step === 'load') return;
    s.map?.remove(); s.map = null;
    const { width: w, height: h } = s.canvas;
    let map;
    if (step === 'plan') {
      map = L.map(el.current, { crs: L.CRS.Simple, minZoom: -6, maxZoom: 4, zoomSnap: 0.25, attributionControl: false });
      const b = [[0, 0], [h, w]];
      L.imageOverlay(s.url, b).addTo(map);
      map.fitBounds(b);
      map.on('click', (e) => setImgPts((a) => (a.length >= 2 ? a : [...a, [Math.max(0, Math.min(w, e.latlng.lng)), Math.max(0, Math.min(h, h - e.latlng.lat))]])));
    } else {
      map = L.map(el.current).setView(geoPts[0] || settings.map_center || [18.0858, -15.9785], geoPts.length ? 17 : 13);
      map.attributionControl.setPrefix(false);
      const osm = tileLayer(L, settings);
      const sat = L.tileLayer(SAT_URL, { maxZoom: 19, attribution: 'صور: Esri, Maxar, Earthstar Geographics' });
      sat.addTo(map);
      L.control.layers({ 'صورة جوية': sat, 'خريطة': osm }, null, { position: 'topleft' }).addTo(map);
      attachPlans(L, map, table('plans'));
      if (step === 'map') map.on('click', (e) => setGeoPts((a) => (a.length >= 2 ? a : [...a, [e.latlng.lat, e.latlng.lng]])));
      if (step === 'check' && result) {
        const bb = [[result.w.south, result.w.west], [result.w.north, result.w.east]];
        s.overlay = L.imageOverlay(s.preview, bb, { opacity }).addTo(map);
        map.fitBounds(bb);
      }
    }
    s.layer = L.layerGroup().addTo(map);
    s.map = map;
    setTimeout(() => map.invalidateSize(), 150);
  }, [step, result]); // eslint-disable-line

  // النقاط
  useEffect(() => {
    const s = st.current; const L = s.L;
    if (!s.layer) return;
    s.layer.clearLayers();
    if (step === 'plan') {
      const h = s.canvas.height;
      imgPts.forEach((p, i) => L.marker([h - p[1], p[0]], { icon: ptIcon(L, i, '#b5179e'), draggable: true }).addTo(s.layer).on('dragend', (e) => { const q = e.target.getLatLng(); setImgPts((a) => a.map((x, j) => (j === i ? [q.lng, h - q.lat] : x))); }));
    } else {
      geoPts.forEach((p, i) => L.marker(p, { icon: ptIcon(L, i, '#0e5a4c'), draggable: step === 'map' }).addTo(s.layer).on('dragend', (e) => { const q = e.target.getLatLng(); setGeoPts((a) => a.map((x, j) => (j === i ? [q.lat, q.lng] : x))); }));
    }
  }, [step, result, imgPts, geoPts]); // eslint-disable-line

  useEffect(() => { st.current.overlay?.setOpacity(opacity); }, [opacity]);

  const compute = async () => {
    const s = st.current;
    const t = twoPointGeo(imgPts[0], imgPts[1], geoPts[0], geoPts[1]);
    if (!t) { setMsg('النقطتان متقاربتان جداً. اختر نقطتين بعيدتين عن بعضهما (طرفي المخطط مثلاً).'); return; }
    setBusy(true); setMsg(null);
    try {
      const { width: w, height: h } = s.canvas;
      const corners = [[0, 0], [w, 0], [w, h], [0, h]];
      const r = await warpToBounds(s.canvas, corners, corners.map(([x, y]) => t.toGeo(x, y)), { keepSource: true });
      if (s.preview) URL.revokeObjectURL(s.preview);
      s.preview = URL.createObjectURL(r.image);
      setResult({ w: r, t });
      setStep('check');
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  const save = () => {
    const nm = name.trim() || baseName(file.name);
    onDone({ row: planRow({ name: nm, file, georef: 'points', w: result.w }), image: result.w.image });
  };

  const hint = {
    load: 'جارٍ فتح المخطط…',
    plan: imgPts.length < 2 ? `على المخطط: المس النقطة ${LETTERS[imgPts.length]} (تقاطع طريقين أو ركن واضح تعرفه على الأرض). ${imgPts.length ? 'اجعل النقطة ب بعيدة عن أ.' : ''}` : 'يمكنك سحب النقطتين لتدقيقهما، ثم التالي.',
    map: geoPts.length < 2 ? `على الخريطة: المس مكان النقطة ${LETTERS[geoPts.length]} نفسها على الأرض.` : 'اسحب النقطتين للتدقيق إن لزم، ثم «اعرض النتيجة».',
    check: 'تأكد أن الطرق في المخطط تقع فوق الطرق في الصورة الجوية. إن لم تتطابق، عدّل النقاط.',
  }[step];

  const footer = step === 'plan'
    ? <><Btn onClick={() => setImgPts([])} disabled={!imgPts.length}>إعادة النقاط</Btn><Btn kind="primary" disabled={imgPts.length < 2} onClick={() => setStep('map')}>التالي</Btn></>
    : step === 'map'
      ? <><Btn onClick={() => setStep('plan')}>رجوع للمخطط</Btn><Btn onClick={() => setGeoPts([])} disabled={!geoPts.length}>إعادة النقاط</Btn><Btn kind="primary" disabled={geoPts.length < 2 || busy} onClick={compute}>{busy ? 'جارٍ الضبط…' : 'اعرض النتيجة'}</Btn></>
      : step === 'check'
        ? <><Btn onClick={() => { setResult(null); setStep('map'); }}>تعديل النقاط</Btn><Btn kind="primary" onClick={save}>حفظ المخطط</Btn></>
        : null;

  return <Sheet title={`ضبط المخطط: ${file.name}`} onClose={onClose} wide footer={footer}>
    {step === 'check' && <Field label="اسم المخطط"><Input value={name} onChange={setName} /></Field>}
    <p className="hint align-hint">{hint}</p>
    {msg && <p className="form-msg">{msg}</p>}
    <div ref={el} className="map map-pick map-align" />
    {step === 'check' && result && <>
      <label className="inline-check opacity-ctl">شفافية المخطط <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></label>
      <p className="muted small">المقياس: {result.t.metersPerPx < 1 ? `${Math.round(result.t.metersPerPx * 100)} سم` : `${result.t.metersPerPx.toFixed(1)} م`} لكل بكسل · دوران {Math.round(result.t.rotationDeg)}°</p>
    </>}
  </Sheet>;
}
