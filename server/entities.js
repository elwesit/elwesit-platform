// طبقة موحدة للسجلات: إنشاء بمعرّف من العميل (آمن لإعادة المحاولة)، وتعديل بنسخة أساس
// يدمج التعديلات على حقول مختلفة ويرفض الكتابة فوق حقل عدّله جهاز آخر (409 مع السجل الحالي).

import { db, now, uid, nextRef, audit } from './db.js';
import { normalizePhone } from '../shared/phone.js';
import { normLot } from '../shared/text.js';

const J = 'json', S = 'str', N = 'num', I = 'int', B = 'bool', T = 'time';

export const ENTITIES = {
  areas: { fields: { name: S, aliases: J, wilaya_code: S, moughataa_code: S, kind: S, lat: N, lng: N, notes: S } },
  people: { fields: { name: S, name_alt: S, roles: J, priority: S, source: S, notes: S } },
  phones: { fields: { person_id: S, raw: S, label: S, whatsapp: B }, derive: (r) => ({ normalized: normalizePhone(r.raw) }) },
  properties: {
    ref: ['property', 'W'],
    fields: {
      deal: S, type: S, title: S, description: S, wilaya_code: S, moughataa_code: S, area_id: S, area_text: S, landmark: S, location_desc: S,
      lat: N, lng: N, location_method: S, location_precision: S, plan: S, sector: S, lot_number: S, area_m2: N, frontage: S,
      bedrooms: I, bathrooms: I, floors: I, features: J, owner_person_id: S,
      price_raw: S, price_amount: N, price_currency: S, price_basis: S, price_confirmed: B, price_negotiable: B, price_terms: S,
      availability: S, verified_at: T, internal_notes: S,
      pub_title: S, pub_description: S, pub_show_price: B, pub_show_lot: B, pub_show_plan: B, pub_show_landmark: B, pub_location: S, pub_show_boundary: B, pub_photo_ids: J,
    },
    derive: (r) => ({ lot_norm: normLot(r.lot_number) }),
  },
  property_sources: { fields: { property_id: S, person_id: S, relation: S, channel: S, price_raw: S, price_amount: N, price_currency: S, price_basis: S, commission_terms: S, conditions: S, verified_at: T, notes: S } },
  geometries: { fields: { property_id: S, plan: S, sector: S, lot_number: S, geojson: S, method: S, source_name: S, source_license: S, source_date: S, verified: B, area_m2: N }, derive: (r) => ({ lot_norm: normLot(r.lot_number) }) },
  requests: {
    ref: ['request', 'D'],
    fields: { person_id: S, deal: S, types: J, locations: J, budget_raw: S, budget_min: N, budget_max: N, budget_currency: S, budget_basis: S, budget_confirmed: B, area_min: N, area_max: N, bedrooms_min: I, specs: S, flexibility: S, priority: S, source: S, status: S, notes: S },
  },
  sent_offers: { fields: { request_id: S, person_id: S, property_id: S, sent_at: T, channel: S, response: S, notes: S } },
  activities: { fields: { kind: S, body: S, person_id: S, property_id: S, request_id: S, deal_id: S, occurred_at: T } },
  tasks: { fields: { title: S, due_at: T, due_has_time: B, person_id: S, property_id: S, request_id: S, deal_id: S, done_at: T, notes: S } },
  appointments: { fields: { kind: S, starts_at: T, duration_min: I, place: S, person_id: S, property_id: S, request_id: S, deal_id: S, parties: S, status: S, outcome: S, notes: S, remind_min: I } },
  deals: { fields: { title: S, request_id: S, property_id: S, client_person_id: S, owner_person_id: S, stage: S, lost_reason: S, agreed_raw: S, agreed_amount: N, agreed_currency: S, closed_at: T, notes: S } },
  commissions: { fields: { deal_id: S, party_person_id: S, basis: S, percent: N, base_amount: N, amount: N, currency: S, agreement: S, due_at: T, shares: J, notes: S } },
  commission_payments: { fields: { commission_id: S, amount: N, paid_at: T, method: S, notes: S } },
  files: { fields: { sort: I, is_cover: B, caption: S, name: S }, noCreate: true },
  inbox: { fields: { status: S, converted: J, name: S, phone: S, message: S }, noCreate: true, derive: (r) => ({ phone_norm: normalizePhone(r.phone) }) },
  captures: { fields: { raw_text: S, method: S, parsed: J, result: J, status: S } },
  templates: { fields: { kind: S, title: S, body: S, sort: I } },
  dismissals: { fields: { item_key: S, until_at: T } },
};

