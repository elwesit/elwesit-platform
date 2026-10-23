import React, { useMemo, useState, useEffect } from 'react';
import { useStore, storeSnapshot, update, create, getRow } from '../data.js';
import { computeToday } from '@shared/today.js';
import { KindTag, Btn, Icon, Empty, LinkBtn } from '../ui.jsx';
import { Postpone, ContactActions, TaskSheet } from '../components.jsx';
import { fmtTime, relDay, fmtDateLong, formatAmountWords, CURRENCIES } from '../fmt.js';
import { href, go } from '../router.js';
import { ApptOutcomeSheet } from './Appointments.jsx';

export default function Today() {
  const s = useStore();
  const staleDays = s.settings?.stale_days || 30;
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  const { items, kpis } = useMemo(() => computeToday(storeSnapshot(), { staleDays, now: new Date() }), [s.server, s.outbox, staleDays, tick]);
  const [outcome, setOutcome] = useState(null);
  const [nextFor, setNextFor] = useState(null);
  useReminders(items);

  const dismiss = (key, days) => create('dismissals', { item_key: key, until_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null });

  const overdue = items.filter((i) => i.overdue);
  const rest = items.filter((i) => !i.overdue);
  const due = Object.entries(kpis.commissionsDue || {});
  return <div className="page today">
    <div className="page-head">
      <div><h1>ما يحتاج إلى تصرف اليوم</h1><p className="muted">{fmtDateLong(new Date().toISOString())}</p></div>
      <Btn kind="primary" icon="plus" onClick={() => go('capture')}>إضافة سريعة</Btn>
    </div>
    <div className="kpis">
      <a className={`kpi${kpis.overdue ? ' bad' : ''}`} href={href('appointments?tab=tasks')}><b>{kpis.overdue}</b><span>متابعات متأخرة</span></a>
      <a className="kpi" href={href('properties?sort=new')}><b>{kpis.recentOffers}</b><span>عروض هذا الأسبوع</span></a>
      <a className="kpi" href={href('requests')}><b>{kpis.activeRequests}</b><span>طلبات جارية</span></a>
      <a className="kpi" href={href('deals')}><b>{kpis.openDeals}</b><span>فرص جارية</span></a>
      <a className="kpi" href={href('deals?tab=commissions')}><b>{due.length ? due.map(([c, v]) => `${formatAmountWords(v)} ${c === 'unknown' ? '' : CURRENCIES[c].short}`).join(' + ') : '0'}</b><span>عمولات مستحقة</span></a>
    </div>
    {!items.length && <Empty title="لا شيء عاجل الآن">سجّل ما يصلك من طلبات وعروض، وستظهر هنا المتابعات والمطابقات الجديدة.</Empty>}
    {overdue.length > 0 && <><h2 className="group-title late">متأخر ({overdue.length})</h2><ItemList items={overdue} {...{ dismiss, setOutcome, setNextFor }} /></>}
    {rest.length > 0 && <><h2 className="group-title">اليوم والجديد ({rest.length})</h2><ItemList items={rest} {...{ dismiss, setOutcome, setNextFor }} /></>}
    {outcome && <ApptOutcomeSheet appt={getRow('appointments', outcome)} onClose={() => setOutcome(null)} />}
    {nextFor && <TaskSheet task={{ title: 'متابعة', due_at: new Date(Date.now() + 86400000).toISOString(), due_has_time: 1 }} link={nextFor} onClose={() => setNextFor(null)} />}
  </div>;
}

function ItemList({ items, dismiss, setOutcome, setNextFor }) {
  return <ul className="today-list">{items.map((it) => <li key={it.key} className={`today-item${it.overdue ? ' overdue' : ''}`}>
    <div className="ti-main">
      <KindTag kind={it.kind} />
      <div className="ti-text">
        <a className="ti-title" href={itemHref(it)}>{it.title}</a>
        <small className="ti-why"><Icon name="alert" size={12} /> {it.why}{it.at && (it.kind === 'task' || it.kind === 'appointment') ? ` · ${relDay(it.at)} ${fmtTime(it.at)}` : ''}{it.amount ? ` · ${formatAmountWords(it.amount)} ${CURRENCIES[it.currency]?.label || ''}` : ''}</small>
      </div>
    </div>
    <div className="ti-actions"><Actions it={it} {...{ dismiss, setOutcome, setNextFor }} /></div>
  </li>)}</ul>;
}

