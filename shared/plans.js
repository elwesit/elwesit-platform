// مخططات التجزئة: البحث عن قطعة برقمها في فهارس المخططات المستوردة.
import { normLot, normTight } from './text.js';

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
    for (const l of p.lots) if (normLot(l[0]) === n) out.push({ plan: p, lot: l[0], lat: l[1], lng: l[2], status: l[3] || '', status_label: (p.status_legend || {})[l[3]] || '', named: planMatches(p, planText) });
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
  const lots = (Array.isArray(d.lots) ? d.lots : []).filter((l) => Array.isArray(l) && l[0] != null && Number.isFinite(l[1]) && Number.isFinite(l[2])).map((l) => [String(l[0]), l[1], l[2], ...(l[3] ? [String(l[3])] : [])]);
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