export const SYNC_TABLES = Object.keys(ENTITIES);

export class HttpError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}

function coerce(type, v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return type === S ? (v === '' ? '' : null) : type === J ? (v === '' ? null : v) : null;
  switch (type) {
    case S: return String(v).slice(0, 20000);
    case N: { const n = Number(v); if (!Number.isFinite(n)) throw new HttpError(400, 'قيمة رقمية غير صالحة'); return n; }
    case I: { const n = Number(v); if (!Number.isFinite(n)) throw new HttpError(400, 'قيمة رقمية غير صالحة'); return Math.round(n); }
    case B: return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
    case T: { const d = new Date(v); if (Number.isNaN(+d)) throw new HttpError(400, 'تاريخ غير صالح'); return d.toISOString(); }
    case J: return JSON.stringify(v);
  }
}

// حقول نصية في المخطط ليست NULL؛ نحوّل null إلى '' لها
const NOT_NULL_TEXT = new Set(['name', 'name_alt', 'source', 'notes', 'raw', 'label', 'title', 'description', 'area_text', 'landmark', 'location_desc', 'plan', 'sector', 'lot_number', 'frontage', 'price_raw', 'price_terms', 'internal_notes', 'pub_title', 'pub_description', 'channel', 'commission_terms', 'conditions', 'budget_raw', 'specs', 'flexibility', 'body', 'place', 'parties', 'outcome', 'lost_reason', 'agreed_raw', 'agreement', 'method', 'caption', 'message', 'phone', 'raw_text', 'source_name', 'source_license']);

function clean(entity, data, { partial }) {
  const def = ENTITIES[entity];
  const out = {};
  for (const [k, type] of Object.entries(def.fields)) {
    if (!(k in data)) continue;
    let v = coerce(type, data[k]);
    if (v === null && NOT_NULL_TEXT.has(k)) v = '';
    if (v !== undefined) out[k] = v;
  }
  if (!partial) return out;
  return out;
}

export function parseRow(entity, row) {
  if (!row) return row;
  const def = ENTITIES[entity];
  const r = { ...row };
  for (const [k, type] of Object.entries(def.fields)) if (type === J && typeof r[k] === 'string') { try { r[k] = JSON.parse(r[k]); } catch { r[k] = null; } }
  for (const k of ['converted', 'payload', 'parsed', 'result']) if (typeof r[k] === 'string') { try { r[k] = JSON.parse(r[k]); } catch {} }
  if (typeof r.fv === 'string') { try { r.fv = JSON.parse(r.fv); } catch { r.fv = {}; } }
  return r;
}

export function getRow(entity, id) {
  if (!ENTITIES[entity]) throw new HttpError(404, 'غير موجود');
  return parseRow(entity, db().prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id));
}

