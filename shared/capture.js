// استخراج النية والحقول من نص حر (مكتوب، مُملى، أو رسالة واتساب ملصقة).
// المبدأ: لا نخمّن بصمت. كل ما هو غير مؤكد يظهر في issues، والمعلومة الناقصة تبقى فارغة.
// لا يحفظ هذا الملف شيئاً؛ النتيجة تُعرض للمراجعة قبل الحفظ.

import { norm, normTight, toLatinDigits } from './text.js';
import { extractNumbers, currencyReadings } from './money.js';
import { TYPE_WORDS } from './vocab.js';

const REQUEST_WORDS = ['طلب', 'يبحث', 'تبحث', 'يدور', 'تدور', 'يريد', 'تريد', 'بغا', 'يبغي', 'مطلوب', 'محتاج', 'يحتاج', 'زبون', 'يشتري', 'يستاجر', 'يسعي'];
// «للبيع/للإيجار» تأتي في الطلبات أيضاً («يبحث عن دار للإيجار») فلا تنافس كلمات الطلب
const OFFER_WEAK = ['للبيع', 'للايجار', 'للكراء'];
const OFFER_WORDS = ['عرض', 'عندي', 'عنده', 'عندو', 'عندها', 'معروض', 'معروضه', 'يبيع', 'يؤجر', 'يوجر', 'يكري', 'تباع'];
const REMIND_WORDS = ['ذكرني', 'ذكريني', 'تذكير', 'نبهني', 'لاتنس', 'لا تنس', 'لا تنسي', 'موعد'];
const CALL_WORDS = ['اتصل', 'نتصل', 'اتكلم', 'كلم', 'نكلم', 'اكلم', 'ارسل', 'نرسل', 'زور', 'نزور'];
const SALE_WORDS = ['بيع', 'للبيع', 'شراء', 'يشتري', 'تشتري', 'اشتري', 'يبيع', 'تباع', 'vente', 'achat'];
const RENT_WORDS = ['ايجار', 'للايجار', 'كراء', 'للكراء', 'يستاجر', 'يكري', 'تكري', 'مستاجر', 'location', 'louer', 'الكرا'];
const STOP = new Set(['يبحث', 'تبحث', 'يريد', 'تريد', 'عن', 'في', 'ب', 'من', 'الي', 'علي', 'قطعه', 'ارض', 'دار', 'شقه', 'عنده', 'عندو', 'غدا', 'بكره', 'اليوم', 'الساعه', 'متر', 'السعر', 'ميزانيته', 'ميزانيتها', 'و', 'يدور', 'محتاج', 'بتيارت', 'هو', 'هي', 'رقم', 'للبيع', 'للايجار', 'للكراء', 'بعد', 'قبل', 'او', 'مع', 'ان', 'انه', 'لاجل', 'حول', 'بحدود', 'تقريبا', 'يبيع', 'تبيع', 'عرض', 'طلب', 'قطاع', 'القطاع', 'مخطط']);
const NAME_LINKS = new Set(['ولد', 'بنت', 'منت', 'ول', 'ابن', 'بن', 'اهل']);
const NAME_PREFIX = new Set(['عبد', 'سيدي', 'محمد', 'ابو', 'ام', 'الشيخ', 'الحاج', 'مولاي']);

const WEEKDAYS = { 'الاحد': 0, 'الاثنين': 1, 'الاتنين': 1, 'الثلاثاء': 2, 'الثلاثا': 2, 'الاربعاء': 3, 'الاربعا': 3, 'الخميس': 4, 'الجمعه': 5, 'السبت': 6 };
const ORDINAL_HOURS = {
  'الواحده': 1, 'الثانيه': 2, 'الثالثه': 3, 'الرابعه': 4, 'الخامسه': 5, 'السادسه': 6, 'السابعه': 7,
  'الثامنه': 8, 'التاسعه': 9, 'العاشره': 10, 'الحاديه عشر': 11, 'الحاديه عشره': 11, 'الثانيه عشر': 12, 'الثانيه عشره': 12, 'منتصف النهار': 12,
};
const PERIODS = [
  { w: ['صباحا', 'الصباح', 'الصبح', 'صباح', 'matin'], shift: 'am' },
  { w: ['ظهرا', 'الظهر', 'بعد الظهر', 'midi'], shift: 'noon' },
  { w: ['العصر', 'عصرا', 'العشيه', 'عشيه', 'مساء', 'مساءا', 'المساء', 'soir', 'العشا', 'ليلا', 'الليل', 'المغرب'], shift: 'pm' },
];

