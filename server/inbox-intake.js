// المدخل الوحيد من الموقع العام إلى البيانات الخاصة: إضافة عنصر إلى «الوارد» (وصوره) فقط.
import crypto from 'node:crypto';
import { db, publicReadDb, now, uid } from './db.js';
import { storeUpload } from './media.js';
import { normalizePhone, isPlausiblePhone } from '../shared/phone.js';
import { TYPES } from '../shared/vocab.js';
import { listingFacts } from '../shared/inquiry.js';
import { priceLine } from './public-views.js';
import { touchRow } from './entities.js';

const REPEAT_WINDOW = 30 * 60 * 1000; // استفسار الرقم نفسه عن العقار نفسه خلال نصف ساعة = الاستفسار نفسه

const KINDS = new Set(['search', 'offer', 'interest', 'contact']);
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export async function submitInbox(body, files = [], { baseUrl = '' } = {}) {
  const kind = String(body.kind || '');
  if (!KINDS.has(kind)) return { error: 'نوع الطلب غير معروف' };
  // حقل فخ للبرامج الآلية: نتظاهر بالنجاح ولا نحفظ شيئاً
  if (body.website) return { ok: true, receipt: 'OK-' + crypto.randomBytes(3).toString('hex').toUpperCase(), duplicate: false };
  const phone = clip(body.phone, 30);
  if (!isPlausiblePhone(phone)) return { error: 'رقم الهاتف غير صحيح. اكتب رقماً من 8 أرقام، مثل 22 33 44 55' };
  const token = /^[0-9a-f-]{36}$/i.test(body.client_token || '') ? body.client_token : null;
  if (token) {
    const prev = db().prepare('SELECT id, created_at FROM inbox WHERE client_token = ?').get(token);
    if (prev) return { ok: true, duplicate: true, receipt: receiptOf(prev.id) }; // إعادة الإرسال نفسه لا تكرر الطلب
  }
  let propertyRef = '', listing = null;
  const viaWa = kind === 'interest' && body.via === 'whatsapp';
  if (kind === 'interest') {
    propertyRef = clip(body.property_ref, 20);
    const l = publicReadDb().prepare('SELECT * FROM listings WHERE ref = ?').get(propertyRef);
    if (!l) return { error: 'العقار غير متوفر حالياً' };
    // نسخة من بيانات العرض وقت الاستفسار، لرسالة الرد من لوحة الإدارة
    listing = listingFacts(l, { url: baseUrl ? `${baseUrl}/p/${encodeURIComponent(l.ref)}` : '', price: priceLine(l) });
    if (viaWa && !clip(body.name, 120)) return { error: 'اكتب اسمك' };
    const prev = db().prepare("SELECT id, message FROM inbox WHERE kind = 'interest' AND phone_norm = ? AND property_ref = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1")
      .get(normalizePhone(phone), propertyRef, new Date(Date.now() - REPEAT_WINDOW).toISOString());
    if (prev) {
      const msg = clip(body.message, 1000);
      if (msg && !prev.message.includes(msg)) touchRow('inbox', prev.id, { message: [prev.message, msg].filter(Boolean).join('\n') });
      return { ok: true, duplicate: true, receipt: receiptOf(prev.id) };
    }
  }
  if (kind === 'contact' && !clip(body.message, 10)) return { error: 'اكتب رسالتك' };
  const payload = {
    deal: ['sale', 'rent'].includes(body.deal) ? body.deal : null,
    type: TYPES[body.type] ? body.type : null,
    location: clip(body.location, 200),
    budget: clip(body.budget, 100),
    price: clip(body.price, 100),
    area: clip(body.area, 20),
    relation: ['owner', 'broker', 'other'].includes(body.relation) ? body.relation : null,
    contact_pref: body.contact_pref === 'call' ? 'call' : 'whatsapp',
    // via=whatsapp: الزبون فتح واتساب برسالة جاهزة؛ لا يعني ذلك أنه ضغط «إرسال»
    ...(viaWa ? { via: 'whatsapp' } : {}),
    ...(listing ? { listing } : {}),
  };
  const id = uid();
  const t = now();
  db().prepare(`INSERT INTO inbox (id, source, kind, name, phone, phone_norm, property_ref, payload, message, status, client_token, created_at, updated_at, fv) VALUES (?, 'site', ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, '{}')`)
    .run(id, kind, clip(body.name, 120), phone, normalizePhone(phone), propertyRef, JSON.stringify(payload), clip(body.message, 2000), token, t, t);
  let photosFailed = 0;
  if (kind === 'offer') {
    for (const f of files.slice(0, 6)) {
      try { await storeUpload({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname, kind: 'photo', owner_type: 'inbox', owner_id: id }, null); }
      catch { photosFailed++; }
    }
  }
  return { ok: true, duplicate: false, receipt: receiptOf(id), photosFailed };
}

const receiptOf = (id) => id.replace(/-/g, '').slice(0, 8).toUpperCase();