export function createRow(entity, data, user, extra = {}) {
  const def = ENTITIES[entity];
  if (!def || def.noCreate && !extra.__internal) throw new HttpError(404, 'غير موجود');
  const id = typeof data.id === 'string' && /^[0-9a-f-]{36}$/i.test(data.id) ? data.id : uid();
  const existing = db().prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id);
  if (existing) return { row: parseRow(entity, existing), existed: true };
  const vals = { ...clean(entity, data, { partial: false }), ...extra };
  delete vals.__internal;
  if (def.derive) Object.assign(vals, def.derive({ ...vals }));
  const t = now();
  vals.id = id; vals.created_at = t; vals.updated_at = t; vals.version = 1;
  vals.fv = JSON.stringify(Object.fromEntries(Object.keys(def.fields).filter((k) => k in vals).map((k) => [k, 1])));
  if (def.ref && !vals.ref) vals.ref = nextRef(...def.ref);
  const cols = Object.keys(vals);
  try {
    db().prepare(`INSERT INTO ${entity} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => vals[c]));
  } catch (e) { throw sqlError(e); }
  audit(user?.id, 'create', entity, id);
  return { row: getRow(entity, id), existed: false };
}

// patch: الحقول المعدلة فقط. baseVersion: النسخة التي بُني عليها التعديل.
export function updateRow(entity, id, patch, baseVersion, user, { force = false } = {}) {
  const def = ENTITIES[entity];
  if (!def) throw new HttpError(404, 'غير موجود');
  const d = db();
  return d.transaction(() => {
    const cur = d.prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id);
    if (!cur) throw new HttpError(404, 'السجل غير موجود');
    const vals = clean(entity, patch, { partial: true });
    // أرشفة/استعادة
    if ('archived' in patch) vals.archived_at = patch.archived ? now() : null;
    const fv = JSON.parse(cur.fv || '{}');
    if (baseVersion == null && !force) throw new HttpError(400, 'يلزم رقم النسخة');
    const conflicts = [];
    if (!force && baseVersion < cur.version) {
      for (const k of Object.keys(vals)) {
        const changedAt = fv[k] ?? (k === 'archived_at' ? fv.archived_at : undefined) ?? 0;
        // حقل عُدِّل بعد النسخة التي رآها المستخدم وبقيمة مختلفة عن قيمته الجديدة
        if (changedAt > baseVersion && cur[k] !== vals[k]) conflicts.push(k);
      }
    }
    if (conflicts.length) throw new HttpError(409, 'عُدِّل هذا السجل من جهاز آخر', { error: 'conflict', fields: conflicts, current: parseRow(entity, cur) });
    const changed = Object.keys(vals).filter((k) => cur[k] !== vals[k]);
    if (!changed.length) return { row: parseRow(entity, cur), changed: [] };
    const next = { ...cur, ...vals };
    if (def.derive) Object.assign(vals, def.derive(next));
    const version = cur.version + 1;
    for (const k of changed) fv[k] = version;
    vals.version = version; vals.updated_at = now(); vals.fv = JSON.stringify(fv);
    const cols = Object.keys(vals);
    try {
      d.prepare(`UPDATE ${entity} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => vals[c]), id);
    } catch (e) { throw sqlError(e); }
    audit(user?.id, 'update', entity, id, changed.join(','));
    return { row: parseRow(entity, d.prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id)), changed };
  })();
}

// تعديل داخلي (من الخادم نفسه) دون فحص النسخة، مع تحديث النسخة حتى تراه الأجهزة الأخرى
export function touchRow(entity, id, vals) {
  const cur = db().prepare(`SELECT version, fv FROM ${entity} WHERE id = ?`).get(id);
  if (!cur) return;
  const fv = JSON.parse(cur.fv || '{}');
  const version = cur.version + 1;
  for (const k of Object.keys(vals)) fv[k] = version;
  const all = { ...vals, version, updated_at: now(), fv: JSON.stringify(fv) };
  const cols = Object.keys(all);
  db().prepare(`UPDATE ${entity} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => all[c]), id);
}

function sqlError(e) {
  if (/CHECK constraint/.test(e.message)) return new HttpError(400, 'قيمة غير مقبولة في أحد الحقول');
  if (/UNIQUE constraint/.test(e.message)) return new HttpError(409, 'قيمة مكررة');
  if (/FOREIGN KEY/.test(e.message)) return new HttpError(400, 'ارتباط بسجل غير موجود');
  return e;
}

export function syncSince(since) {
  const out = {};
  for (const t of SYNC_TABLES) {
    const rows = since
      ? db().prepare(`SELECT * FROM ${t} WHERE updated_at >= ?`).all(since)
      : db().prepare(`SELECT * FROM ${t}`).all();
    out[t] = rows.map((r) => parseRow(t, r));
  }
  if (out.files) out.files = out.files.map(({ storage_key, ...f }) => f);
  return out;
}
