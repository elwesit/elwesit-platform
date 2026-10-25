// تطبيع النصوص العربية والفرنسية للبحث والمطابقة، دون تغيير النص المحفوظ نفسه.

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toLatinDigits(s) {
  if (s == null) return '';
  return String(s)
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

// يحوّل النص إلى شكل موحد للمقارنة: بدون تشكيل أو تطويل، همزات موحدة، ة→ه، ى→ي،
// وحروف فرنسية بدون علامات، وأحرف صغيرة.
export function norm(s) {
  if (s == null) return '';
  return toLatinDigits(String(s))
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '') // تشكيل وتطويل
    .replace(/[̀-ͯ]/g, '') // علامات لاتينية
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[گك]/g, 'ك')
    .replace(/ڤ/g, 'ف')
    .replace(/[’'`´]/g, '')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ')
    .replace(/[-_،؛;:!?؟()"«»/\\*]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// نسخة بلا مسافات تماماً (لـ «تفرغزينة» مقابل «تفرغ زينة»)
export function normTight(s) {
  return norm(s).replace(/\s+/g, '');
}

// تطبيع رقم القطعة: أرقام لاتينية، بدون مسافات أو شرطات، وأحرف صغيرة.
export function normLot(s) {
  return toLatinDigits(s || '').toLowerCase().replace(/[\s\-_/.#№]+/g, '').replace(/^(n|no|num|رقم|نمره|نمرة)/, '');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// تشابه بسيط بين اسمين (لتنبيه التكرار فقط، لا للدمج)
export function nameSimilarity(a, b) {
  const x = normTight(a), y = normTight(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bg = (s) => { const r = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); r.set(k, (r.get(k) || 0) + 1); } return r; };
  const A = bg(x), B = bg(y);
  let inter = 0, total = 0;
  for (const [k, v] of A) { inter += Math.min(v, B.get(k) || 0); total += v; }
  for (const v of B.values()) total += v;
  return total ? (2 * inter) / total : 0;
}

// اسم لاتيني → جزء رابط (Tevragh Zeina → tevragh-zeina) لصفحات المقاطعات
export function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
