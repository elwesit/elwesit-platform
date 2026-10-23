// قراءة الإحداثيات من نص أو رابط خرائط (Google / Apple / OpenStreetMap / geo:).
import { toLatinDigits } from './text.js';

const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function dms(s) {
  // 18°05'09.1"N 15°58'42.6"W
  const re = /(\d{1,3})[°º]\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)?["″]?\s*([NSEW])/gi;
  const parts = [...s.matchAll(re)];
  if (parts.length < 2) return null;
  const conv = (m) => { let v = +m[1] + +m[2] / 60 + (+m[3] || 0) / 3600; if (/[SW]/i.test(m[4])) v = -v; return { v, ax: /[NS]/i.test(m[4]) ? 'lat' : 'lng' }; };
  const a = conv(parts[0]), b = conv(parts[1]);
  const lat = a.ax === 'lat' ? a.v : b.v, lng = a.ax === 'lat' ? b.v : a.v;
  return valid(lat, lng) ? { lat, lng } : null;
}

export function parseLocation(input) {
  if (!input) return null;
  const s = toLatinDigits(String(input)).trim();
  let dec;
  try { dec = decodeURIComponent(s); } catch { dec = s; }
  const pats = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,                    // Google place data (الأدق)
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,                       // Google @lat,lng
    /[?&](?:q|query|ll|sll|daddr|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, // Google/Apple
    /mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/,                 // OSM
    /#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/,                // OSM
    /geo:(-?\d+\.\d+),(-?\d+\.\d+)/,                       // geo URI
    /^\s*(-?\d{1,2}\.\d{3,})\s*[,،\s]\s*(-?\d{1,3}\.\d{3,})\s*$/, // «18.0858, -15.9785»
  ];
  for (const re of pats) {
    const m = dec.match(re);
    if (m) { const lat = +m[1], lng = +m[2]; if (valid(lat, lng)) return { lat, lng }; }
  }
  const d = dms(dec);
  if (d) return d;
  return null;
}

export const SHORT_LINK_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.google.com', 'www.google.com', 'google.com', 'maps.apple.com', 'osm.org', 'www.openstreetmap.org'];

export function directionsLinks(lat, lng) {
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    apple: `https://maps.apple.com/?daddr=${lat},${lng}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
    geo: `geo:${lat},${lng}?q=${lat},${lng}`,
  };
}
