// استيراد مخطط PDF مضبوط الإحداثيات (GeoPDF) مباشرة من الهاتف: يُرسم في المتصفح، يُعدَّل ليطابق الخريطة، وتُستخرج أرقام القطع.
import { findGeoViewports, lotLabels } from '@shared/geopdf.js';
import { strokeSegments, lotShapes } from '@shared/lotShapes.js';
import { flatPoly } from '@shared/plans.js';
import { zoneAt } from '@shared/nouakchottZones.js';

const MAX_SIDE = 4096;
const MAX_AREA = 12e6;

let pdfjsP = null;
function loadPdfjs() {
  pdfjsP ||= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, w]) => {
    lib.GlobalWorkerOptions.workerSrc = w.default;
    return lib;
  });
  return pdfjsP;
}

// بايتات الملف كنص latin1 للبحث عن /Measure (قطعاً كي لا يُستهلك الكثير من الذاكرة في السلاسل)
function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
}

export const baseName = (n) => n.replace(/\.(pdf|jpe?g|png|webp|heic|heif)$/i, '').replace(/[_]+/g, ' ').trim();

// خطأ خاص: الملف بلا إحداثيات، فيُعرض على المستخدم ضبطه بنقطتين
export class NoGeoError extends Error {}

export async function readGeoPdf(file, onStep = () => {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const vps = findGeoViewports(latin1(bytes));
  if (!vps.length) throw new NoGeoError('هذا الملف لا يحمل إحداثيات.');
  const vp = vps[0];
  onStep('قراءة المخطط');
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: bytes, verbosity: 0 });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it.transform).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]), font: it.fontName, h: it.transform[1] === 0 && it.transform[2] === 0 }));
    const labels = lotLabels(items, vp.bbox);
    // حدود القطع من خطوط المخطط (تُحسب منها الأضلاع والمساحة)
    onStep('استخراج حدود القطع');
    let shapes = [];
    try { shapes = lotShapes(strokeSegments(await page.getOperatorList(), pdfjs.OPS), labels, vp.bbox, vp.toGeo); } catch { shapes = []; }

    const [x1, y1, x2, y2] = vp.bbox;
    const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    const geo = corners.map(([x, y]) => vp.toGeo(x, y));

    // رسم منطقة الخريطة فقط بدقة تناسب الهاتف
    onStep('رسم المخطط');
    const { canvas: src, toPx } = await renderPage(page, corners);
    onStep('ضبط المخطط على الخريطة');
    const w = await warpToBounds(src, corners.map(toPx), geo);
    onStep('حفظ');

    const name = baseName(file.name);
    const lots = labels.map((l, i) => {
      const [lat, lng] = vp.toGeo(l.x, l.y);
      const sh = shapes[i] && shapes[i].p.length <= 80 ? flatPoly(shapes[i].p) : null;
      return [l.text, +lat.toFixed(7), +lng.toFixed(7), ...(sh ? ['', sh] : [])];
    });
    return { row: planRow({ name, file, georef: 'geopdf', w, lots }), image: w.image };
  } finally {
    task.destroy();
  }
}

export function planRow({ name, file, georef, w, lots = [] }) {
  return {
    name, lotissement: name, moughataa_code: zoneAt((w.south + w.north) / 2, (w.west + w.east) / 2),
    source_name: file.name, source_date: null, georef,
    south: w.south, west: w.west, north: w.north, east: w.east, transparent: w.transparent ? 1 : 0, visible: 1, lots, status_legend: {},
  };
}

// رسم صفحة PDF (أو جزء منها: corners بإحداثيات PDF) على canvas بدقة تناسب الهاتف
async function renderPage(page, corners) {
  const v1 = page.getViewport({ scale: 1 });
  corners ||= [[v1.viewBox[0], v1.viewBox[1]], [v1.viewBox[2], v1.viewBox[1]], [v1.viewBox[2], v1.viewBox[3]], [v1.viewBox[0], v1.viewBox[3]]];
  const pc = corners.map(([x, y]) => v1.convertToViewportPoint(x, y));
  const cw = Math.max(...pc.map((p) => p[0])) - Math.min(...pc.map((p) => p[0]));
  const ch = Math.max(...pc.map((p) => p[1])) - Math.min(...pc.map((p) => p[1]));
  const scale = Math.min(MAX_SIDE / Math.max(cw, ch), Math.sqrt(MAX_AREA / (cw * ch)), 6);
  const v0 = page.getViewport({ scale });
  const pts = corners.map(([x, y]) => v0.convertToViewportPoint(x, y));
  const ox = Math.min(...pts.map((p) => p[0])); const oy = Math.min(...pts.map((p) => p[1]));
  const vp2 = page.getViewport({ scale, offsetX: -ox, offsetY: -oy });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cw * scale); canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport: vp2 }).promise;
  return { canvas, toPx: ([x, y]) => { const p = vp2.convertToViewportPoint(x, y); return [p[0], p[1]]; } };
}