// stripPrefix: «بتيارت» → «تيارت»، «وفي» ...
function prefixVariants(tok) {
  const out = [tok];
  for (const p of ['وب', 'وفي', 'بال', 'فال', 'وال', 'لل', 'ب', 'ل', 'و', 'ف', 'في']) {
    if (tok.startsWith(p) && tok.length - p.length >= 2) out.push(tok.slice(p.length));
  }
  return out;
}

// gazetteer: { wilayas:[{code,name_ar,name_fr,aliases}], moughataas:[{code,wilaya_code,...}], areas:[{id,name,aliases,moughataa_code,wilaya_code}] }
export function buildGazetteer(g) {
  const entries = [];
  const add = (names, item) => {
    for (const n of names.filter(Boolean)) {
      const t = normTight(n);
      if (t.length >= 2) entries.push({ key: t, words: norm(n).split(' ').length, item });
    }
  };
  for (const w of g.wilayas || []) add([w.name_ar, w.name_fr, ...(w.aliases || [])], { level: 'wilaya', wilaya_code: w.code, label: w.name_ar });
  for (const m of g.moughataas || []) add([m.name_ar, m.name_fr, ...(m.aliases || [])], { level: 'moughataa', wilaya_code: m.wilaya_code, moughataa_code: m.code, label: m.name_ar });
  for (const a of g.areas || []) add([a.name, ...(a.aliases || [])], { level: 'area', area_id: a.id, moughataa_code: a.moughataa_code || null, wilaya_code: a.wilaya_code || null, label: a.name, kind: a.kind });
  // الأطول أولاً حتى تُفضَّل «نواكشوط الغربية» على «نواكشوط»
  entries.sort((a, b) => b.key.length - a.key.length);
  return entries;
}

function findPlaces(tokens, gaz) {
  const found = [];
  const used = new Set();
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if ([...Array(n).keys()].some((k) => used.has(i + k))) continue;
      const first = prefixVariants(tokens[i]);
      for (const f of first) {
        const joined = normTight([f, ...tokens.slice(i + 1, i + n)].join(''));
        const hit = gaz.find((e) => e.key === joined);
        if (hit) {
          for (let k = 0; k < n; k++) used.add(i + k);
          found.push({ ...hit.item, text: tokens.slice(i, i + n).join(' '), at: i });
          break;
        }
      }
    }
  }
  return { found: found.sort((a, b) => a.at - b.at), used };
}

