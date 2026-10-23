import React, { useMemo, useState } from 'react';
import { useTable, useRow, create, update, archive, table } from '../data.js';
import { Btn, Field, Input, NumInput, Select, Seg, TextArea, Sheet, Section, Empty, KindTag, Pending, Icon, LinkBtn, useToast } from '../ui.jsx';
import { PersonPicker, ContactActions, Timeline, SplitLayout, Postpone, TaskSheet } from '../components.jsx';
import { APPT_KINDS, APPT_STATUS } from '@shared/vocab.js';
import { fmtDateTime, fmtDate, fmtTime, relDay, personLabel, propertyTitle, toLocalInput, fromLocalInput, icsFor, daysFrom } from '../fmt.js';
import { href, go, back } from '../router.js';

export default function Appointments({ route, wide }) {
  const id = route.parts[1];
  if (id === 'new') return <ApptForm preset={route.query} onDone={(nid) => go('appointments/' + nid)} />;
  if (id && route.parts[2] === 'edit') return <EditWrap id={id} />;
  return <SplitLayout wide={wide} hasDetail={!!id} list={<ApptList selected={id} tab={route.query.tab} />} detail={id && <ApptDetail id={id} />} />;
}
function EditWrap({ id }) { const a = useRow('appointments', id); return a ? <ApptForm initial={a} onDone={() => go('appointments/' + id)} /> : <Empty title="غير موجود" />; }

function ApptList({ selected, tab: tab0 }) {
  const appts = useTable('appointments');
  const tasks = useTable('tasks');
  const [tab, setTab] = useState(tab0 || 'upcoming');
  const [editTask, setEditTask] = useState(null);
  const now = new Date().toISOString();
  const list = useMemo(() => {
    const a = appts.filter((x) => !x.archived_at);
    if (tab === 'upcoming') return a.filter((x) => x.status === 'planned' && x.starts_at >= new Date(Date.now() - 3600000).toISOString()).sort((x, y) => x.starts_at.localeCompare(y.starts_at));
    if (tab === 'outcome') return a.filter((x) => x.status === 'planned' && x.starts_at < now).sort((x, y) => y.starts_at.localeCompare(x.starts_at));
    return a.filter((x) => x.status !== 'planned').sort((x, y) => y.starts_at.localeCompare(x.starts_at));
  }, [appts, tab]);
  const openTasks = tasks.filter((t) => !t.archived_at && !t.done_at).sort((a, b) => String(a.due_at || 'z').localeCompare(String(b.due_at || 'z')));
  let lastDay = '';
  return <div className="page list-page">
    <div className="page-head"><h1>المواعيد والمتابعات</h1><Btn kind="primary" icon="plus" onClick={() => go('appointments/new')}>موعد / معاينة</Btn></div>
    <Seg value={tab} onChange={setTab} options={[['upcoming', 'القادمة'], ['outcome', 'تحتاج نتيجة'], ['past', 'السابقة'], ['tasks', 'المتابعات']]} />
    {tab === 'tasks' ? <>
      <div className="row-actions"><Btn small icon="plus" onClick={() => setEditTask({ title: '', due_at: daysFrom(1, 10), due_has_time: 1 })}>متابعة</Btn></div>
      {!openTasks.length && <Empty title="لا توجد متابعات مفتوحة" />}
      <ul className="list">{openTasks.map((t) => <li key={t.id} className={`list-item static${t.due_at && t.due_at < now ? ' late-row' : ''}`}>
        <KindTag kind="task" small />
        <div className="li-body"><b>{t.title}</b> <Pending row={t} /><small className="muted block">{t.due_at ? `${relDay(t.due_at)} ${t.due_has_time ? fmtTime(t.due_at) : ''}` : 'بلا موعد'}{t.person_id ? ' · ' + personLabel(t.person_id) : ''}</small>
          <div className="row-actions"><Btn small icon="check" onClick={() => update('tasks', t.id, { done_at: new Date().toISOString() })}>تم</Btn><Postpone task={t} /><Btn small kind="ghost" icon="edit" onClick={() => setEditTask(t)} aria-label="تعديل" />{t.person_id && <LinkBtn small href={href('people/' + t.person_id)}>الشخص</LinkBtn>}</div>
        </div>
      </li>)}</ul>
      {editTask && <TaskSheet task={editTask} onClose={() => setEditTask(null)} />}
    </> : <>
      {!list.length && <Empty title="لا توجد مواعيد هنا" />}
      <ul className="list">{list.map((a) => { const day = fmtDate(a.starts_at); const head = day !== lastDay; lastDay = day; return <React.Fragment key={a.id}>
        {head && <li className="day-head">{relDay(a.starts_at)}</li>}
        <li><a className={`list-item${selected === a.id ? ' on' : ''}`} href={href('appointments/' + a.id)}>
          <KindTag kind="appointment" small />
          <div className="li-body"><div className="li-top"><b>{fmtTime(a.starts_at)}</b> {APPT_KINDS[a.kind]} {personLabel(a.person_id) && 'مع ' + personLabel(a.person_id)} <Pending row={a} /></div>
            <small className="muted block">{[a.place, a.property_id && table('properties').find((p) => p.id === a.property_id)?.ref].filter(Boolean).join(' · ')}</small>
            <span className="tag">{APPT_STATUS[a.status]}</span></div>
        </a></li></React.Fragment>; })}</ul>
    </>}
  </div>;
}

