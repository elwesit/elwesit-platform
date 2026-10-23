// «ما الذي يحتاج إلى تصرف مني اليوم؟» — يُحسب من البيانات نفسها على الخادم وعلى الجهاز (بلا شبكة).

import { matchRequestProperty } from './matching.js';
import { TZ } from './vocab.js';

const DAY = 86400000;
const live = (r) => !r.archived_at;

// بداية ونهاية اليوم بتوقيت نواكشوط (UTC+0)
export function dayBounds(now = new Date()) {
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start: s, end: new Date(+s + DAY) };
}

export function personName(store, id) {
  const p = id && store.people?.find((x) => x.id === id);
  return p ? (p.name || 'بدون اسم') : '';
}

export function computeToday(store, { now = new Date(), staleDays = 30, labels = {} } = {}) {
  const { start, end } = dayBounds(now);
  const items = [];
  const dismissed = new Map((store.dismissals || []).filter(live).map((d) => [d.item_key, d.until_at]));
  const isDismissed = (key) => dismissed.has(key) && (!dismissed.get(key) || dismissed.get(key) > now.toISOString());
  const openTasks = (store.tasks || []).filter((t) => live(t) && !t.done_at);
  const hasOpenTask = (field, id) => openTasks.some((t) => t[field] === id);

  // 1) المواعيد
  for (const a of (store.appointments || []).filter(live)) {
    if (a.status !== 'planned') continue;
    const t = new Date(a.starts_at);
    if (t >= start && t < end) items.push({ key: 'appt:' + a.id, kind: 'appointment', at: a.starts_at, title: apptTitle(store, a), why: 'موعد اليوم', overdue: false, ref: { appointment_id: a.id, person_id: a.person_id, property_id: a.property_id } });
    else if (t < start) items.push({ key: 'appt:' + a.id, kind: 'appointment', at: a.starts_at, title: apptTitle(store, a), why: 'موعد مضى ولم تُسجَّل نتيجته', overdue: true, ref: { appointment_id: a.id, person_id: a.person_id, property_id: a.property_id } });
  }
  // 2) المهام والمتابعات
  for (const t of openTasks) {
    if (!t.due_at) continue;
    const d = new Date(t.due_at);
    if (d < end) items.push({ key: 'task:' + t.id, kind: 'task', at: t.due_at, title: t.title, why: d < start ? 'متابعة متأخرة' : 'متابعة اليوم', overdue: d < (t.due_has_time ? now : start), ref: { task_id: t.id, person_id: t.person_id, request_id: t.request_id, property_id: t.property_id, deal_id: t.deal_id } });
  }
  // 3) الوارد الجديد
  for (const m of (store.inbox || []).filter(live)) {
    if (m.status !== 'new' && m.status !== 'seen') continue;
    items.push({ key: 'inbox:' + m.id, kind: 'inbox', at: m.created_at, title: `${inboxLabel(m.kind)}: ${m.name || m.phone || 'زائر'}`, why: 'وصل من ' + (m.source === 'site' ? 'الموقع' : m.source === 'whatsapp' ? 'واتساب' : 'الوارد') + ' ولم يُعالج', overdue: +now - +new Date(m.created_at) > DAY, ref: { inbox_id: m.id } });
  }
  // 4) طلبات جديدة لم تُعالج
  const reqs = (store.requests || []).filter(live);
  for (const r of reqs) {
    if (r.status !== 'new') continue;
    if (hasOpenTask('request_id', r.id)) continue;
    const touched = (store.activities || []).some((a) => live(a) && a.request_id === r.id);
    if (touched) continue;
    items.push({ key: 'req:' + r.id, kind: 'request', at: r.created_at, title: `طلب ${r.ref}${r.person_id ? ' — ' + personName(store, r.person_id) : ''}`, why: 'طلب جديد لم تحدد له خطوة تالية', overdue: +now - +new Date(r.created_at) > 2 * DAY, ref: { request_id: r.id, person_id: r.person_id } });
  }
  // 5) مطابقات مهمة جديدة: عروض أُضيفت أو تُحقِّق منها حديثاً ولم تُرسل للعميل
  const recentCut = new Date(+now - 14 * DAY).toISOString();
  const props = (store.properties || []).filter(live);
  const sent = new Set((store.sent_offers || []).filter(live).map((s) => s.request_id + ':' + s.property_id));
  for (const r of reqs) {
    if (!['new', 'active'].includes(r.status)) continue;
    const hits = [];
    for (const p of props) {
      if (!(p.created_at >= recentCut || (p.verified_at && p.verified_at >= recentCut))) continue;
      if (sent.has(r.id + ':' + p.id)) continue;
      if (isDismissed(`match:${r.id}:${p.id}`)) continue;
      const m = matchRequestProperty(r, p, { now, staleDays, labels });
      if (m && m.level !== 'weak') hits.push({ p, m });
    }
    if (hits.length) {
      const strong = hits.filter((h) => h.m.level === 'strong').length;
      items.push({ key: 'match:' + r.id + ':' + hits.map((h) => h.p.id).sort().join(','), kind: 'match', at: hits[0].p.updated_at, title: `${hits.length === 1 ? 'عرض جديد يناسب' : hits.length + ' عروض جديدة تناسب'} طلب ${personName(store, r.person_id) || r.ref}`, why: strong ? `${strong} منها مطابقة قوية` : 'مطابقة جزئية — راجع الاختلافات', overdue: false, ref: { request_id: r.id, person_id: r.person_id, property_ids: hits.map((h) => h.p.id) } });
    }
  }
  // 6) عروض طال عدم التحقق منها
  const staleCut = new Date(+now - staleDays * DAY).toISOString();
  const stale = props.filter((p) => ['available', 'unknown', 'reserved'].includes(p.availability) && (!p.verified_at || p.verified_at < staleCut));
  const stalePublished = stale.filter((p) => p.published);
  for (const p of stalePublished) {
    if (isDismissed('stale:' + p.id + ':' + (p.verified_at || ''))) continue;
    items.push({ key: 'stale:' + p.id + ':' + (p.verified_at || ''), kind: 'stale', at: p.verified_at || p.created_at, title: `تحقق من توفر ${p.ref}${p.title ? ' — ' + p.title : ''}`, why: p.verified_at ? `منشور وآخر تحقق منذ ${Math.floor((+now - +new Date(p.verified_at)) / DAY)} يوماً` : 'منشور ولم يُسجَّل أي تحقق', overdue: false, ref: { property_id: p.id } });
  }
  const staleOther = stale.length - stalePublished.length;
  if (staleOther > 0 && !isDismissed('stale-other:' + start.toISOString().slice(0, 10))) items.push({ key: 'stale-other:' + start.toISOString().slice(0, 10), kind: 'stale', at: now.toISOString(), title: `${staleOther} عرضاً غير منشور يحتاج تحققاً`, why: `لم يُتحقق منها منذ أكثر من ${staleDays} يوماً`, overdue: false, ref: { filter: 'stale' } });
  // 7) عمولات مستحقة
  for (const c of (store.commissions || []).filter(live)) {
    const paid = (store.commission_payments || []).filter((x) => live(x) && x.commission_id === c.id).reduce((s, x) => s + Number(x.amount || 0), 0);
    const remaining = (c.amount ?? 0) - paid;
    if (c.amount == null || remaining <= 0) continue;
    const deal = (store.deals || []).find((d) => d.id === c.deal_id);
    if (!deal || deal.stage !== 'won') continue;
    if (c.due_at && c.due_at >= end.toISOString()) continue;
    items.push({ key: 'comm:' + c.id + ':' + paid, kind: 'commission', at: c.due_at || deal.closed_at || c.created_at, title: `عمولة متبقية — ${deal.title || 'صفقة'}${c.party_person_id ? ' (' + personName(store, c.party_person_id) + ')' : ''}`, why: c.due_at ? 'حلّ موعد استحقاقها' : 'صفقة تمت والعمولة لم تُحصَّل كاملة', overdue: !!c.due_at && c.due_at < start.toISOString(), amount: remaining, currency: c.currency, ref: { deal_id: deal.id, commission_id: c.id } });
  }
  // 8) فرص جارية بلا خطوة تالية
  for (const d of (store.deals || []).filter(live)) {
    if (['won', 'lost'].includes(d.stage)) continue;
    if (hasOpenTask('deal_id', d.id)) continue;
    if ((store.appointments || []).some((a) => live(a) && a.deal_id === d.id && a.status === 'planned')) continue;
    if (isDismissed('deal-next:' + d.id + ':' + d.version)) continue;
    items.push({ key: 'deal-next:' + d.id + ':' + d.version, kind: 'deal', at: d.updated_at, title: `فرصة بلا خطوة تالية: ${d.title || personName(store, d.client_person_id) || 'فرصة'}`, why: 'حدد الخطوة التالية حتى لا تضيع', overdue: false, ref: { deal_id: d.id, person_id: d.client_person_id } });
  }
  const filtered = items.filter((i) => !isDismissed(i.key));
  filtered.sort((a, b) => (b.overdue - a.overdue) || String(a.at).localeCompare(String(b.at)));
  return { items: filtered, kpis: kpis(store, { now, staleDays, start }) };
}