function startOfDay(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
// موريتانيا على توقيت غرينتش (UTC+0) طوال السنة، دون توقيت صيفي.
const DAY = 86400000;

export function parseWhen(text, now = new Date()) {
  const t = ' ' + norm(text) + ' ';
  const today = startOfDay(now);
  let day = null, dayLabel = '', raw = [];
  const has = (w) => t.includes(' ' + w + ' ');
  if (has('بعد غد') || has('بعد بكره') || has('بعد غدا') || has('بعد بكرا')) { day = new Date(+today + 2 * DAY); dayLabel = 'بعد غد'; raw.push('بعد غد'); }
  else if (has('غدا') || has('بكره') || has('بكرا') || has('غدوه') || has('demain') || has('غد')) { day = new Date(+today + DAY); dayLabel = 'غداً'; raw.push('غداً'); }
  else if (has('اليوم') || has('الليله') || has('aujourdhui')) { day = today; dayLabel = 'اليوم'; raw.push('اليوم'); }
  const inDays = t.match(/ بعد (\d+|يومين|ثلاث ايام|ثلاثه ايام|اسبوع|اسبوعين) /);
  if (!day && inDays) {
    const map = { 'يومين': 2, 'ثلاث ايام': 3, 'ثلاثه ايام': 3, 'اسبوع': 7, 'اسبوعين': 14 };
    const n = map[inDays[1]] ?? Number(inDays[1]);
    if (n) { day = new Date(+today + n * DAY); dayLabel = `بعد ${inDays[1]}`; raw.push(inDays[0].trim()); }
  }
  if (!day) {
    for (const [w, idx] of Object.entries(WEEKDAYS)) {
      if (has(w) || has('يوم ' + w.replace(/^ال/, '')) ) {
        let diff = (idx - today.getUTCDay() + 7) % 7; if (diff === 0) diff = 7;
        day = new Date(+today + diff * DAY); dayLabel = w; raw.push(w); break;
      }
    }
  }
  const dm = t.match(/ (\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))? /);
  if (!day && dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : today.getUTCFullYear();
    const cand = new Date(Date.UTC(y, Number(dm[2]) - 1, Number(dm[1])));
    if (!Number.isNaN(+cand)) { day = cand; dayLabel = `${dm[1]}/${dm[2]}`; raw.push(dm[0].trim()); }
  }
  // الوقت
  let hour = null, minute = 0, timeRaw = '', explicitPeriod = null;
  const hm = t.match(/ (?:الساعه )?(\d{1,2})[:h.](\d{2}) /);
  if (hm) { hour = Number(hm[1]); minute = Number(hm[2]); timeRaw = hm[0].trim(); }
  if (hour == null) {
    const hs = t.match(/ الساعه (\d{1,2}) /) || t.match(/ (\d{1,2}) (?:صباحا|الصباح|الصبح|مساء|مساءا|العصر|ظهرا|الظهر|h) /);
    if (hs) { hour = Number(hs[1]); timeRaw = hs[0].trim(); }
  }
  if (hour == null) {
    for (const [w, h] of Object.entries(ORDINAL_HOURS).sort((a, b) => b[0].length - a[0].length)) {
      if (t.includes(' ' + w + ' ') || t.includes(' الساعه ' + w + ' ')) { hour = h; timeRaw = (t.includes('الساعه ' + w) ? 'الساعة ' : '') + w; break; }
    }
  }
  if (hour != null) {
    if (t.includes(' والنصف ') || t.includes(' ونص ')) { minute = 30; timeRaw += ' والنصف'; }
    else if (t.includes(' والربع ') || t.includes(' وربع ')) { minute = 15; timeRaw += ' والربع'; }
    else if (t.includes(' الا ربع ')) { minute = 45; hour = hour - 1; timeRaw += ' إلا ربع'; }
    for (const p of PERIODS) if (p.w.some((w) => t.includes(' ' + w + ' '))) { explicitPeriod = p.shift; break; }
  }
  if (!day && hour == null) return null;
  const issues = [];
  let alternatives = [];
  if (hour != null) {
    if (hour > 23 || minute > 59) return { raw: raw.join(' '), invalid: true, issues: [{ field: 'due', message: 'الوقت المذكور غير صالح' }] };
    if (hour <= 12) {
      if (explicitPeriod === 'pm' && hour < 12) hour += 12;
      else if (explicitPeriod === 'am' && hour === 12) hour = 0;
      else if (!explicitPeriod && hour >= 1 && hour <= 11) {
        // غير محدد صباحاً أو مساءً: نقترح الأقرب لساعات العمل، ونطلب التأكيد
        const am = hour, pm = hour + 12;
        const guess = hour >= 7 ? am : pm;
        alternatives = [am, pm];
        hour = guess;
        issues.push({ field: 'due', message: 'هل الوقت صباحاً أم مساءً؟', kind: 'time_period' });
      }
    }
  }
  if (!day) {
    day = today;
    dayLabel = 'اليوم (لم يُذكر اليوم)';
    issues.push({ field: 'due', message: 'لم يُذكر اليوم، افترضنا اليوم', kind: 'day_missing' });
  }
  const d = new Date(+day + (hour ?? 0) * 3600000 + minute * 60000);
  if (hour != null && +d < +now && dayLabel.startsWith('اليوم')) issues.push({ field: 'due', message: 'الوقت المستخلص مضى اليوم', kind: 'past' });
  return {
    iso: d.toISOString(),
    has_time: hour != null,
    raw: [...raw, timeRaw].filter(Boolean).join(' '),
    day_label: dayLabel,
    alternatives: alternatives.map((h) => new Date(+day + h * 3600000 + minute * 60000).toISOString()),
    issues,
  };
}