function ApptDetail({ id }) {
  const a = useRow('appointments', id);
  const [outcome, setOutcome] = useState(false);
  if (!a) return <Empty title="غير موجود" />;
  const p = a.property_id && table('properties').find((x) => x.id === a.property_id);
  const title = `${APPT_KINDS[a.kind]}${personLabel(a.person_id) ? ' مع ' + personLabel(a.person_id) : ''}${p ? ' — ' + p.ref : ''}`;
  return <div className="page detail">
    <div className="detail-head">
      <button className="icon-btn back-btn" onClick={() => back('appointments')} aria-label="رجوع"><Icon name="back" /></button>
      <div className="dh-title"><KindTag kind="appointment" small /><h1>{title}</h1><Pending row={a} /></div>
      <div className="dh-actions"><LinkBtn small icon="edit" href={href(`appointments/${id}/edit`)}>تعديل</LinkBtn><Btn small kind="ghost" icon="archive" onClick={() => archive('appointments', id, !a.archived_at)}>{a.archived_at ? 'استعادة' : 'حذف'}</Btn></div>
    </div>
    <div className="status-strip"><span className="tag">{APPT_STATUS[a.status]}</span><b>{fmtDateTime(a.starts_at)}</b> <small className="muted">(توقيت نواكشوط)</small></div>
    <Section title="التفاصيل">
      <dl className="info">
        {a.place && <div className="info-row"><dt>المكان</dt><dd>{a.place}</dd></div>}
        {a.person_id && <div className="info-row"><dt>العميل</dt><dd><a href={href('people/' + a.person_id)}>{personLabel(a.person_id)}</a></dd></div>}
        {p && <div className="info-row"><dt>العقار</dt><dd><a href={href('properties/' + p.id)}>{p.ref} {propertyTitle(p)}</a>{p.lat != null && <> · <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noopener">الاتجاهات</a></>}</dd></div>}
        {a.deal_id && <div className="info-row"><dt>الفرصة</dt><dd><a href={href('deals/' + a.deal_id)}>افتح</a></dd></div>}
        {a.parties && <div className="info-row"><dt>الأطراف</dt><dd>{a.parties}</dd></div>}
        {a.notes && <div className="info-row"><dt>ملاحظات</dt><dd>{a.notes}</dd></div>}
        {a.outcome && <div className="info-row"><dt>النتيجة</dt><dd className="pre">{a.outcome}</dd></div>}
      </dl>
      {a.person_id && <ContactActions personId={a.person_id} link={{ deal_id: a.deal_id || undefined }} waText={`السلام عليكم، تذكير بموعد ${APPT_KINDS[a.kind]} ${relDay(a.starts_at)} الساعة ${fmtTime(a.starts_at)}${a.place ? ' في ' + a.place : ''}.`} />}
      <div className="row-actions wrap">
        {a.status === 'planned' && <Btn kind="primary" onClick={() => setOutcome(true)}>سجّل النتيجة</Btn>}
        <a className="btn btn-default btn-sm" href={icsFor({ title, start: a.starts_at, minutes: a.duration_min, place: a.place, notes: a.notes, remind: a.remind_min })} download="maw3id.ics"><Icon name="calendar" size={16} /><span>أضف إلى تقويم الهاتف</span></a>
        <NotifyBtn />
      </div>
      <p className="hint">التذكير داخل التطبيق يظهر في «اليوم». لتذكير يعمل والتطبيق مغلق، أضف الموعد إلى تقويم الهاتف.</p>
    </Section>
    {outcome && <ApptOutcomeSheet appt={a} onClose={() => setOutcome(false)} />}
  </div>;
}

function NotifyBtn() {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  if (perm === 'unsupported') return null;
  if (perm === 'granted') return <small className="muted">إشعارات التطبيق مفعلة</small>;
  if (perm === 'denied') return <small className="muted">الإشعارات مرفوضة في المتصفح</small>;
  return <Btn small onClick={async () => setPerm(await Notification.requestPermission())}>فعّل إشعارات التطبيق</Btn>;
}

export function ApptOutcomeSheet({ appt, onClose }) {
  const [status, setStatus] = useState('done');
  const [outcome, setOutcome] = useState(appt?.outcome || '');
  const [next, setNext] = useState(false);
  const deals = useTable('deals');
  const toast = useToast();
  if (!appt) return null;
  const save = () => {
    update('appointments', appt.id, { status, outcome });
    create('activities', { kind: appt.kind === 'viewing' ? 'visit' : 'meeting', body: `${APPT_KINDS[appt.kind]}: ${APPT_STATUS[status]}${outcome ? ' — ' + outcome : ''}`, person_id: appt.person_id, property_id: appt.property_id, deal_id: appt.deal_id, request_id: appt.request_id, occurred_at: appt.starts_at });
    // تقدم الفرصة إلى «معاينة» عند إتمامها
    const d = appt.deal_id && deals.find((x) => x.id === appt.deal_id);
    if (d && status === 'done' && ['interest', 'contacted'].includes(d.stage)) update('deals', d.id, { stage: 'viewing' });
    toast('حُفظت النتيجة');
    setNext(true);
  };
  if (next) return <TaskSheet task={{ title: `متابعة بعد ${APPT_KINDS[appt.kind]}${appt.person_id ? ' مع ' + personLabel(appt.person_id) : ''}`, due_at: daysFrom(1, 10), due_has_time: 1 }} link={{ person_id: appt.person_id || undefined, deal_id: appt.deal_id || undefined, property_id: appt.property_id || undefined }} onClose={onClose} />;
  return <Sheet title="نتيجة الموعد" onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ</Btn></>}>
    <Field label="ماذا حدث؟"><Seg value={status} onChange={setStatus} options={[['done', 'تم'], ['postponed', 'تأجل'], ['no_show', 'لم يحضر'], ['cancelled', 'أُلغي']]} /></Field>
    <Field label="النتيجة / الانطباع"><TextArea value={outcome} onChange={setOutcome} rows={4} placeholder="أعجبه الموقع، يريد تخفيض السعر…" /></Field>
  </Sheet>;
}

function ApptForm({ initial, preset = {}, onDone }) {
  const [v, setV] = useState(() => initial ? { ...initial } : { kind: 'viewing', starts_at: daysFrom(1, 10), duration_min: 60, place: '', person_id: preset.person || null, property_id: preset.property || null, deal_id: preset.deal || null, request_id: preset.request || null, parties: '', status: 'planned', remind_min: 60, notes: '' });
  const props = useTable('properties').filter((p) => !p.archived_at);
  const set = (p) => setV((x) => ({ ...x, ...p }));
  const save = () => {
    const keys = ['kind', 'starts_at', 'duration_min', 'place', 'person_id', 'property_id', 'deal_id', 'request_id', 'parties', 'status', 'remind_min', 'notes'];
    const body = Object.fromEntries(keys.filter((k) => !initial || v[k] !== initial[k]).map((k) => [k, v[k]]));
    if (initial) { update('appointments', initial.id, body); onDone(initial.id); } else onDone(create('appointments', body));
  };
  const p = v.property_id && props.find((x) => x.id === v.property_id);
  return <div className="page form-page">
    <div className="page-head"><h1>{initial ? 'تعديل الموعد' : 'موعد / معاينة جديدة'}</h1></div>
    <Field label="النوع"><Seg value={v.kind} onChange={(x) => set({ kind: x })} options={Object.entries(APPT_KINDS)} /></Field>
    <div className="grid2">
      <Field label="التاريخ والوقت (توقيت نواكشوط)"><input type="datetime-local" value={toLocalInput(v.starts_at)} onChange={(e) => set({ starts_at: fromLocalInput(e.target.value) })} /></Field>
      <Field label="المدة (دقيقة)"><NumInput value={v.duration_min} onChange={(x) => set({ duration_min: x || 60 })} /></Field>
    </div>
    <PersonPicker value={v.person_id} onChange={(x) => set({ person_id: x })} label="العميل" />
    <Field label="العقار"><Select value={v.property_id} onChange={(x) => { const pp = props.find((q) => q.id === x); set({ property_id: x, place: v.place || (pp ? [pp.area_text, pp.landmark].filter(Boolean).join(' — ') : '') }); }} placeholder="—" options={props.map((q) => [q.id, `${q.ref} ${propertyTitle(q)}`])} /></Field>
    <Field label="المكان"><Input value={v.place} onChange={(x) => set({ place: x })} placeholder={p ? 'مكان العقار' : 'مكان اللقاء'} /></Field>
    <Field label="الأطراف الحاضرة"><Input value={v.parties} onChange={(x) => set({ parties: x })} placeholder="المالك، الوسيط الشريك…" /></Field>
    <Field label="التذكير قبل"><Select value={String(v.remind_min)} onChange={(x) => set({ remind_min: Number(x) })} options={[['15', '15 دقيقة'], ['30', '30 دقيقة'], ['60', 'ساعة'], ['120', 'ساعتين'], ['1440', 'يوم']]} /></Field>
    <Field label="ملاحظات"><TextArea value={v.notes} onChange={(x) => set({ notes: x })} rows={2} /></Field>
    <div className="form-actions sticky"><Btn onClick={() => back('appointments')}>إلغاء</Btn><Btn kind="primary" onClick={save} disabled={!v.starts_at}>حفظ</Btn></div>
  </div>;
}
