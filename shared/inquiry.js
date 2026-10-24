// رسائل واتساب الجاهزة للاستفسار عن عرض منشور: من الزبون إلينا، ومن الإدارة ردّاً عليه.
// تُحذف الأسطر التي لا تتوفر بياناتها.
import { formatNumber } from './money.js';

// بيانات العرض كما تظهر في الرسالة (تُحفظ نسخة منها مع الاستفسار)
export function listingFacts(l, { url, price } = {}) {
  return { title: l.title || '', ref: l.ref || '', place: l.place_label || '', area_m2: l.area_m2 || null, price: price || '', url: url || '' };
}

export function factLines(f = {}) {
  return [
    ['العقار', f.title], ['رقم العرض', f.ref], ['المنطقة', f.place],
    ['المساحة', f.area_m2 ? `${formatNumber(f.area_m2)} م²` : ''], ['السعر', f.price], ['رابط العقار', f.url],
  ].filter(([, v]) => v != null && String(v).trim()).map(([k, v]) => `• ${k}: ${String(v).trim()}`);
}

export function inquiryMessage(f, question = '', siteName = 'الوسيط العقاري') {
  const q = String(question || '').trim();
  return [`السلام عليكم، أنا مهتم بهذا العقار المنشور في موقع ${siteName}:`, ...factLines(f), ...(q ? [`• استفساري: ${q}`] : [])].join('\n');
}

export function replyMessage(f, { name = '', siteName = 'الوسيط العقاري' } = {}) {
  const hi = `السلام عليكم${name ? ' ' + name : ''}، معك ${siteName} بخصوص استفسارك عن هذا العقار:`;
  return [hi, ...factLines(f)].join('\n');
}
