// الأوقية: الجديدة (MRU) = 10 أوقية قديمة (MRO) منذ 2018.
// لا نحوّل بين العملتين إلا إذا كانت العملة مؤكدة. القيمة المجهولة = null وليست صفراً.

export const CURRENCIES = {
  MRU: { label: 'أوقية جديدة', short: 'أ.ج' },
  MRO: { label: 'أوقية قديمة', short: 'أ.ق' },
  unknown: { label: 'عملة غير محددة', short: '؟' },
};

export const PRICE_BASIS = {
  total: 'السعر الإجمالي',
  per_m2: 'للمتر المربع',
  monthly: 'شهرياً',
  yearly: 'سنوياً',
  daily: 'يومياً',
};

export function toMRU(amount, currency) {
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return null;
  if (currency === 'MRU') return Number(amount);
  if (currency === 'MRO') return Number(amount) / 10;
  return null;
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function formatNumber(n) {
  if (n == null || n === '') return '';
  return nf.format(Number(n)).replace(/,/g, '٬');
}

// صيغة مقروءة مع الملايين: 50,000,000 → «50 مليون»
export function formatAmountWords(n) {
  if (n == null) return '';
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return `${trim(v / 1e9)} مليار`;
  if (Math.abs(v) >= 1e6) return `${trim(v / 1e6)} مليون`;
  if (Math.abs(v) >= 1e3 && v % 1000 === 0) return `${trim(v / 1e3)} ألف`;
  return formatNumber(v);
}
const trim = (x) => formatNumber(Math.round(x * 100) / 100);

export function formatPrice({ amount, currency, basis }, { withBasis = true } = {}) {
  if (amount == null || amount === '') return '';
  const cur = CURRENCIES[currency] || CURRENCIES.unknown;
  let s = `${formatAmountWords(amount)} ${currency === 'unknown' ? '(عملة غير محددة)' : cur.label}`;
  if (withBasis && basis && basis !== 'total') s += ` ${PRICE_BASIS[basis] || ''}`;
  return s.trim();
}

// تفسيرا القيمة عند غموض العملة، لعرضهما على المستخدم ليختار
export function currencyReadings(amount) {
  if (amount == null) return [];
  return [
    { currency: 'MRO', label: `${formatAmountWords(amount)} أوقية قديمة`, mru: amount / 10, hint: `= ${formatAmountWords(amount / 10)} أوقية جديدة` },
    { currency: 'MRU', label: `${formatAmountWords(amount)} أوقية جديدة`, mru: amount, hint: `= ${formatAmountWords(amount * 10)} أوقية قديمة` },
  ];
}

// ---------- قراءة الأرقام المكتوبة بالحروف والأرقام ----------
import { norm } from './text.js';

const UNITS = {
  'صفر': 0, 'واحد': 1, 'واحده': 1, 'احد': 1, 'اثنان': 2, 'اثنين': 2, 'اثنتين': 2, 'اثنتان': 2, 'اثنا': 2, 'اثني': 2, 'زوز': 2,
  'ثلاث': 3, 'ثلاثه': 3, 'تلاته': 3, 'اربع': 4, 'اربعه': 4, 'خمس': 5, 'خمسه': 5, 'ست': 6, 'سته': 6, 'سبع': 7, 'سبعه': 7,
  'ثمان': 8, 'ثماني': 8, 'ثمانيه': 8, 'تمانيه': 8, 'تسع': 9, 'تسعه': 9, 'عشر': 10, 'عشره': 10, 'احدعشر': 11, 'اطناش': 12, 'حداش': 11,
};
const TENS = {
  'عشرون': 20, 'عشرين': 20, 'ثلاثون': 30, 'ثلاثين': 30, 'اربعون': 40, 'اربعين': 40, 'خمسون': 50, 'خمسين': 50,
  'ستون': 60, 'ستين': 60, 'سبعون': 70, 'سبعين': 70, 'ثمانون': 80, 'ثمانين': 80, 'تسعون': 90, 'تسعين': 90,
};
const HUNDREDS = { 'مائه': 100, 'ميه': 100, 'مئه': 100, 'مايه': 100, 'ميت': 100, 'مائتان': 200, 'مائتين': 200, 'ميتين': 200, 'متين': 200, 'مئتين': 200, 'مئتان': 200 };
const MULT = {
  'الف': 1e3, 'الاف': 1e3, 'ألف': 1e3, 'الفين': 2e3, 'الفان': 2e3, 'الفا': 1e3, 'mille': 1e3,
  'مليون': 1e6, 'مليونا': 1e6, 'ملايين': 1e6, 'مليونين': 2e6, 'مليونان': 2e6, 'ملاين': 1e6, 'million': 1e6, 'millions': 1e6,
  'مليار': 1e9, 'مليارات': 1e9, 'milliard': 1e9, 'milliards': 1e9,
};
const HALF = new Set(['نص', 'نصف', 'demi']);
const FRENCH = { 'un': 1, 'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10, 'vingt': 20, 'trente': 30, 'quarante': 40, 'cinquante': 50, 'soixante': 60, 'cent': 100 };

function wordValue(w) {
  if (w in UNITS) return { v: UNITS[w], k: 'unit' };
  if (w in TENS) return { v: TENS[w], k: 'unit' };
  if (w in FRENCH) return { v: FRENCH[w], k: w === 'cent' ? 'hundred' : 'unit' };
  if (w in HUNDREDS) return { v: HUNDREDS[w], k: 'hundred' };
  if (w in MULT) return { v: MULT[w], k: MULT[w] === 2e3 || MULT[w] === 2e6 ? 'dual' : 'mult' };
  if (HALF.has(w)) return { v: 0.5, k: 'half' };
  // «ثلاثمائة»، «خمسمية»
  const m = w.match(/^(ثلاث|اربع|خمس|ست|سبع|ثمان|تسع)(مائه|ميه|مئه|مايه)$/);
  if (m) return { v: UNITS[m[1]] * 100, k: 'unit' };
  // «خمستاشر»/«ثلاثة عشر» ككلمة واحدة نادراً؛ نتركها
  return null;
}

// يُرجع قائمة الأرقام الموجودة في النص بترتيبها: [{value, from, to, text}] على النص المطبّع
export function extractNumbers(input) {
  const text = norm(input);
  // افصل الأرقام الملتصقة بالحروف: «400م» → «400 م»، «50مليون» → «50 مليون»
  const spaced = text.replace(/(\d)([^\d\s.,٬])/g, '$1 $2').replace(/([^\d\s.,٬])(\d)/g, '$1 $2');
  const tokens = [];
  const re = /\S+/g; let mm;
  while ((mm = re.exec(spaced))) tokens.push({ t: mm[0], i: mm.index });
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const start = i;
    let total = 0, current = 0, any = false, lastMult = 1, used = 0;
    while (i < tokens.length) {
      let t = tokens[i].t;
      // «و» العطف الملتصقة: «وخمسين»
      if (any && t.length > 1 && t.startsWith('و') && (wordValue(t.slice(1)) || /^\d/.test(t.slice(1)))) t = t.slice(1);
      if (any && t === 'و') { i++; continue; }
      let num = null;
      if (/^\d+([.,٬]\d+)*$/.test(t)) {
        const n = parseNumericToken(t);
        if (n == null) break;
        num = { v: n, k: 'digits' };
      } else {
        num = wordValue(t);
      }
      if (!num) break;
      // «عشر» بعد وحدة = 13..19
      if (num.k === 'unit' && num.v === 10 && current > 0 && current < 10) { current += 10; i++; used++; continue; }
      if (num.k === 'digits' || num.k === 'unit') {
        if (any && current !== 0 && num.k === 'digits') break; // رقمان متتاليان = عددان مختلفان
        current += num.v;
      } else if (num.k === 'hundred') {
        current = (current || 1) * num.v;
      } else if (num.k === 'half') {
        if (any && current === 0 && total > 0) { total += 0.5 * lastMult; } else current += 0.5;
      } else if (num.k === 'dual' || num.k === 'mult') {
        const base = num.k === 'dual' ? 1 : (current || 1);
        const mult = num.k === 'dual' ? num.v : num.v;
        total += base * mult; lastMult = num.k === 'dual' ? num.v / 2 : num.v; current = 0;
      }
      any = true; used++; i++;
    }
    if (used > 0) {
      const from = tokens[start].i;
      const last = tokens[i - 1];
      out.push({ value: total + current, from, to: last.i + last.t.length, text: spaced.slice(from, last.i + last.t.length), tokenStart: start, tokenEnd: i });
    } else i++;
  }
  return { numbers: out, normalized: spaced, tokens };
}

function parseNumericToken(t) {
  // 1,500,000 أو 1.500.000 أو 2.5 أو 2,5
  if (/^\d{1,3}([.,٬]\d{3})+$/.test(t)) return Number(t.replace(/[.,٬]/g, ''));
  if (/^\d+[.,]\d+$/.test(t)) return Number(t.replace(',', '.'));
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}
