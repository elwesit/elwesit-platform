// النشر: نسخ الحقول المسموح بها فقط من السجل الداخلي إلى public.db، ونسخ الصور المختارة
// إلى مجلد الوسائط العامة بأسماء عشوائية. سحب النشر يحذف الصف والصور فوراً.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { db, publicWriteDb, getSettings, now, audit } from './db.js';
import { config } from './config.js';
import { toMRU } from '../shared/money.js';
import { TYPES, DEALS_PUBLIC } from '../shared/vocab.js';
import { norm } from '../shared/text.js';
import { touchRow } from './entities.js';
import { privatePath } from './media.js';

const PUBLIC_SETTING_KEYS = ['site_name', 'site_tagline', 'site_intro', 'contact_phone', 'contact_whatsapp', 'contact_email', 'office_address', 'office_hours', 'business_name_legal', 'base_url', 'map_tiles_url', 'map_tiles_attribution', 'map_tiles_max_zoom', 'map_center', 'map_zoom', 'listing_page_size', 'privacy_extra', 'terms_extra'];

export function syncPublicSettings() {
  const s = getSettings();
  const p = publicWriteDb();
  const up = p.prepare('INSERT INTO site (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  p.transaction(() => {
    p.prepare('DELETE FROM site').run();
    for (const k of PUBLIC_SETTING_KEYS) if (k in s) up.run(k, JSON.stringify(s[k]));
    // التقسيم الإداري (بيانات مرجعية عامة) لنموذج البحث
    up.run('geo', JSON.stringify({
      wilayas: db().prepare('SELECT code, name_ar FROM wilayas ORDER BY sort').all(),
      moughataas: db().prepare('SELECT code, wilaya_code, name_ar FROM moughataas ORDER BY name_ar').all(),
    }));
  })();
}

export function publishProblems(p) {
  const out = [];
  if (!p.deal) out.push('حدد: بيع أم إيجار');
  if (!p.type) out.push('حدد نوع العقار');
  if (!p.wilaya_code && !p.moughataa_code) out.push('حدد الولاية أو المقاطعة على الأقل');
  if (['sold', 'rented', 'withdrawn'].includes(p.availability)) out.push('العقار غير متوفر (بيع أو أُجّر أو سُحب)');
  return out;
}

export function publishWarnings(p) {
  const w = [];
  if (p.pub_show_price && p.price_amount != null && p.price_currency === 'unknown') w.push('عملة السعر غير محددة؛ سيظهر «السعر عند التواصل» حتى تحددها');
  if (p.pub_show_price && p.price_amount == null) w.push('لا يوجد سعر؛ سيظهر «السعر عند التواصل»');
  if (p.pub_location !== 'hidden' && (p.lat == null || p.lng == null)) w.push('لا يوجد موقع على الخريطة؛ سيظهر العقار في القائمة فقط');
  if (!p.verified_at) w.push('لم تسجّل تاريخ تحقق من التوفر والسعر');
  return w;
}

// إزاحة حتمية: الموقع الحقيقي يقع دائماً داخل الدائرة المعروضة، دون أن يكون مركزها
export function approximate(lat, lng, id, radiusM) {
  const h = crypto.createHash('sha256').update('approx:' + id).digest();
  const angle = (h.readUInt16BE(0) / 65535) * 2 * Math.PI;
  const dist = radiusM * (0.25 + (h.readUInt16BE(2) / 65535) * 0.45);
  const dLat = (dist * Math.cos(angle)) / 111320;
  const dLng = (dist * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: +(lat + dLat).toFixed(4), lng: +(lng + dLng).toFixed(4) };
}

function placeLabel(p, showArea) {
  const m = p.moughataa_code ? db().prepare('SELECT name_ar FROM moughataas WHERE code = ?').get(p.moughataa_code) : null;
  const w = p.wilaya_code ? db().prepare('SELECT name_ar FROM wilayas WHERE code = ?').get(p.wilaya_code) : null;
  const area = p.area_id ? db().prepare('SELECT name FROM areas WHERE id = ?').get(p.area_id)?.name : p.area_text;
  return [showArea ? area : null, m?.name_ar, w?.name_ar].filter(Boolean).join('، ');
}

export function autoTitle(p) {
  const place = p.moughataa_code ? db().prepare('SELECT name_ar FROM moughataas WHERE code = ?').get(p.moughataa_code)?.name_ar : '';
  return [TYPES[p.type] || 'عقار', DEALS_PUBLIC[p.deal] || '', place ? `في ${place}` : ''].filter(Boolean).join(' ');
}

async function buildPhotos(p, ref) {
  const ids = JSON.parse(p.pub_photo_ids || '[]');
  const dir = path.join(config.publicMediaDir, ref);
  fs.rmSync(dir, { recursive: true, force: true });
  if (!ids.length) return [];
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const id of ids) {
    const f = db().prepare("SELECT * FROM files WHERE id = ? AND owner_type = 'property' AND owner_id = ? AND kind = 'photo' AND archived_at IS NULL").get(id, p.id);
    if (!f) continue;
    const key = crypto.randomBytes(9).toString('base64url');
    const src = privatePath(f.storage_key);
    // إعادة ترميز بلا بيانات وصفية (EXIF/GPS) لكل نسخة عامة
    const big = await sharp(src).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, key + '.webp'));
    await sharp(src).rotate().resize({ width: 520, height: 400, fit: 'cover' }).webp({ quality: 70 }).toFile(path.join(dir, key + '-t.webp'));
    out.push({ key, w: big.width, h: big.height });
  }
  return out;
}