function itemHref(it) {
  const r = it.ref;
  if (it.kind === 'inbox') return href('inbox/' + r.inbox_id);
  if (it.kind === 'appointment') return href('appointments/' + r.appointment_id);
  if (it.kind === 'match' || it.kind === 'request') return href('requests/' + r.request_id + (it.kind === 'match' ? '?tab=matches' : ''));
  if (it.kind === 'stale') return r.property_id ? href('properties/' + r.property_id) : href('properties?filter=stale');
  if (it.kind === 'commission' || it.kind === 'deal') return href('deals/' + r.deal_id);
  if (it.kind === 'task') return r.person_id ? href('people/' + r.person_id) : r.request_id ? href('requests/' + r.request_id) : r.property_id ? href('properties/' + r.property_id) : r.deal_id ? href('deals/' + r.deal_id) : href('appointments?tab=tasks');
  return href('today');
}

function Actions({ it, dismiss, setOutcome, setNextFor }) {
  const r = it.ref;
  if (it.kind === 'task') {
    const t = getRow('tasks', r.task_id);
    return <>
      {r.person_id && <ContactActions personId={r.person_id} compact link={{ request_id: r.request_id || undefined, deal_id: r.deal_id || undefined }} />}
      <Btn small icon="check" onClick={() => update('tasks', r.task_id, { done_at: new Date().toISOString() })}>تم</Btn>
      {t && <Postpone task={t} />}
    </>;
  }
  if (it.kind === 'appointment') return <>{r.person_id && <ContactActions personId={r.person_id} compact />}<Btn small kind="primary" onClick={() => setOutcome(r.appointment_id)}>سجّل النتيجة</Btn></>;
  if (it.kind === 'inbox') return <LinkBtn small kind="primary" href={href('inbox/' + r.inbox_id)}>عالج</LinkBtn>;
  if (it.kind === 'request') return <>{r.person_id && <ContactActions personId={r.person_id} compact link={{ request_id: r.request_id }} />}<Btn small onClick={() => setNextFor({ request_id: r.request_id, person_id: r.person_id })}>الخطوة التالية</Btn></>;
  if (it.kind === 'match') return <><LinkBtn small kind="primary" href={href('requests/' + r.request_id + '?tab=matches')}>راجع المطابقات</LinkBtn><Btn small kind="ghost" onClick={() => dismiss(it.key)}>إخفاء</Btn></>;
  if (it.kind === 'stale') {
    if (!r.property_id) return <LinkBtn small href={href('properties?filter=stale')}>اعرضها</LinkBtn>;
    return <><Btn small icon="check" onClick={() => update('properties', r.property_id, { verified_at: new Date().toISOString(), availability: 'available' })}>تحققت: متوفر</Btn><Btn small onClick={() => update('properties', r.property_id, { availability: 'withdrawn', verified_at: new Date().toISOString() })}>لم يعد متوفراً</Btn><Btn small kind="ghost" onClick={() => dismiss(it.key, 7)}>ذكّرني بعد أسبوع</Btn></>;
  }
  if (it.kind === 'commission') return <LinkBtn small kind="primary" href={href('deals/' + r.deal_id)}>سجّل دفعة</LinkBtn>;
  if (it.kind === 'deal') return <><Btn small kind="primary" onClick={() => setNextFor({ deal_id: r.deal_id, person_id: r.person_id })}>حدد الخطوة التالية</Btn><Btn small kind="ghost" onClick={() => dismiss(it.key)}>إخفاء</Btn></>;
  return null;
}

// تذكير داخل التطبيق + إشعار المتصفح (إن سمحت) للمواعيد والمتابعات القريبة ما دام التطبيق مفتوحاً
const notified = new Set();
function useReminders(items) {
  useEffect(() => {
    const now = Date.now();
    for (const it of items) {
      if (!['appointment', 'task'].includes(it.kind) || !it.at) continue;
      const t = Date.parse(it.at);
      const lead = it.kind === 'appointment' ? (getRow('appointments', it.ref.appointment_id)?.remind_min ?? 60) * 60000 : 0;
      if (t - lead <= now && t + 30 * 60000 > now && !notified.has(it.key)) {
        notified.add(it.key);
        if ('Notification' in window && Notification.permission === 'granted') {
          navigator.serviceWorker?.ready.then((reg) => reg.showNotification(it.kind === 'appointment' ? 'موعد قريب' : 'متابعة الآن', { body: it.title, tag: it.key, lang: 'ar', dir: 'rtl' })).catch(() => {});
        }
      }
    }
  }, [items]);
}
