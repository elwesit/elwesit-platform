// «طلب عاجل»: طلبات الزبائن التي ينشرها الوسيط في شريط متحرك أعلى كل صفحة.
// من عنده العقار المطلوب يضغط على الطلب فيفتح واتساب برسالة جاهزة تذكر الطلب.

export const URGENT_MAX = 40;
export const URGENT_TEXT_MAX = 160;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9:_-]{1,80}$/;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, URGENT_TEXT_MAX);

// تنظيف القائمة قبل حفظها: نص غير فارغ، تاريخ انتهاء اختياري (YYYY-MM-DD)، ومعرّف ثابت
export function cleanUrgent(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const text = clean(r.text);
    if (!text) continue;
    let id = ID.test(String(r.id || '')) ? String(r.id) : 'u' + Math.random().toString(36).slice(2, 10);
    while (ids.has(id)) id += 'x';
    ids.add(id);
    const item = { id, text, until: DATE.test(String(r.until || '')) ? String(r.until) : '' };
    if (r.src === 'repo' && /^[a-z0-9-]{1,60}$/.test(String(r.key || ''))) Object.assign(item, { src: 'repo', key: String(r.key) });
    out.push(item);
    if (out.length >= URGENT_MAX) break;
  }
  return out;
}

export const todayISO = (d = new Date()) => d.toISOString().slice(0, 10); // نواكشوط على توقيت غرينتش

// الطلبات الظاهرة اليوم: ما لم ينته تاريخه
export function activeUrgent(list, today = todayISO()) {
  return cleanUrgent(list).filter((r) => !r.until || r.until >= today);
}

export function urgentMessage(text, siteName = 'الوسيط العقاري') {
  return [`السلام عليكم، عندي ما يناسب هذا الطلب العاجل المنشور في موقع ${siteName}:`, `• الطلب: ${clean(text)}`, '• التفاصيل: '].join('\n');
}
