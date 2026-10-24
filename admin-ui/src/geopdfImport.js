// استيراد مخطط PDF مضبوط الإحداثيات (GeoPDF) مباشرة من الهاتف: يُرسم في المتصفح، يُعدَّل ليطابق الخريطة، وتُستخرج أرقام القطع.
import { findGeoViewports, lotLabels } from '@shared/geopdf.js';
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

const baseName = (n) => n.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();

export async function readGeoPdf(file, onStep = () => {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const vps = findGeoViewports(latin1(bytes));
  if (!vps.length) throw new Error('هذا الملف لا يحمل إحداثيات (ليس GeoPDF). صدّره من ArcMap/QGIS مع خيار الإحداثيات، أو أرسله لنا لضبطه بنقاط مرجعية.');
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

    // حدود المخطط على الأرض
    const [x1, y1, x2, y2] = vp.bbox;
    const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    const geo = corners.map(([x, y]) => vp.toGeo(x, y));
    const south = Math.min(...geo.map((g) => g[0])); const north = Math.max(...geo.map((g) => g[0]));
    const west = Math.min(...geo.map((g) => g[1])); const east = Math.max(...geo.map((g) => g[1]));
    if (![south, north, west, east].every(Number.isFinite) || south < -90 || north > 90 || north - south > 1 || east - west > 1) throw new Error('إحداثيات الملف غير مفهومة.');

    // رسم منطقة الخريطة فقط بدقة تناسب الهاتف
    onStep('رسم المخطط');
    const v1 = page.getViewport({ scale: 1 });
    const pc = corners.map(([x, y]) => v1.convertToViewportPoint(x, y));
    const cw = Math.max(...pc.map((p) => p[0])) - Math.min(...pc.map((p) => p[0]));
    const ch = Math.max(...pc.map((p) => p[1])) - Math.min(...pc.map((p) => p[1]));
    const scale = Math.min(MAX_SIDE / Math.max(cw, ch), Math.sqrt(MAX_AREA / (cw * ch)), 6);
    const v0 = page.getViewport({ scale });
    const pts = corners.map(([x, y]) => v0.convertToViewportPoint(x, y));
    const ox = Math.min(...pts.map((p) => p[0])); const oy = Math.min(...pts.map((p) => p[1]));
    const vp2 = page.getViewport({ scale, offsetX: -ox, offsetY: -oy });
    const src = document.createElement('canvas');
    src.width = Math.round(cw * scale); src.height = Math.round(ch * scale);
    const sctx = src.getContext('2d');
    sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, src.width, src.height);
    await page.render({ canvasContext: sctx, canvas: src, viewport: vp2 }).promise;

    // نقل الصورة إلى شبكة خط الطول/العرض (تحويل خطي يكفي لمخطط بحجم حي)
    onStep('ضبط المخطط على الخريطة');
    const latM = 111320; const lngM = 111320 * Math.cos(((south + north) / 2) * Math.PI / 180);
    const aspect = ((east - west) * lngM) / ((north - south) * latM);
    let W = Math.sqrt(src.width * src.height * aspect); let Hh = W / aspect;
    const k = Math.min(1, MAX_SIDE / Math.max(W, Hh)); W = Math.round(W * k); Hh = Math.round(Hh * k);
    const toOut = ([lat, lng]) => [((lng - west) / (east - west)) * W, ((north - lat) / (north - south)) * Hh];
    const srcPx = corners.map(([x, y]) => { const p = vp2.convertToViewportPoint(x, y); return [p[0], p[1]]; });
    const outPx = geo.map(toOut);
    const out = document.createElement('canvas');
    out.width = W; out.height = Hh;
    const octx = out.getContext('2d');
    // تحويل خطي من ثلاثة أركان (الفرق عن الإسقاطي أقل من بكسل في مخططات الأحياء)
    const [p0, p1, , p3] = srcPx; const [q0, q1, , q3] = outPx;
    const det = (p1[0] - p0[0]) * (p3[1] - p0[1]) - (p3[0] - p0[0]) * (p1[1] - p0[1]);
    const sx = [(p3[1] - p0[1]) / det, -(p3[0] - p0[0]) / det]; const sy = [-(p1[1] - p0[1]) / det, (p1[0] - p0[0]) / det];
    const a = (q1[0] - q0[0]) * sx[0] + (q3[0] - q0[0]) * sy[0]; const c = (q1[0] - q0[0]) * sx[1] + (q3[0] - q0[0]) * sy[1];
    const b = (q1[1] - q0[1]) * sx[0] + (q3[1] - q0[1]) * sy[0]; const dd = (q1[1] - q0[1]) * sx[1] + (q3[1] - q0[1]) * sy[1];
    octx.setTransform(a, b, c, dd, q0[0] - a * p0[0] - c * p0[1], q0[1] - b * p0[0] - dd * p0[1]);
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, 0, 0);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    src.width = src.height = 0;

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
    onStep('حفظ');
    let blob = await new Promise((r) => out.toBlob(r, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    out.width = out.height = 0;
    if (!blob) throw new Error('تعذر تجهيز صورة المخطط على هذا الجهاز.');

    const name = baseName(file.name);
    const lots = labels.map((l) => { const [lat, lng] = vp.toGeo(l.x, l.y); return [l.text, +lat.toFixed(7), +lng.toFixed(7)]; });
    return {
      row: {
        name, lotissement: name, moughataa_code: zoneAt((south + north) / 2, (west + east) / 2),
        source_name: file.name, source_date: null, georef: 'geopdf',
        south, west, north, east, transparent: transparent ? 1 : 0, visible: 1, lots, status_legend: {},
      },
      image: new File([blob], name + (blob.type === 'image/webp' ? '.webp' : '.png'), { type: blob.type }),
    };
  } finally {
    task.destroy();
  }
}
