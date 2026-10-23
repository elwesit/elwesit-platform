import { toLatinDigits } from './text.js';

// أرقام موريتانيا: 8 أرقام محلية، رمز الدولة 222.
export function normalizePhone(raw) {
  let d = toLatinDigits(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) return '222' + d;
  return d;
}

export function displayPhone(norm) {
  if (!norm) return '';
  if (norm.startsWith('222') && norm.length === 11) {
    const l = norm.slice(3);
    return `${l.slice(0, 2)} ${l.slice(2, 4)} ${l.slice(4, 6)} ${l.slice(6, 8)}`;
  }
  return '+' + norm;
}

export function isPlausiblePhone(raw) {
  const n = normalizePhone(raw);
  return n.length >= 8 && n.length <= 15;
}

export function waLink(norm, text) {
  const n = normalizePhone(norm);
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
