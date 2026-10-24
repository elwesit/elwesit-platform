// حدود القطع من خطوط مخطط PDF: نرسم الخطوط وحدها على شبكة، نملأ من موضع رقم القطعة حتى الحدود،
// ثم نحوّل المنطقة إلى مضلع ونحسب أطوال الأضلاع والمساحة بالمتر. دوال صافية (المتصفح والاختبارات).

const STROKE_OPS = new Set([20, 21, 24, 25, 26, 27]); // stroke, closeStroke, fillStroke...
const D = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// مقاطع الخطوط المرسومة (إحداثيات PDF) من operator list الخاصة بـ pdf.js
export function strokeSegments({ fnArray, argsArray }, OPS) {
  const segs = [];
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]; const args = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.constructPath) {
      const [paint, [path]] = args;
      if (!STROKE_OPS.has(paint) || !path) continue;
      let k = 0; let cur = null; let start = null;
      const n = path.length;
      while (k < n) {
        const c = path[k++];
        if (c === D.moveTo) { cur = start = ap(ctm, path[k], path[k + 1]); k += 2; } else if (c === D.lineTo) { const p = ap(ctm, path[k], path[k + 1]); k += 2; if (cur) segs.push([cur[0], cur[1], p[0], p[1]]); cur = p; } else if (c === D.curveTo) { const p = ap(ctm, path[k + 4], path[k + 5]); k += 6; if (cur) segs.push([cur[0], cur[1], p[0], p[1]]); cur = p; } else if (c === D.quadraticCurveTo) { const p = ap(ctm, path[k + 2], path[k + 3]); k += 4; if (cur) segs.push([cur[0], cur[1], p[0], p[1]]); cur = p; } else if (c === D.closePath) { if (cur && start) segs.push([cur[0], cur[1], start[0], start[1]]); cur = start; } else break;
      }
    }
  }
  return segs;
}

// شبكة نقطية للخطوط داخل الإطار bbox
function rasterize(segs, bbox, scale) {
  const [x0, y0, x1, y1] = bbox;
  const W = Math.ceil((x1 - x0) * scale) + 2; const H = Math.ceil((y1 - y0) * scale) + 2;
  const g = new Uint8Array(W * H);
  const px = (x) => (x - x0) * scale + 1; const py = (y) => (y1 - y) * scale + 1; // y للأسفل
  for (const [ax, ay, bx, by] of segs) {
    let xa = px(ax); let ya = py(ay); const xb = px(bx); const yb = py(by);
    const steps = Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) * 2) + 1;
    const dx = (xb - xa) / steps; const dy = (yb - ya) / steps;
    for (let s = 0; s <= steps; s++, xa += dx, ya += dy) {
      const ix = Math.round(xa); const iy = Math.round(ya);
      if (ix >= 0 && iy >= 0 && ix < W && iy < H) g[iy * W + ix] = 1;
    }
  }
  // إطار مغلق حول الشبكة: الملء الذي يصل إليه «تسرّب» خارج القطع
  return { g, W, H, toPdf: (x, y) => [(x - 1) / scale + x0, y1 - (y - 1) / scale], toPx: (x, y) => [px(x), py(y)] };
}

// ملء من نقطة (4 اتجاهات). يُرجع قائمة الخلايا أو null إن تسرّب إلى حافة الشبكة أو تجاوز الحد
function flood(R, sx, sy, maxCells, mark, id) {
  const { g, W, H } = R;
  let x = Math.round(sx); let y = Math.round(sy);
  if (g[y * W + x]) { // الرقم فوق خط: أقرب خلية فارغة
    let found = false;
    for (let r = 1; r < 4 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) if (!g[(y + dy) * W + x + dx]) { x += dx; y += dy; found = true; }
    if (!found) return null;
  }
  const start = y * W + x;
  if (mark[start]) return mark[start] === id ? null : { shared: mark[start] };
  const stack = [start]; const cells = [];
  mark[start] = id;
  while (stack.length) {
    const c = stack.pop(); cells.push(c);
    if (cells.length > maxCells) return null;
    const cx = c % W; const cy = (c - cx) / W;
    if (cx <= 0 || cy <= 0 || cx >= W - 1 || cy >= H - 1) return null;
    for (const n of [c - 1, c + 1, c - W, c + W]) if (!g[n] && !mark[n]) { mark[n] = id; stack.push(n); }
  }
  return { cells };
}

// حدود المنطقة: أضلاع الخلايا التي تجاور خارجها، موصولة في حلقة (الأطول = الحد الخارجي)
function outline(cells, W, mark, id) {
  const inside = (c) => mark[c] === id;
  const next = new Map(); // زاوية البداية → زاوية النهاية (المنطقة على اليمين)
  const K = (x, y) => y * (W + 1) + x;
  for (const c of cells) {
    const x = c % W; const y = (c - x) / W;
    if (!inside(c - W)) next.set(K(x, y), K(x + 1, y));
    if (!inside(c + 1)) next.set(K(x + 1, y), K(x + 1, y + 1));
    if (!inside(c + W)) next.set(K(x + 1, y + 1), K(x, y + 1));
    if (!inside(c - 1)) next.set(K(x, y + 1), K(x, y));
  }
  let best = [];
  const seen = new Set();
  for (const s0 of next.keys()) {
    if (seen.has(s0)) continue;
    const loop = []; let k = s0;
    while (k !== undefined && !seen.has(k)) { seen.add(k); loop.push([k % (W + 1), Math.floor(k / (W + 1))]); k = next.get(k); }
    if (loop.length > best.length) best = loop;
  }
  return best;
}