// صورة مخطط بلا إحداثيات (PDF ممسوح أو صورة): تُرسم على canvas ليضبطها المستخدم بنقطتين
export async function renderPlanSource(file) {
  const head = String.fromCharCode(...new Uint8Array(await file.slice(0, 5).arrayBuffer()));
  if (head === '%PDF-' || /\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 });
    try { return trimWhite((await renderPage(await (await task.promise).getPage(1))).canvas); } finally { task.destroy(); }
  }
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height), Math.sqrt(MAX_AREA / (bmp.width * bmp.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return trimWhite(canvas);
}

// قص الهوامش البيضاء حول الصورة الممسوحة (كي لا يغطي إطار الورقة الخريطة)
function trimWhite(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const blank = (x0, y0, x1, y1) => {
    const step = Math.max(1, Math.floor(Math.max(x1 - x0, y1 - y0) / 400));
    for (let y = y0; y < y1; y += y1 - y0 > 1 ? step : 1) for (let x = x0; x < x1; x += x1 - x0 > 1 ? step : 1) {
      const i = (y * w + x) * 4;
      if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) return false;
    }
    return true;
  };
  let t = 0; let b = h; let l = 0; let r = w;
  while (t < b - 1 && blank(0, t, w, t + 1)) t++;
  while (b > t + 1 && blank(0, b - 1, w, b)) b--;
  while (l < r - 1 && blank(l, t, l + 1, b)) l++;
  while (r > l + 1 && blank(r - 1, t, r, b)) r--;
  if (t === 0 && l === 0 && b === h && r === w) return canvas;
  if ((r - l) * (b - t) < 0.2 * w * h) return canvas; // صورة بيضاء في معظمها (مخطط خطوط): لا قص
  const out = document.createElement('canvas');
  out.width = r - l; out.height = b - t;
  out.getContext('2d').drawImage(canvas, l, t, r - l, b - t, 0, 0, r - l, b - t);
  canvas.width = canvas.height = 0;
  return out;
}

// نقل الصورة إلى شبكة خط الطول/العرض. srcPx: أركان الصورة الأربعة بالبكسل، geo: [lat,lng] المقابلة
// تحويل خطي من ثلاثة أركان (الفرق عن الإسقاطي أقل من بكسل في مخططات الأحياء)
export async function warpToBounds(src, srcPx, geo, { keepSource = false } = {}) {
  const south = Math.min(...geo.map((g) => g[0])); const north = Math.max(...geo.map((g) => g[0]));
  const west = Math.min(...geo.map((g) => g[1])); const east = Math.max(...geo.map((g) => g[1]));
  if (![south, north, west, east].every(Number.isFinite) || south < -90 || north > 90 || north - south > 1 || east - west > 1) throw new Error('إحداثيات المخطط غير مفهومة.');
  const latM = 111320; const lngM = 111320 * Math.cos(((south + north) / 2) * Math.PI / 180);
  const aspect = ((east - west) * lngM) / ((north - south) * latM);
  let W = Math.sqrt(src.width * src.height * aspect); let Hh = W / aspect;
  const k = Math.min(1, MAX_SIDE / Math.max(W, Hh)); W = Math.max(1, Math.round(W * k)); Hh = Math.max(1, Math.round(Hh * k));
  const outPx = geo.map(([lat, lng]) => [((lng - west) / (east - west)) * W, ((north - lat) / (north - south)) * Hh]);
  const out = document.createElement('canvas');
  out.width = W; out.height = Hh;
  const octx = out.getContext('2d');
  const [p0, p1, , p3] = srcPx; const [q0, q1, , q3] = outPx;
  const det = (p1[0] - p0[0]) * (p3[1] - p0[1]) - (p3[0] - p0[0]) * (p1[1] - p0[1]);
  const sx = [(p3[1] - p0[1]) / det, -(p3[0] - p0[0]) / det]; const sy = [-(p1[1] - p0[1]) / det, (p1[0] - p0[0]) / det];
  const a = (q1[0] - q0[0]) * sx[0] + (q3[0] - q0[0]) * sy[0]; const c = (q1[0] - q0[0]) * sx[1] + (q3[0] - q0[0]) * sy[1];
  const b = (q1[1] - q0[1]) * sx[0] + (q3[1] - q0[1]) * sy[0]; const dd = (q1[1] - q0[1]) * sx[1] + (q3[1] - q0[1]) * sy[1];
  octx.setTransform(a, b, c, dd, q0[0] - a * p0[0] - c * p0[1], q0[1] - b * p0[0] - dd * p0[1]);
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, 0, 0);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  if (!keepSource) src.width = src.height = 0;

  // مخطط خطوط بلا صورة جوية: الأبيض شفاف كي تظهر الخريطة تحته
  const img = octx.getImageData(0, 0, W, Hh); const d = img.data;
  let white = 0; let filled = 0;
  for (let i = 0; i < d.length; i += 64) if (d[i + 3]) { filled++; if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++; }
  const transparent = filled > 0 && white / filled > 0.55;
  if (transparent) {
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.min(d[i], d[i + 1], d[i + 2]);
      if (m > 235) d[i + 3] = 0; else if (m > 200) d[i + 3] = Math.round(d[i + 3] * (235 - m) / 35);
    }
    octx.putImageData(img, 0, 0);
  }
  let blob = await new Promise((r) => out.toBlob(r, 'image/webp', 0.85));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => out.toBlob(r, transparent ? 'image/png' : 'image/jpeg', 0.85));
  out.width = out.height = 0;
  if (!blob) throw new Error('تعذر تجهيز صورة المخطط على هذا الجهاز.');
  const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[blob.type];
  return { south, west, north, east, transparent, image: new File([blob], 'plan.' + ext, { type: blob.type }) };
}
