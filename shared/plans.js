// مخططات التجزئة: البحث عن قطعة برقمها في فهارس المخططات المستوردة.
import { measure } from './lotShapes.js';
import { normLot, normTight, norm, toLatinDigits } from './text.js';

export const PLAN_FORMAT = 'wasit-plan/1';

const live = (plans) => (plans || []).filter((p) => !p.archived_at && Array.isArray(p.lots));

// هل يشير نص «المخطط» في العرض إلى هذا المخطط؟ (اسم التجزئة أو الاسم، بلا مسافات/علامات)
export function planMatches(plan, text) {
  const t = normTight(text || '');
  if (!t) return false;
  // الاحتواء يُقبل فقط لنص من 4 أحرف فأكثر، حتى لا يطابق «X» كل اسم فيه x
  const inside = (a, b) => a.length >= 4 && b.includes(a);
  return [plan.lotissement, plan.name].some((n) => { const x = normTight(n || ''); return x && (x === t || inside(t, x) || inside(x, t)); });
}

// كل القطع التي تحمل هذا الرقم؛ إن عُرف المخطط تُقدَّم مطابقاته، وإن عُرفت المقاطعة تُستبعد المخططات خارجها
export function findPlanLots(plans, lot, { plan: planText, moughataa_code } = {}) {
  const n = normLot(lot);
  if (!n) return [];
  const out = [];
  for (const p of live(plans)) {
    if (moughataa_code && p.moughataa_code && p.moughataa_code !== moughataa_code) continue;
    for (const l of p.lots) if (normLot(l[0]) === n) out.push({ plan: p, lot: l[0], lat: l[1], lng: l[2], status: l[3] || '', status_label: (p.status_legend || {})[l[3]] || '', named: planMatches(p, planText), shape: lotShape(l) });
  }
  const named = out.filter((x) => x.named);
  return named.length ? named : out;
}

export function planLabel(p) { return p.lotissement || p.name || 'مخطط'; }

// ملف واحد قد يحمل عدة مخططات (أسهل على الهاتف من تنزيل ملفات كثيرة)
export function splitPlanFile(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('الملف ليس حزمة مخطط صالحة.'); }
  if (Array.isArray(d?.plans)) return d.plans;
  return [d];
}

// قراءة حزمة مخطط (ملف .wasitplan.json) والتحقق منها قبل الاستيراد
export function parsePlanPackage(text) {
  let d = text;
  if (typeof text === 'string') { try { d = JSON.parse(text); } catch { throw new Error('الملف ليس حزمة مخطط صالحة.'); } }
  if (d?.format !== PLAN_FORMAT) throw new Error('الملف ليس حزمة مخطط من الوسيط.');
  const b = d.bounds;
  const hasImage = typeof d.image === 'string' && d.image.startsWith('data:image/');
  if (hasImage && !(Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3])) throw new Error('حدود المخطط في الحزمة غير صالحة.');
  const lots = (Array.isArray(d.lots) ? d.lots : []).filter((l) => Array.isArray(l) && l[0] != null && Number.isFinite(l[1]) && Number.isFinite(l[2])).map((l) => [String(l[0]), l[1], l[2], ...(l[3] || validFlat(l[4]) ? [String(l[3] || '')] : []), ...(validFlat(l[4]) ? [l[4]] : [])]);
  if (!hasImage && !lots.length) throw new Error('الحزمة لا تحتوي صورة ولا قطعاً.');
  return {
    row: {
      name: String(d.name || ''), lotissement: String(d.lotissement || ''), moughataa_code: d.moughataa_code || null,
      source_name: String(d.source_name || ''), source_date: d.source_date || null, georef: String(d.georef || ''),
      south: hasImage ? b[0] : null, west: hasImage ? b[1] : null, north: hasImage ? b[2] : null, east: hasImage ? b[3] : null,
      transparent: d.transparent ? 1 : 0, visible: 1, lots, status_legend: d.status_legend || {},
    },
    image: hasImage ? d.image : null,
  };
}

// المخطط الواحد قد يجمع عدة تجزئات بترقيم متكرر (مثل NCE 1-2-3): نميّز المواضع المتكررة
export function hitTag(hits, i) {
  const same = hits.filter((h) => h.plan === hits[i].plan);
  return same.length > 1 ? ` · موضع ${same.indexOf(hits[i]) + 1} من ${same.length}` : '';
}
export const hitPlanCount = (hits) => new Set(hits.map((h) => h.plan)).size;

