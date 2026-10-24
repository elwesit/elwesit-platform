// قراءة مخطط PDF يحمل إحداثياته (GeoPDF من ArcMap: /VP → /Measure → GPTS)، واستخراج أرقام القطع من نصه.
// دوال صافية بلا متصفح: تُستعمل في الواجهة مع pdf.js وفي الاختبارات.

// حل نظام 8×8 (حذف غاوسي) لمصفوفة التحويل الإسقاطي من 4 نقاط
export function homography(src, dst) {
  const A = []; const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]; const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

const nums = (s) => s.trim().split(/\s+/).map(Number);

// إطارات الخريطة المضبوطة في الملف: [{ bbox:[x1,y1,x2,y2] (إحداثيات PDF، y للأعلى), toGeo(x,y)→[lat,lng] }]
export function findGeoViewports(raw) {
  const out = [];
  const re = /\/BBox\s*\[([^\]]+)\]([\s\S]{0,400}?)\/Measure\s*(?:(\d+)\s+0\s+R|<<)/g;
  let m;
  while ((m = re.exec(raw))) {
    let body = null;
    if (m[3]) { const o = new RegExp(`(?:^|\\s)${m[3]}\\s+0\\s+obj([\\s\\S]*?)endobj`).exec(raw); body = o && o[1]; } else body = raw.slice(m.index + m[0].length, m.index + m[0].length + 800);
    if (!body) continue;
    const g = /\/GPTS\s*\[([^\]]+)\]/.exec(body); const l = /\/LPTS\s*\[([^\]]+)\]/.exec(body);
    if (!g) continue;
    const G = nums(g[1]); const L = l ? nums(l[1]) : [0, 1, 0, 0, 1, 0, 1, 1];
    const [x1, y1, x2, y2] = nums(m[1]);
    if (G.length < 8 || [x1, y1, x2, y2].some((v) => !Number.isFinite(v))) continue;
    const src = [0, 1, 2, 3].map((i) => [x1 + L[2 * i] * (x2 - x1), y1 + L[2 * i + 1] * (y2 - y1)]);
    const dst = [0, 1, 2, 3].map((i) => [G[2 * i], G[2 * i + 1]]);
    const H = homography(src, dst);
    out.push({ bbox: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], H, toGeo: (x, y) => applyH(H, x, y) });
  }
  // الخريطة الرئيسية = أكبر إطار (الصغير عادة خريطة موقع مصغرة)
  return out.sort((a, b) => (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]) - (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]));
}

const LOT_RE = /^\d{1,5}(?:[A-Za-z]{1,3})?$/;

// items: [{ str, x, y, w, size, font, h }] (موضع بداية السطر في إحداثيات PDF، h = أفقي)
// تُدمج الأحرف المتجاورة على السطر نفسه، ثم تُختار مجموعة الخط (نوع+حجم) التي فيها أكثر الأرقام: هي أرقام القطع
export function lotLabels(items, bbox) {
  const groups = new Map();
  for (const it of items) {
    if (!it.h || !it.str || !it.str.trim()) continue;
    if (bbox && (it.x < bbox[0] || it.x > bbox[2] || it.y < bbox[1] || it.y > bbox[3])) continue;
    const k = `${it.font}|${Math.round(it.size * 10) / 10}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  let best = []; let bestU = 0;
  for (const g of groups.values()) {
    const size = g[0].size;
    // pdf.js يقسم بعض الملفات حرفاً حرفاً، ويُدخل مسافات وهمية في أخرى («84 7»)؛
    // نجمع الأحرف المفردة المتتالية حين يكون التقدم بينها أقل من 0.85 من حجم الخط
    const toks = g.map((it) => ({ s: /^[\d ]+$/.test(it.str) && it.str.replace(/ /g, '').length <= 5 ? it.str.replace(/ /g, '') : it.str.trim(), x: it.x, y: it.y, w: it.w }));
    toks.sort((a, b) => (Math.abs(a.y - b.y) < 0.3 * size ? a.x - b.x : b.y - a.y));
    const runs = [];
    for (const t of toks) {
      const r = runs[runs.length - 1];
      const last = r && r.parts[r.parts.length - 1];
      if (r && t.s.length === 1 && last.s.length === 1 && Math.abs(r.y - t.y) < 0.3 * size && t.x > last.x && t.x - last.x < 0.85 * size) r.parts.push(t);
      else runs.push({ y: t.y, parts: [t] });
    }
    const labels = [];
    for (const r of runs) {
      const text = r.parts.map((p) => p.s).join('');
      if (!LOT_RE.test(text)) continue;
      const a = r.parts[0]; const z = r.parts[r.parts.length - 1];
      const xe = r.parts.length > 1 ? z.x + (z.x - a.x) / (r.parts.length - 1) : a.x + Math.min(a.w, 0.6 * size * text.length);
      labels.push({ text, x: (a.x + xe) / 2, y: r.y + 0.35 * size });
    }
    const uniq = new Set(labels.map((l) => l.text)).size;
    if (uniq > bestU) { best = labels; bestU = uniq; }
  }
  return best;
}
