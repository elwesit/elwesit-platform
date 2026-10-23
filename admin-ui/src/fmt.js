import { TZ, TYPES, DEALS, DEALS_PUBLIC } from '@shared/vocab.js';
import { formatPrice, formatAmountWords, toMRU, CURRENCIES } from '@shared/money.js';
import { normalizePhone, displayPhone } from '@shared/phone.js';
import { table } from './data.js';

const DAY = 86400000;
const dtf = (o) => new Intl.DateTimeFormat('ar-MR-u-nu-latn', { timeZone: TZ, ...o });

export const fmtDate = (iso) => (iso ? dtf({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)) : '');
export const fmtDateLong = (iso) => (iso ? dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '');
export const fmtTime = (iso) => (iso ? dtf({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '');
export const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '');

export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const d = Math.floor((now - Date.parse(iso)) / DAY);
  if (d <= 0) return 'اليوم';
  if (d === 1) return 'أمس';
  if (d < 30) return `منذ ${d} يوماً`;
  const m = Math.floor(d / 30);
  return m < 12 ? `منذ ${m} شهر` : `منذ ${Math.floor(m / 12)} سنة`;
}

export function relDay(iso, now = new Date()) {
  if (!iso) return '';
  const s = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(iso);
  const dd = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - s) / DAY);
  if (dd === 0) return 'اليوم';
  if (dd === 1) return 'غداً';
  if (dd === -1) return 'أمس';
  return fmtDate(iso);
}

// قيم datetime-local بتوقيت نواكشوط (UTC+0)
export const toLocalInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
export const fromLocalInput = (v) => (v ? new Date(v + ':00Z').toISOString() : null);
export const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
export const fromDateInput = (v) => (v ? new Date(v + 'T00:00:00Z').toISOString() : null);

export function daysFrom(n, hour = 9) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n, hour)).toISOString();
}

export const price = (amount, currency, basis) => (amount == null ? '' : formatPrice({ amount, currency, basis }));
export { formatAmountWords, toMRU, CURRENCIES, TYPES, DEALS, DEALS_PUBLIC, displayPhone, normalizePhone };

export function geoLabel(row) {
  const m = row.moughataa_code && table('moughataas').find((x) => x.code === row.moughataa_code);
  const w = row.wilaya_code && table('wilayas').find((x) => x.code === row.wilaya_code);
  const a = row.area_id && table('areas').find((x) => x.id === row.area_id);
  return [a?.name || row.area_text, m?.name_ar, !m && w?.name_ar].filter(Boolean).join('، ');
}
export function locLabel(l) {
  if (l.area_id) return table('areas').find((a) => a.id === l.area_id)?.name || l.text;
  if (l.moughataa_code) return table('moughataas').find((m) => m.code === l.moughataa_code)?.name_ar || l.text;
  if (l.wilaya_code) return table('wilayas').find((w) => w.code === l.wilaya_code)?.name_ar || l.text;
  return l.text || '';
}
export function personLabel(id) {
  const p = id && table('people').find((x) => x.id === id);
  return p ? p.name || 'بدون اسم' : '';
}
export function phonesOf(personId) {
  return table('phones').filter((p) => p.person_id === personId && !p.archived_at);
}
export function primaryPhone(personId) {
  const ps = phonesOf(personId);
  return ps.find((p) => p.whatsapp) || ps[0];
}

export const waUrl = (phone, text) => `https://wa.me/${normalizePhone(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
export const telUrl = (phone) => `tel:+${normalizePhone(phone)}`;

export function propertyTitle(p) {
  if (p.title) return p.title;
  const m = p.moughataa_code && table('moughataas').find((x) => x.code === p.moughataa_code);
  return [TYPES[p.type] || 'عقار', p.deal ? DEALS_PUBLIC[p.deal] : '', m ? 'في ' + m.name_ar : (p.area_text ? 'في ' + p.area_text : '')].filter(Boolean).join(' ');
}

// نص مشاركة يحترم خيارات الإخفاء ولا يتضمن الملاحظات الداخلية أو المصدر أو المالك
export function shareText(p, settings, tpl) {
  const base = (settings?.base_url || location.origin).replace(/\/$/, '');
  const showPrice = p.pub_show_price && p.price_amount != null && p.price_currency !== 'unknown';
  const mru = showPrice ? toMRU(p.price_amount, p.price_currency) : null;
  const vars = {
    title: p.pub_title || propertyTitle(p),
    deal_label: DEALS_PUBLIC[p.deal] || '',
    place: [geoLabel(p), p.pub_show_landmark && p.landmark ? 'قرب ' + p.landmark : ''].filter(Boolean).join(' — '),
    area: p.area_m2 ? `المساحة: ${p.area_m2} م²${p.pub_show_lot && p.lot_number ? ` (قطعة ${p.lot_number})` : ''}\n` : '',
    price: showPrice ? `السعر: ${formatAmountWords(mru)} أوقية جديدة (${formatAmountWords(mru * 10)} قديمة)${p.price_basis !== 'total' ? ' ' + ({ monthly: 'شهرياً', yearly: 'سنوياً', daily: 'يومياً', per_m2: 'للمتر' }[p.price_basis] || '') : ''}` : 'السعر عند التواصل',
    ref: p.ref,
    link: p.published ? `${base}/p/${encodeURIComponent(p.ref)}` : '',
    site_name: settings?.site_name || '',
    name: '',
  };
  return fillTemplate(tpl || '{deal_label}: {title}\n📍 {place}\n{area}{price}\nالمرجع: {ref}\n{link}', vars);
}
export function fillTemplate(body, vars) {
  return String(body || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

// ملف تقويم .ics لإضافة الموعد إلى تقويم الهاتف (تذكير يعمل حتى والتطبيق مغلق)
export function icsFor({ title, start, minutes = 60, place = '', notes = '', remind = 60 }) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(Date.parse(start) + minutes * 60000).toISOString();
  const esc = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wasit//AR', 'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@wasit`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(title)}`, place && `LOCATION:${esc(place)}`, notes && `DESCRIPTION:${esc(notes)}`, 'BEGIN:VALARM', `TRIGGER:-PT${remind}M`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  return URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
}