// حدود القطعة محفوظة في الخانة الخامسة من [رقم، lat، lng، الحالة، [lat1,lng1,lat2,lng2,...]]
const validFlat = (f) => Array.isArray(f) && f.length >= 6 && f.length % 2 === 0 && f.length <= 160 && f.every(Number.isFinite);
export const flatPoly = (poly) => poly.flatMap(([a, b]) => [+a.toFixed(6), +b.toFixed(6)]);
export function lotShape(l) {
  if (!validFlat(l[4])) return null;
  const p = []; for (let i = 0; i < l[4].length; i += 2) p.push([l[4][i], l[4][i + 1]]);
  const m = measure(p);
  return { poly: p, sides: m.sides, area: Math.round(m.area) };
}
const r1 = (x) => (Math.round(x * 10) / 10).toLocaleString('ar-u-nu-latn');
// «19 × 27 م» للمستطيل، وإلا الأضلاع بالترتيب
export function sidesText(sides) {
  if (sides.length === 4 && Math.abs(sides[0] - sides[2]) < 0.6 && Math.abs(sides[1] - sides[3]) < 0.6) return `${r1((sides[0] + sides[2]) / 2)} × ${r1((sides[1] + sides[3]) / 2)} م`;
  return sides.map(r1).join(' / ') + ' م';
}
export const shapeText = (sh) => (sh ? `${sh.area.toLocaleString('ar-u-nu-latn')} م² (${sidesText(sh.sides)})` : '');

// «57 المنارة»، «F9 561»، «قطعة 561 قطاع 9 تفرغ زينة»: رقم القطعة + كلمات المخطط أو المنطقة
const LOT_WORD = /^(قطعة|القطعة|قطعه|رقم|نمرة|نمره|النمرة|lot|n°|no)$/i;
const NAME_WORD = /^(قطاع|القطاع|سكتور|secteur|sect|sector|مخطط|module|phase|tranche|ilot|ilôt|zone|extension|ext)$/i;
const LOT_TOKEN = /^(?:n°?|no\.?|#)?\d{1,5}[a-z]{0,3}$/i; // 561، 15A، N627
export function parseLotQuery(q) {
  const toks = toLatinDigits(String(q || '')).trim().split(/[\s,،;/]+/).filter(Boolean);
  let lot = null; const rest = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (LOT_WORD.test(t)) { if (toks[i + 1] && LOT_TOKEN.test(toks[i + 1])) { lot = toks[++i]; } continue; }
    if (NAME_WORD.test(t)) { rest.push(t); if (toks[i + 1]) rest.push(toks[++i]); continue; } // «قطاع 9» جزء من الاسم
    if (!lot && LOT_TOKEN.test(t)) { lot = t; continue; }
    rest.push(t);
  }
  return { lot, rest: rest.join(' ') };
}

// كل كلمة من «rest» موجودة في اسم المخطط أو تجزئته أو مقاطعته
// كلمات عربية تقابل ما يُكتب بالفرنسية في أسماء ملفات المخططات
const SYN = { قطاع: ['sect', 'secteur', 'sector', 'سكتور'], سكتور: ['sect', 'secteur', 'قطاع'], توسعه: ['ext', 'extension'], شمال: ['nord'], جنوب: ['sud'], شرق: ['est'], غرب: ['ouest'], منطقه: ['zone'], مقاطعه: [] };
const FILLER = new Set(['مخطط', 'في', 'من', 'حي', 'plan', 'lotissement', 'de', 'du', 'la', 'le']);
export function planNameHit(plan, rest, moughataas = []) {
  const words = norm(rest).split(' ').filter((w) => w && !LOT_WORD.test(w) && !FILLER.has(w));
  if (!words.length) return true;
  const m = moughataas.find((x) => x.code === plan.moughataa_code);
  const hay = norm([plan.name, plan.lotissement, plan.source_name, m?.name_ar, m?.name_fr, ...(m?.aliases || [])].filter(Boolean).join(' ')).replace(/[_\-.]+/g, ' ');
  const tight = hay.replace(/\s+/g, '');
  const has = (w) => hay.includes(w) || tight.includes(w);
  const nums = hay.match(/\d+/g) || [];
  return words.every((w) => {
    if (/^\d+$/.test(w)) return nums.includes(String(+w)) || nums.includes(w); // «9» لا يطابق «19»
    const bare = w.length > 4 && w.startsWith('ال') ? w.slice(2) : w; // «المنارة» = «منارة»
    return has(w) || has(bare) || (SYN[bare] || []).some(has);
  });
}

export function searchPlanLots(plans, q, { moughataas = [] } = {}) {
  const { lot, rest } = parseLotQuery(q);
  if (!lot) return { lot: null, rest, hits: [], unmatched: false };
  const all = findPlanLots(plans, lot);
  if (!rest) return { lot, rest, hits: all, unmatched: false };
  const hits = all.filter((h) => planNameHit(h.plan, rest, moughataas));
  return hits.length ? { lot, rest, hits, unmatched: false } : { lot, rest, hits: all, unmatched: all.length > 0 };
}