export function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  // مضلع مغلق: نبدأ من أبعد نقطتين
  let a = 0; let b = 0; let best = -1;
  for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > best) { best = d; b = i; } }
  const dp = (arr) => {
    if (arr.length < 3) return arr;
    const [p, q] = [arr[0], arr[arr.length - 1]];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    let mi = 0; let md = -1;
    for (let i = 1; i < arr.length - 1; i++) { const d = Math.abs((q[0] - p[0]) * (p[1] - arr[i][1]) - (p[0] - arr[i][0]) * (q[1] - p[1])) / L; if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [p, q];
    const l = dp(arr.slice(0, mi + 1)); const r = dp(arr.slice(mi));
    return [...l.slice(0, -1), ...r];
  };
  const h1 = dp(pts.slice(a, b + 1)); const h2 = dp([...pts.slice(b), pts[0]]);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}

// إزالة الرؤوس على خط مستقيم (ومنها نقطة بداية التتبع في منتصف ضلع)
function dropCollinear(poly, tol) {
  let p = poly.slice(); let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length && p.length > 3; i++) {
      const a = p[(i + p.length - 1) % p.length]; const b = p[i]; const c = p[(i + 1) % p.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      const d = Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / L;
      if (d <= tol) { p.splice(i, 1); changed = true; i--; }
    }
  }
  return p;
}

// إزاحة المضلع للخارج بمسافة d (المنطقة المملوءة تقف عند حافة الخط لا عند وسطه)
function offset(poly, d) {
  let A = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i]; const q = poly[(i + 1) % poly.length]; A += p[0] * q[1] - q[0] * p[1]; }
  const sgn = A > 0 ? 1 : -1; // اتجاه الدوران
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const nx = sgn * (q[1] - p[1]) / L; const ny = -sgn * (q[0] - p[0]) / L; // العمود الخارجي
    return [[p[0] + nx * d, p[1] + ny * d], [q[0] + nx * d, q[1] + ny * d]];
  });
  return poly.map((_, i) => {
    const [p1, p2] = lines[(i + lines.length - 1) % lines.length]; const [p3, p4] = lines[i];
    const den = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    if (Math.abs(den) < 1e-9) return p3;
    const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / den;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  });
}

// أطوال الأضلاع (م) والمساحة (م²) لمضلع [lat,lng]
export function measure(poly) {
  const lat0 = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const ky = 111320; const kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  const m = poly.map(([la, ln]) => [ln * kx, la * ky]);
  const sides = m.map((p, i) => { const q = m[(i + 1) % m.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
  let A = 0;
  for (let i = 0; i < m.length; i++) { const p = m[i]; const q = m[(i + 1) % m.length]; A += p[0] * q[1] - q[0] * p[1]; }
  return { sides, area: Math.abs(A) / 2 };
}

// labels: [{text,x,y}] بإحداثيات PDF. toGeo(x,y)→[lat,lng].
// يُرجع مصفوفة بترتيب labels: {p:[[lat,lng]], s:[أطوال الأضلاع م], a:المساحة م²} أو null حين لا تُغلق الحدود
export function lotShapes(segs, labels, bbox, toGeo, { maxPx = 16e6, maxLotM2 = 20000 } = {}) {
  const w = bbox[2] - bbox[0]; const h = bbox[3] - bbox[1];
  const scale = Math.min(6, Math.sqrt(maxPx / (w * h)));
  const inBox = segs.filter((s) => !(Math.max(s[0], s[2]) < bbox[0] || Math.min(s[0], s[2]) > bbox[2] || Math.max(s[1], s[3]) < bbox[1] || Math.min(s[1], s[3]) > bbox[3]));
  const R = rasterize(inBox, bbox, scale);
  const [la0, ln0] = toGeo(bbox[0], bbox[1]); const [la1, ln1] = toGeo(bbox[2], bbox[1]);
  const mPerPt = Math.hypot((la1 - la0) * 111320, (ln1 - ln0) * 111320 * Math.cos(la0 * Math.PI / 180)) / w;
  const maxCells = Math.ceil(maxLotM2 / (mPerPt / scale) ** 2);
  const mark = new Int32Array(R.W * R.H);
  const out = labels.map(() => null);
  const byId = new Map();
  labels.forEach((l, i) => {
    const [sx, sy] = R.toPx(l.x, l.y);
    const id = i + 1;
    const f = flood(R, sx, sy, maxCells, mark, id);
    if (!f) return;
    // رقمان في المنطقة نفسها: الحدود غير مغلقة بينهما، فلا نخمّن لأي منهما
    if (f.shared) { const j = byId.get(f.shared); if (j != null) out[j] = null; return; }
    byId.set(id, i);
    if (f.cells.length < 20) return;
    const ring = offset(dropCollinear(simplify(outline(f.cells, R.W, mark, id), 1.2), 1.2), 0.5);
    if (ring.length < 3) return;
    const poly = ring.map(([x, y]) => toGeo(...R.toPdf(x, y))).map(([a, b]) => [+a.toFixed(7), +b.toFixed(7)]);
    const ms = measure(poly);
    out[i] = { p: poly, s: ms.sides.map((v) => Math.round(v * 10) / 10), a: Math.round(ms.area) };
  });
  return out;
}
