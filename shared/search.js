// بحث موحد: الاسم، الهاتف، المنطقة، رقم القطعة، المرجع، والكلمات في الملاحظات.
import { TYPES, DEALS_PUBLIC } from './vocab.js';
import { norm, normTight, normLot, toLatinDigits } from './text.js';
import { searchPlanLots, parseLotQuery, planLabel } from './plans.js';

const live = (r) => !r.archived_at;

export function searchStore(store, q, { includeArchived = false, limit = 60 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  const nq = norm(query);
  const words = nq.split(' ').filter(Boolean);
  const digits = toLatinDigits(query).replace(/\D/g, '');
  const lot = normLot(query);
  // «57 المنارة»: رقم القطعة مع اسم المخطط أو المنطقة
  const pq = parseLotQuery(query);
  const lotPart = pq.lot && pq.rest ? normLot(pq.lot) : null;
  const restWords = norm(pq.rest).split(' ').filter(Boolean);
  const ok = (r) => includeArchived || live(r);
  const geoName = (code) => store.moughataas?.find((m) => m.code === code)?.name_ar || store.wilayas?.find((w) => w.code === code)?.name_ar || '';
  const areaName = (id) => store.areas?.find((a) => a.id === id)?.name || '';
  const textHit = (...fields) => {
    const hay = norm(fields.filter(Boolean).join(' '));
    const tight = hay.replace(/\s+/g, '');
    return words.every((w) => hay.includes(w) || tight.includes(w));
  };
  const out = [];
  const phonesBy = new Map();
  for (const ph of store.phones || []) if (live(ph)) { if (!phonesBy.has(ph.person_id)) phonesBy.set(ph.person_id, []); phonesBy.get(ph.person_id).push(ph); }

  for (const p of (store.people || []).filter(ok)) {
    if (p.merged_into) continue;
    const phs = phonesBy.get(p.id) || [];
    const phoneHit = digits.length >= 4 && phs.some((x) => x.normalized.includes(digits));
    if (phoneHit || textHit(p.name, p.name_alt, p.notes, p.source)) out.push({ type: 'person', id: p.id, title: p.name || 'بدون اسم', sub: phs.map((x) => x.raw).join(' · '), why: phoneHit ? 'الهاتف' : 'الاسم/الملاحظات', archived: !!p.archived_at, rank: phoneHit ? 0 : 1 });
  }
  for (const p of (store.properties || []).filter(ok)) {
    const lotHit = lot.length >= 1 && p.lot_norm && (p.lot_norm === lot || (lot.length >= 3 && p.lot_norm.includes(lot)));
    const lotNameHit = !!lotPart && p.lot_norm === lotPart && (() => { const hay = norm([p.plan, p.sector, p.area_text, areaName(p.area_id), geoName(p.moughataa_code), p.landmark].filter(Boolean).join(' ')); return restWords.every((w) => hay.includes(w) || hay.replace(/\s+/g, '').includes(w)); })();
    const refHit = normTight(p.ref) === normTight(query);
    const srcNotes = (store.property_sources || []).filter((s) => s.property_id === p.id && live(s)).map((s) => s.notes + ' ' + s.conditions + ' ' + s.commission_terms).join(' ');
    if (lotHit || lotNameHit || refHit || textHit(p.ref, p.title, p.description, p.area_text, areaName(p.area_id), p.landmark, p.location_desc, p.plan, p.sector, p.internal_notes, geoName(p.moughataa_code), geoName(p.wilaya_code), srcNotes)) {
      out.push({ type: 'property', id: p.id, title: `${p.ref} ${p.title || [TYPES[p.type], p.deal && DEALS_PUBLIC[p.deal]].filter(Boolean).join(' ')}`.trim(), sub: [areaName(p.area_id) || p.area_text, geoName(p.moughataa_code), p.lot_number ? 'قطعة ' + p.lot_number : ''].filter(Boolean).join(' · '), why: refHit ? 'المرجع' : lotHit || lotNameHit ? 'رقم القطعة' : 'النص', archived: !!p.archived_at, rank: refHit || lotHit || lotNameHit ? 0 : 2 });
    }
  }
  // القطع في مخططات التجزئة المضافة
  if (pq.lot && store.plans?.length) {
    const r = searchPlanLots(store.plans, query, { moughataas: store.moughataas || [] });
    if (!r.unmatched) r.hits.slice(0, 8).forEach((h, i) => out.push({ type: 'planlot', id: `${h.plan.id}:${h.lot}:${i}`, title: `قطعة ${h.lot} · ${planLabel(h.plan)}`, sub: [geoName(h.plan.moughataa_code), h.shape ? `${h.shape.area} م²` : '', h.status_label].filter(Boolean).join(' · '), why: 'مخطط التجزئة', rank: 1 }));
  }
  for (const g of (store.geometries || []).filter(ok)) {
    if (lot && g.lot_norm === lot && !g.property_id) out.push({ type: 'geometry', id: g.id, title: `قطعة ${g.lot_number} (${g.plan || 'بدون مخطط'})`, sub: `حدود ${g.method === 'imported' ? 'مستوردة من ' + g.source_name : 'مرسومة يدوياً'}`, why: 'رقم القطعة', rank: 1 });
  }
  for (const r of (store.requests || []).filter(ok)) {
    const person = store.people?.find((x) => x.id === r.person_id);
    const locs = (r.locations || []).map((l) => l.text || geoName(l.moughataa_code) || geoName(l.wilaya_code)).join(' ');
    if (normTight(r.ref) === normTight(query) || textHit(r.ref, r.specs, r.notes, r.flexibility, r.budget_raw, locs, person?.name)) out.push({ type: 'request', id: r.id, title: `طلب ${r.ref}${person ? ' — ' + person.name : ''}`, sub: locs, why: 'الطلب', archived: !!r.archived_at, rank: 2 });
  }
  for (const d of (store.deals || []).filter(ok)) if (textHit(d.title, d.notes, d.lost_reason)) out.push({ type: 'deal', id: d.id, title: d.title || 'فرصة', sub: '', why: 'الصفقة', rank: 3 });
  for (const a of (store.activities || []).filter(ok)) if (words.length && textHit(a.body)) out.push({ type: 'activity', id: a.id, title: a.body.slice(0, 80), sub: 'سجل التواصل', why: 'ملاحظة', ref: a, rank: 4 });
  for (const m of (store.inbox || []).filter(ok)) {
    const phoneHit = digits.length >= 4 && (m.phone_norm || '').includes(digits);
    if (phoneHit || textHit(m.name, m.message, m.property_ref)) out.push({ type: 'inbox', id: m.id, title: `وارد: ${m.name || m.phone}`, sub: m.message?.slice(0, 60), why: phoneHit ? 'الهاتف' : 'النص', rank: 3 });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

// تنبيهات التكرار — لا دمج آلي
export function personDuplicates(store, { name, phone, excludeId }) {
  const res = [];
  const digits = toLatinDigits(phone || '').replace(/\D/g, '').slice(-8);
  for (const p of store.people || []) {
    if (p.id === excludeId || p.archived_at || p.merged_into) continue;
    const phs = (store.phones || []).filter((x) => x.person_id === p.id && !x.archived_at);
    if (digits.length === 8 && phs.some((x) => x.normalized.endsWith(digits))) { res.push({ id: p.id, name: p.name, reason: 'نفس رقم الهاتف', strong: true }); continue; }
    if (name && normTight(name).length >= 3 && normTight(p.name) === normTight(name)) res.push({ id: p.id, name: p.name, reason: 'نفس الاسم', strong: false });
  }
  return res;
}

export function propertyDuplicates(store, { lot_number, plan, sector, moughataa_code, lat, lng, type, excludeId }) {
  const res = [];
  const ln = normLot(lot_number);
  for (const p of store.properties || []) {
    if (p.id === excludeId || p.archived_at) continue;
    if (ln && p.lot_norm === ln) {
      const samePlan = plan && p.plan && normTight(plan) === normTight(p.plan);
      const sameArea = moughataa_code && p.moughataa_code === moughataa_code;
      const sameSector = !sector || !p.sector || normTight(sector) === normTight(p.sector);
      if ((samePlan || sameArea || (!plan && !moughataa_code)) && sameSector) res.push({ id: p.id, ref: p.ref, reason: samePlan ? 'نفس رقم القطعة في المخطط نفسه' : 'نفس رقم القطعة في المنطقة نفسها', strong: !!samePlan });
      continue;
    }
    if (lat != null && lng != null && p.lat != null && p.lng != null && (!type || p.type === type)) {
      const d = haversine(lat, lng, p.lat, p.lng);
      if (d < 35) res.push({ id: p.id, ref: p.ref, reason: `موقع قريب جداً (${Math.round(d)} م)`, strong: false });
    }
  }
  return res;
}

export function haversine(a1, o1, a2, o2) {
  const R = 6371000, r = Math.PI / 180;
  const dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
