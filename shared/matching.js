// مطابقة الطلبات بالعروض. لا نعطي «درجة» رقمية توحي بيقين؛ نعرض أسباب الترشيح
// وأوجه الاختلاف والمعلومات الناقصة، ونصنّف المطابقة نصياً: قوية / جزئية / ضعيفة.

import { toMRU, formatPrice } from './money.js';
import { TYPES } from './vocab.js';

const pct = (x) => `${Math.round(x * 100)}%`;

export function priceMRU(amount, currency) { return toMRU(amount, currency); }

// request: {deal, types[], locations[{wilaya_code,moughataa_code,area_id,text}], budget_min, budget_max, budget_currency, budget_basis, area_min, area_max, bedrooms_min, flexibility}
// property: {deal, type, wilaya_code, moughataa_code, area_id, area_text, price_amount, price_currency, price_basis, area_m2, bedrooms, availability, verified_at}
export function matchRequestProperty(req, prop, { labels = {}, now = new Date(), staleDays = 30 } = {}) {
  const reasons = [], diffs = [], missing = [];
  if (prop.archived_at) return null;
  if (['sold', 'rented', 'withdrawn'].includes(prop.availability)) return null;
  // العملية شرط أساسي
  if (req.deal && prop.deal && req.deal !== prop.deal) return null;
  if (req.deal && prop.deal) reasons.push(req.deal === 'sale' ? 'للبيع كما يطلب' : 'للإيجار كما يطلب');
  else missing.push('نوع العملية غير محدد في ' + (req.deal ? 'العرض' : 'الطلب'));

  // النوع
  const types = req.types || [];
  if (types.length && prop.type) {
    if (types.includes(prop.type)) reasons.push(`النوع: ${TYPES[prop.type] || prop.type}`);
    else return null; // نوع مختلف تماماً لا يُرشَّح
  } else if (!prop.type) missing.push('نوع العقار غير محدد في العرض');

  // الموقع
  let locScore = 0;
  const locs = req.locations || [];
  if (locs.length) {
    let best = 0, bestText = '';
    for (const l of locs) {
      if (l.area_id && prop.area_id && l.area_id === prop.area_id) { best = 3; bestText = labels.area?.(l.area_id) || l.text; break; }
      if (l.moughataa_code && prop.moughataa_code === l.moughataa_code) { if (best < 2) { best = 2; bestText = labels.moughataa?.(l.moughataa_code) || l.text; } }
      else if (l.wilaya_code && prop.wilaya_code === l.wilaya_code && !l.moughataa_code) { if (best < 2) { best = 2; bestText = labels.wilaya?.(l.wilaya_code) || l.text; } }
      else if (l.wilaya_code && prop.wilaya_code === l.wilaya_code) { if (best < 1) { best = 1; bestText = labels.wilaya?.(l.wilaya_code) || l.text; } }
      else if (l.text && prop.area_text && normEq(l.text, prop.area_text)) { if (best < 2) { best = 2; bestText = l.text; } }
    }
    locScore = best;
    if (best >= 2) reasons.push(`الموقع: ${bestText}`);
    else if (best === 1) diffs.push(`في الولاية نفسها (${bestText}) لكن خارج المقاطعة المطلوبة`);
    else if (!prop.wilaya_code && !prop.moughataa_code && !prop.area_text) missing.push('موقع العرض غير محدد');
    else return null;
  } else missing.push('لم يحدد العميل الموقع');

  // السعر
  let priceOk = null;
  const budgetMax = toMRU(req.budget_max ?? null, req.budget_currency);
  const budgetMin = toMRU(req.budget_min ?? null, req.budget_currency);
  const p = toMRU(prop.price_amount, prop.price_currency);
  const sameBasis = (req.budget_basis || 'total') === (prop.price_basis || 'total');
  if (budgetMax != null && p != null && sameBasis) {
    if (p <= budgetMax && (budgetMin == null || p >= budgetMin * 0.7)) { priceOk = true; reasons.push(`السعر ضمن الميزانية (${formatPrice({ amount: prop.price_amount, currency: prop.price_currency })})`); }
    else if (p > budgetMax) {
      const over = (p - budgetMax) / budgetMax;
      if (over <= 0.2) { priceOk = false; diffs.push(`أعلى من الميزانية بحوالي ${pct(over)}`); }
      else return null;
    } else { priceOk = true; diffs.push('أقل بكثير من الحد الأدنى للميزانية'); }
  } else if (budgetMax != null && p != null && !sameBasis) {
    diffs.push('السعر والميزانية بأساسين مختلفين (إجمالي/شهري/للمتر)');
  } else {
    if (p == null) missing.push(prop.price_amount != null ? 'عملة سعر العرض غير مؤكدة' : 'سعر العرض غير معروف');
    if (budgetMax == null) missing.push(req.budget_max != null ? 'عملة الميزانية غير مؤكدة' : 'ميزانية العميل غير محددة');
  }

  // المساحة
  if ((req.area_min != null || req.area_max != null)) {
    if (prop.area_m2 == null) missing.push('مساحة العرض غير معروفة');
    else {
      const a = prop.area_m2;
      if ((req.area_min == null || a >= req.area_min * 0.9) && (req.area_max == null || a <= req.area_max * 1.1)) reasons.push(`المساحة ${a} م²`);
      else diffs.push(`المساحة ${a} م² مقابل المطلوب ${req.area_min ?? '…'}–${req.area_max ?? '…'} م²`);
    }
  }
  // الغرف
  if (req.bedrooms_min != null) {
    if (prop.bedrooms == null) missing.push('عدد الغرف غير معروف');
    else if (prop.bedrooms >= req.bedrooms_min) reasons.push(`${prop.bedrooms} غرف`);
    else diffs.push(`${prop.bedrooms} غرف فقط (المطلوب ${req.bedrooms_min})`);
  }
  // حداثة التحقق
  if (!prop.verified_at) missing.push('لم يُتحقق من توفر العرض وسعره');
  else {
    const days = Math.floor((+now - +new Date(prop.verified_at)) / 86400000);
    if (days > staleDays) diffs.push(`آخر تحقق منذ ${days} يوماً`);
  }
  if (prop.availability === 'reserved') diffs.push('العرض محجوز حالياً');
  if (prop.availability === 'unknown') missing.push('التوفر غير مؤكد');

  let level = 'weak';
  if (locScore >= 2 && priceOk === true && diffs.length === 0) level = 'strong';
  else if (locScore >= 1 && priceOk !== false && reasons.length >= 2) level = 'partial';
  else if (reasons.length >= 3) level = 'partial';
  return { level, reasons, diffs, missing };
}

const LEVEL_ORDER = { strong: 0, partial: 1, weak: 2 };
export const LEVEL_LABEL = { strong: 'مطابقة قوية', partial: 'مطابقة جزئية', weak: 'مطابقة ضعيفة' };

export function rankMatches(list) {
  return list.sort((a, b) => LEVEL_ORDER[a.match.level] - LEVEL_ORDER[b.match.level] || b.match.reasons.length - a.match.reasons.length || a.match.missing.length - b.match.missing.length);
}

function normEq(a, b) {
  const n = (s) => String(s).replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, '').toLowerCase();
  return n(a) === n(b);
}