function extractPhones(text) {
  const latin = toLatinDigits(text);
  const phones = [];
  const re = /(?:\+|00)?(?:222[\s.-]?)?(\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})(?!\d)/g;
  let m; let cleaned = latin;
  while ((m = re.exec(latin))) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length === 8 && /^[234]/.test(digits)) { phones.push(digits); cleaned = cleaned.replace(m[0], ' '); }
  }
  return { phones, cleaned };
}

function pickName(tokens, i, placesUsed) {
  const out = [];
  for (let k = i; k < tokens.length && out.length < 4; k++) {
    let tok = tokens[k];
    if (k === i) tok = tok.replace(/^(ل|ب)(?=..)/, (p) => p); // معالجة لاحقاً
    if (STOP.has(tok) || /\d/.test(tok) || placesUsed.has(k)) break;
    if (out.length > 0 && !NAME_LINKS.has(out[out.length - 1]) && !NAME_PREFIX.has(out[out.length - 1]) && !NAME_LINKS.has(tok)) break;
    out.push(tok);
  }
  while (out.length && NAME_LINKS.has(out[out.length - 1])) out.pop();
  return out.join(' ');
}

export function parseCapture(input, { gazetteer = [], people = [], now = new Date() } = {}) {
  const raw = String(input || '').trim();
  const issues = [];
  const res = { raw, intent: null, intent_sure: false, person: { name: '', phone: '', match_ids: [] }, deal: null, deal_inferred: false, types: [], locations: [], landmark: '', area_m2: null, area_raw: '', price: null, bedrooms: null, lot_number: '', plan: '', sector: '', due: null, task_title: '', features: [], issues };
  if (!raw) return res;

  const { phones, cleaned } = extractPhones(raw);
  if (phones.length) res.person.phone = phones[0];
  const n = norm(cleaned);
  const tokens = n.split(' ').filter(Boolean);
  const has = (w) => (' ' + n + ' ').includes(' ' + w + ' ');
  const hasAny = (arr) => arr.some((w) => has(w) || tokens.some((t) => prefixVariants(t).includes(w)));

  // النية
  const first = tokens[0] || '';
  if (REMIND_WORDS.some((w) => n.startsWith(w)) || (CALL_WORDS.includes(first.replace(/^(ان|و)/, '')) )) { res.intent = 'reminder'; res.intent_sure = true; }
  else if (first === 'طلب' || first === 'مطلوب') { res.intent = 'request'; res.intent_sure = true; }
  else if (first === 'عرض' || first === 'معروض') { res.intent = 'offer'; res.intent_sure = true; }
  else {
    const r = hasAny(REQUEST_WORDS), o = hasAny(OFFER_WORDS) || (!r && hasAny(OFFER_WEAK)), rem = hasAny(REMIND_WORDS);
    if (rem) { res.intent = 'reminder'; res.intent_sure = true; }
    else if (r && !o) { res.intent = 'request'; res.intent_sure = true; }
    else if (o && !r) { res.intent = 'offer'; res.intent_sure = true; }
    else if (r && o) { res.intent = 'request'; issues.push({ field: 'intent', message: 'النص يحتمل طلباً أو عرضاً، حدّد النوع' }); }
    else { res.intent = 'note'; issues.push({ field: 'intent', message: 'لم نتعرف على نوع الإدخال، اختر: طلب أو عرض أو تذكير' }); }
  }

  // الأماكن
  const { found: places, used: placeIdx } = findPlaces(tokens, gazetteer);
  const seen = new Set();
  for (const p of places) {
    const k = p.area_id || p.moughataa_code || p.wilaya_code;
    if (seen.has(k)) continue; seen.add(k);
    res.locations.push({ wilaya_code: p.wilaya_code || null, moughataa_code: p.moughataa_code || null, area_id: p.area_id || null, text: p.text, label: p.label, level: p.level });
  }
  // معلم قريب
  const lm = n.match(/(?:قرب|جنب|بجانب|قريب من|خلف|وراء|امام|مقابل|عند) ((?:كارفور|سوق|مسجد|جامع|مستشفي|محطه|مدرسه|ملتقي|بنك|صيدليه|carrefour)(?: [^\s\d]+){0,2})/) || n.match(/((?:كارفور|carrefour)(?: [^\s\d]+){1,2})/);
  if (lm) res.landmark = lm[1].split(' ').filter((w) => !STOP.has(w)).join(' ');

  // الشخص
  let nameAt = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t === 'طلب' || t === 'عرض' || t === 'زبون') && tokens[i + 1]?.startsWith('ل') && tokens[i + 1].length > 2) { tokens[i + 1] = tokens[i + 1].slice(1); nameAt = i + 1; break; }
    if ((t === 'عند' || t === 'من' || t === 'مع' || t === 'للسيد' || t === 'السيد') && tokens[i + 1] && !placeIdx.has(i + 1)) { nameAt = i + 1; break; }
    if (CALL_WORDS.includes(t.replace(/^(ا|ن|و)?/, (x) => x)) || CALL_WORDS.includes(t)) {
      const nx = tokens[i + 1];
      if (nx && nx.startsWith('ب') && nx.length > 2) { tokens[i + 1] = nx.slice(1); nameAt = i + 1; break; }
      if (nx === 'علي' || nx === 'مع') { nameAt = i + 2; break; }
    }
    if (/^(ل|ب)/.test(t) && i === 1 && (tokens[0] === 'طلب' || tokens[0] === 'عرض')) { tokens[i] = t.slice(1); nameAt = i; break; }
  }
  if (nameAt === -1 && (tokens[0] === 'طلب' || tokens[0] === 'عرض') && tokens[1] && !STOP.has(tokens[1]) && !placeIdx.has(1)) nameAt = 1;
  if (nameAt >= 0 && tokens[nameAt] && !placeIdx.has(nameAt)) {
    const nm = pickName(tokens, nameAt, placeIdx);
    if (nm) {
      // استرجاع الكتابة الأصلية من النص الخام قدر الإمكان
      res.person.name = recoverOriginal(raw, nm) || nm;
    }
  }
  if (res.person.name || res.person.phone) {
    const pn = normTight(res.person.name);
    res.person.match_ids = people.filter((p) => (pn && normTight(p.name) === pn) || (res.person.phone && (p.phones || []).some((ph) => ph.endsWith(res.person.phone)))).map((p) => p.id);
    if (res.person.match_ids.length > 1) issues.push({ field: 'person', message: `يوجد ${res.person.match_ids.length} أشخاص بهذا الاسم، اختر الشخص المقصود` });
  }

  // نوع العملية
  const sale = hasAny(SALE_WORDS), rent = hasAny(RENT_WORDS);
  if (rent && !sale) res.deal = 'rent';
  else if (sale && !rent) res.deal = 'sale';

  // نوع العقار
  for (const [type, words] of Object.entries(TYPE_WORDS)) {
    if (words.some((w) => (w.includes(' ') ? has(w) : tokens.some((t) => prefixVariants(t).includes(w))))) res.types.push(type);
  }
  if (has('ركن') || has('زاويه') || has('coin')) res.features.push('corner');
  if (has('مسفلت') || has('goudron') || has('شارع مسفلت')) res.features.push('paved');
  if (has('مفروشه') || has('meuble')) res.features.push('furnished');

  // رقم القطعة والمخطط والقطاع
  const lot = n.match(/(?:رقم القطعه|القطعه رقم|القطعه|نمره رقم|نمره|رقم|lot|n°|no) ?([a-z]?\d+[a-z0-9\-\/]*)/i);
  if (lot && !/متر|م2/.test(n.slice(n.indexOf(lot[1]) + lot[1].length, n.indexOf(lot[1]) + lot[1].length + 6))) res.lot_number = lot[1];
  const sec = n.match(/(?:قطاع|القطاع|secteur|sect) ?(\d+[a-z]?)/);
  if (sec) res.sector = sec[1];
  const plan = n.match(/(?:مخطط|المخطط|lotissement) ((?:[^\s\d]+ ?){1,2}|\d+)/);
  if (plan) res.plan = plan[1].trim().split(' ').filter((w) => !STOP.has(w)).join(' ');

  // الأرقام: المساحة والسعر وعدد الغرف
  const nn = extractNumbers(cleaned);
  const nums = nn.numbers;
  const tk = nn.tokens.map((x) => x.t);
  const after = (num, k = 1) => tk.slice(num.tokenEnd, num.tokenEnd + k).join(' ');
  const before = (num, k = 1) => tk.slice(Math.max(0, num.tokenStart - k), num.tokenStart).join(' ');
  const consumed = new Set();
  // 20 في 30 / 20x30
  for (let i = 0; i < nums.length - 1; i++) {
    const a = nums[i], b = nums[i + 1];
    const mid = tk.slice(a.tokenEnd, b.tokenStart).join(' ');
    if (b.tokenStart - a.tokenEnd === 1 && /^(في|x|×|\*|علي|ب)$/.test(mid) && a.value < 200 && b.value < 200) {
      res.area_m2 = a.value * b.value; res.area_raw = `${a.value}×${b.value}`; consumed.add(i); consumed.add(i + 1);
    }
  }
  const lotNum = res.lot_number ? Number(toLatinDigits(res.lot_number).replace(/\D/g, '')) : null;
  const moneyCands = [];
  nums.forEach((num, i) => {
    if (consumed.has(i)) return;
    const a1 = after(num), a2 = after(num, 2);
    // رقم القطعة/القطاع أولاً حتى لا يُقرأ «نمرة 552m» كمساحة
    if (/(رقم|نمره|القطعه|قطاع|lot|n°)$/.test(before(num)) || (lotNum != null && num.value === lotNum && num.value < 100000)) { consumed.add(i); return; }
    if (/^(متر|م|م2|مربع|مترا|امتار|مترمربع|m|m2|m²|metre|metres|mètres)$/.test(a1)) { if (res.area_m2 == null) { res.area_m2 = num.value; res.area_raw = num.text + ' ' + a1; } consumed.add(i); return; }
    if (/^(غرف|غرفه|غرفتين|chambres?|بيوت|بيت)$/.test(a1)) { if (res.bedrooms == null) res.bedrooms = num.value; consumed.add(i); return; }
    if (/(الساعه|h)$/.test(before(num)) || /^(صباحا|مساء|مساءا|h|العصر|الظهر|ظهرا|والنصف|ونص)/.test(a1) || /^[:.]\d/.test(a1)) { consumed.add(i); return; }
    if (/^(ايام|يوم|يومين|اسبوع|اسابيع)/.test(a1) || /بعد$/.test(before(num))) { consumed.add(i); return; }
    const big = num.value >= 100000;
    const moneyWord = /(اوقيه|اوقيات|ouguiya|um|mru|mro|الف|مليون|ملايين)/.test(a2 + ' ' + num.text);
    const ctx = /(السعر|بسعر|ميزانيه|ميزانيته|ميزانيتها|ثمن|ثمنه|بمبلغ|ب|بحدود|حدود|بين|من|الي|الايجار|الكراء|يطلب)$/.test(before(num));
    if (big || moneyWord || ctx) moneyCands.push({ num, i });
  });
  if (moneyCands.length) {
    const priceRawTokens = [];
    let min = null, max = null, amount = null;
    const first = moneyCands[0].num;
    // «بين 40 و 50 مليون» أو «من 40 الى 50 مليون»
    if (moneyCands.length >= 2 && /(بين|من)$/.test(before(first))) {
      let a = moneyCands[0].num.value, b = moneyCands[1].num.value;
      if (a < 1000 && b >= 1e5) { const mult = 10 ** Math.floor(Math.log10(b / (b >= 1e9 ? b / 1e9 : b >= 1e6 ? b / 1e6 : b / 1e3))); a = a * mult; }
      min = Math.min(a, b); max = Math.max(a, b);
      priceRawTokens.push(before(first), first.text, tk.slice(first.tokenEnd, moneyCands[1].num.tokenEnd).join(' '));
    } else {
      amount = first.value;
      priceRawTokens.push(first.text, after(first));
    }
    const ctxAll = ' ' + n + ' ';
    let currency = 'unknown';
    if (/ (جديده|الجديده|mru) /.test(ctxAll) || /اوقيه جديده/.test(ctxAll)) currency = 'MRU';
    else if (/ (قديمه|القديمه|mro) /.test(ctxAll)) currency = 'MRO';
    let basis = 'total';
    if (/(شهريا|في الشهر|للشهر|بالشهر|par mois|mensuel)/.test(ctxAll)) basis = 'monthly';
    else if (/(سنويا|في السنه|للسنه|par an)/.test(ctxAll)) basis = 'yearly';
    else if (/(لليله|في اليوم|يوميا|par jour)/.test(ctxAll)) basis = 'daily';
    else if (/(للمتر|المتر ب|المتر المربع ب|le m2|par m2)/.test(ctxAll)) basis = 'per_m2';
    const isBudget = res.intent === 'request';
    res.price = { raw: priceRawTokens.join(' ').trim(), amount, min, max, currency, basis, kind: isBudget ? 'budget' : 'price', readings: currencyReadings(amount ?? max) };
    if (currency === 'unknown') issues.push({ field: 'price', kind: 'currency', message: 'حدّد العملة: أوقية قديمة أم جديدة؟' });
    if (basis === 'total' && (res.deal === 'rent')) issues.push({ field: 'price', kind: 'basis', message: 'هل المبلغ شهري أم سنوي أم إجمالي؟' });
    // استنتاج نوع العملية من حجم المبلغ (مع التأكيد)
    if (!res.deal && basis === 'total' && (amount ?? max) >= 1e6) { res.deal = 'sale'; res.deal_inferred = true; }
  }
  if (!res.deal && res.intent !== 'reminder' && res.intent !== 'note') issues.push({ field: 'deal', message: 'بيع أم إيجار؟' });
  if (res.deal_inferred) issues.push({ field: 'deal', kind: 'inferred', message: 'افترضنا «بيع» من حجم المبلغ، تأكد' });

  // الموعد/التذكير
  const due = parseWhen(cleaned, now);
  if (due) {
    res.due = due;
    for (const i of due.issues) issues.push(i);
  }
  if (res.intent === 'reminder') {
    res.task_title = buildTaskTitle(raw);
    if (!due) issues.push({ field: 'due', message: 'متى؟ لم يُذكر وقت للتذكير' });
  }
  return res;
}

function buildTaskTitle(raw) {
  return raw.replace(/^(ذكّرني|ذكرني|ذكريني|تذكير|نبهني)\s*(أن|ان|بأن|بان)?\s*/u, '').replace(/\s+(غداً|غدا|بكرة|بكره|اليوم|بعد غد).*$/u, '').trim() || raw;
}

// يبحث في النص الأصلي عن الكلمات المطابقة للاسم المطبّع ليحافظ على كتابته الأصلية
function recoverOriginal(raw, normalizedName) {
  const words = raw.split(/\s+/);
  const target = normalizedName.split(' ');
  const fit = (w, t) => (norm(w) === t ? w : /^[لب]/.test(w) && norm(w.slice(1)) === t ? w.slice(1) : null);
  for (let i = 0; i + target.length <= words.length; i++) {
    const out = target.map((t, k) => fit(words[i + k], t));
    if (out.every(Boolean)) return out.join(' ');
  }
  return null;
}