function kpis(store, { now, start }) {
  const overdue = (store.tasks || []).filter((t) => live(t) && !t.done_at && t.due_at && new Date(t.due_at) < start).length;
  const weekAgo = new Date(+now - 7 * DAY).toISOString();
  const recentOffers = (store.properties || []).filter((p) => live(p) && p.created_at >= weekAgo).length;
  const openDeals = (store.deals || []).filter((d) => live(d) && !['won', 'lost'].includes(d.stage)).length;
  const due = {};
  for (const c of (store.commissions || []).filter(live)) {
    const deal = (store.deals || []).find((d) => d.id === c.deal_id);
    if (!deal || deal.stage !== 'won' || c.amount == null) continue;
    const paid = (store.commission_payments || []).filter((x) => live(x) && x.commission_id === c.id).reduce((s, x) => s + Number(x.amount || 0), 0);
    const rem = c.amount - paid;
    if (rem > 0) due[c.currency] = (due[c.currency] || 0) + rem;
  }
  const activeRequests = (store.requests || []).filter((r) => live(r) && ['new', 'active'].includes(r.status)).length;
  return { overdue, recentOffers, openDeals, commissionsDue: due, activeRequests };
}

function inboxLabel(k) { return { search: 'طلب بحث', offer: 'عرض عقار', interest: 'اهتمام بعقار', contact: 'استفسار', message: 'رسالة' }[k] || 'وارد'; }

function apptTitle(store, a) {
  const kind = { viewing: 'معاينة', meeting: 'لقاء', signing: 'توقيع', other: 'موعد' }[a.kind] || 'موعد';
  const p = a.property_id && store.properties?.find((x) => x.id === a.property_id);
  return [kind, personName(store, a.person_id) ? 'مع ' + personName(store, a.person_id) : '', p ? `(${p.ref})` : '', a.place ? '— ' + a.place : ''].filter(Boolean).join(' ');
}

export function fmtTime(iso, opts = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ar-MR-u-nu-latn', { timeZone: TZ, hour: '2-digit', minute: '2-digit', ...opts }).format(new Date(iso));
}
export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ar-MR-u-nu-latn', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', ...opts }).format(new Date(iso));
}