export async function publishProperty(id, user, { dryRun = false } = {}) {
  const p = db().prepare('SELECT * FROM properties WHERE id = ?').get(id);
  if (!p) return { error: 'غير موجود' };
  const problems = publishProblems(p);
  if (problems.length) return { problems };
  const s = getSettings();
  const showPrice = !!p.pub_show_price && p.price_amount != null && p.price_currency !== 'unknown';
  let lat = null, lng = null, radius = null, mode = p.pub_location;
  if (p.lat == null || p.lng == null) mode = 'hidden';
  if (mode === 'exact') { lat = p.lat; lng = p.lng; }
  if (mode === 'approximate') { const a = approximate(p.lat, p.lng, p.id, s.approx_radius_m || 600); lat = a.lat; lng = a.lng; radius = s.approx_radius_m || 600; }
  let boundary = null, boundarySource = null;
  if (p.pub_show_boundary && mode === 'exact') {
    const g = db().prepare("SELECT * FROM geometries WHERE property_id = ? AND method = 'imported' AND verified = 1 AND source_license != '' AND archived_at IS NULL ORDER BY updated_at DESC").get(p.id);
    if (g) { boundary = g.geojson; boundarySource = `${g.source_name}${g.source_date ? ' (' + g.source_date.slice(0, 10) + ')' : ''}`; }
  }
  const photos = dryRun ? JSON.parse(p.pub_photo_ids || '[]').map((fid) => ({ file_id: fid })) : await buildPhotos(p, p.ref);
  const title = (p.pub_title || '').trim() || autoTitle(p);
  const description = (p.pub_description || '').trim() || (p.description || '').trim();
  const place = placeLabel(p, true);
  const landmark = p.pub_show_landmark ? p.landmark : '';
  const lot = p.pub_show_lot ? p.lot_number : '';
  const t = now();
  const row = {
    ref: p.ref, deal: p.deal, type: p.type, title, description,
    wilaya_code: p.wilaya_code, moughataa_code: p.moughataa_code,
    place_label: place, landmark,
    search_text: norm([title, description, place, landmark, lot, p.pub_show_plan ? p.plan : '', p.ref].join(' ')),
    price_amount: showPrice ? p.price_amount : null, price_currency: showPrice ? p.price_currency : null, price_basis: showPrice ? p.price_basis : null,
    price_mru: showPrice ? toMRU(p.price_amount, p.price_currency) : null,
    price_hidden: showPrice ? 0 : 1, price_negotiable: showPrice ? p.price_negotiable : 0,
    area_m2: p.area_m2, lot_number: lot, plan: p.pub_show_plan ? p.plan : '', sector: p.pub_show_plan ? p.sector : '',
    bedrooms: p.bedrooms, bathrooms: p.bathrooms, floors: p.floors, features: p.features || '[]',
    loc_mode: mode, lat, lng, radius_m: radius, boundary, boundary_source: boundarySource,
    photos: JSON.stringify(photos), cover: photos[0]?.key || null,
    published_at: p.published_at || t, updated_at: t,
  };
  if (dryRun) return { ok: true, warnings: publishWarnings(p), listing: row };
  const cols = Object.keys(row);
  publicWriteDb().prepare(`INSERT INTO listings (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(ref) DO UPDATE SET ${cols.filter((c) => c !== 'ref' && c !== 'published_at').map((c) => `${c} = excluded.${c}`).join(', ')}`).run(...cols.map((c) => row[c]));
  if (!p.published) { touchRow('properties', p.id, { published: 1, published_at: row.published_at }); audit(user?.id, 'publish', 'properties', p.id); }
  return { ok: true, warnings: publishWarnings(p), listing: row };
}

export function unpublishProperty(id, user, reason = '') {
  const p = db().prepare('SELECT id, ref, published FROM properties WHERE id = ?').get(id);
  if (!p) return { error: 'غير موجود' };
  publicWriteDb().prepare('DELETE FROM listings WHERE ref = ?').run(p.ref);
  fs.rmSync(path.join(config.publicMediaDir, p.ref), { recursive: true, force: true });
  if (p.published) { touchRow('properties', p.id, { published: 0 }); audit(user?.id, 'unpublish', 'properties', p.id, reason); }
  return { ok: true };
}

// بعد أي تعديل على عقار منشور: حدّث النسخة العامة، أو اسحبها إن لم يعد صالحاً للنشر
export async function refreshIfPublished(id, user) {
  const p = db().prepare('SELECT * FROM properties WHERE id = ?').get(id);
  if (!p || !p.published) return null;
  if (p.archived_at || publishProblems(p).length) return { unpublished: true, ...unpublishProperty(id, user, 'auto') };
  return publishProperty(id, user);
}
