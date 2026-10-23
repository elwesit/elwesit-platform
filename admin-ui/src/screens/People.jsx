import React, { useMemo, useState } from 'react';
import { useTable, useRow, create, update, archive, call, storeSnapshot, useStore } from '../data.js';
import { Btn, Field, Input, Select, TextArea, Sheet, Section, Empty, KindTag, Pending, Icon, LinkBtn, useToast, Toggle, Confirm } from '../ui.jsx';
import { Missing, NextStep, ContactActions, Timeline, RolesPicker, SplitLayout, Photos } from '../components.jsx';
import { ROLES, PRIORITY, REQUEST_STATUS, DEAL_STAGES, APPT_STATUS } from '@shared/vocab.js';
import { personDuplicates } from '@shared/search.js';
import { phonesOf, displayPhone, propertyTitle, fmtDateTime, ago, normalizePhone } from '../fmt.js';
import { requestSummary } from './Requests.jsx';
import { href, go, back } from '../router.js';
import { norm } from '@shared/text.js';

export default function People({ route, wide }) {
  const id = route.parts[1];
  return <SplitLayout wide={wide} hasDetail={!!id} list={<PeopleList selected={id} />} detail={id && <PersonDetail id={id} />} />;
}

function PeopleList({ selected }) {
  const people = useTable('people');
  const phones = useTable('phones');
  const [q, setQ] = useState('');
  const [role, setRole] = useState(null);
  const [arch, setArch] = useState(false);
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => {
    const nq = norm(q), d = q.replace(/\D/g, '');
    return people.filter((p) => !p.merged_into && !!p.archived_at === arch && (!role || (p.roles || []).includes(role)) && (!q || norm(p.name + ' ' + p.name_alt + ' ' + p.notes).includes(nq) || (d.length >= 3 && phones.some((x) => x.person_id === p.id && x.normalized?.includes(d))))).sort((a, b) => (b.priority === 'high') - (a.priority === 'high') || (a.name || '').localeCompare(b.name || '', 'ar'));
  }, [people, phones, q, role, arch]);
  return <div className="page list-page">
    <div className="page-head"><h1>دفتر العملاء <small className="muted">({list.length})</small></h1><Btn kind="primary" icon="plus" onClick={() => setAdding(true)}>شخص جديد</Btn></div>
    <div className="filters">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو الهاتف" />
      <Select value={role} onChange={setRole} placeholder="كل الأدوار" options={Object.entries(ROLES)} />
      <label className="inline-check"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> الأرشيف</label>
    </div>
    {!list.length && <Empty title="لا يوجد أشخاص" />}
    <ul className="list">{list.map((p) => <li key={p.id}><a className={`list-item${selected === p.id ? ' on' : ''}`} href={href('people/' + p.id)}>
      <KindTag kind="person" small />
      <div className="li-body">
        <div className="li-top"><b>{p.name || 'بدون اسم'}</b> {p.priority === 'high' && <span className="tag warn">مهم</span>} <Pending row={p} /></div>
        <small className="muted block" dir="auto">{phonesOf(p.id).map((x) => displayPhone(x.normalized)).join(' · ')}</small>
        <div className="li-tags">{(p.roles || []).map((r) => <span key={r} className="tag">{ROLES[r]}</span>)}</div>
      </div>
    </a></li>)}</ul>
    {adding && <PersonFormSheet onClose={() => setAdding(false)} onCreated={(id) => go('people/' + id)} />}
  </div>;
}

function PersonFormSheet({ person, onClose, onCreated }) {
  const [v, setV] = useState(person ? { ...person } : { name: '', name_alt: '', roles: [], priority: 'normal', source: '', notes: '' });
  const [phone, setPhone] = useState('');
  const dups = useMemo(() => personDuplicates(storeSnapshot(), { name: v.name, phone, excludeId: person?.id }), [v.name, phone]);
  const save = () => {
    const body = { name: v.name.trim(), name_alt: v.name_alt, roles: v.roles, priority: v.priority, source: v.source, notes: v.notes };
    if (person) { update('people', person.id, body); onClose(); return; }
    const id = create('people', body);
    if (phone.trim()) create('phones', { person_id: id, raw: phone.trim(), whatsapp: true });
    onClose(); onCreated?.(id);
  };
  return <Sheet title={person ? 'تعديل الشخص' : 'شخص جديد'} onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ</Btn></>}>
    <Field label="الاسم"><Input value={v.name} onChange={(x) => setV({ ...v, name: x })} /></Field>
    <Field label="اسم آخر أو بالفرنسية" hint="يساعد البحث: Mohamed / محمد"><Input value={v.name_alt} onChange={(x) => setV({ ...v, name_alt: x })} dir="auto" /></Field>
    {!person && <Field label="الهاتف"><Input value={phone} onChange={setPhone} type="tel" dir="ltr" /></Field>}
    <RolesPicker value={v.roles} onChange={(x) => setV({ ...v, roles: x })} />
    <div className="grid2">
      <Field label="الأولوية"><Select value={v.priority} onChange={(x) => setV({ ...v, priority: x || 'normal' })} options={Object.entries(PRIORITY)} /></Field>
      <Field label="كيف تعرفت عليه"><Input value={v.source} onChange={(x) => setV({ ...v, source: x })} /></Field>
    </div>
    <Field label="ملاحظات"><TextArea value={v.notes} onChange={(x) => setV({ ...v, notes: x })} rows={3} /></Field>
    {dups.length > 0 && <div className="warn-box"><b>تكرار محتمل:</b><ul>{dups.map((d) => <li key={d.id}>{d.reason}: <a href={href('people/' + d.id)}>{d.name || 'بدون اسم'}</a></li>)}</ul><small>لن يُدمج شيء تلقائياً. يمكنك الدمج يدوياً من صفحة الشخص.</small></div>}
  </Sheet>;
}

function PersonDetail({ id }) {
  const p = useRow('people', id);
  const reqs = useTable('requests'), props = useTable('properties'), srcs = useTable('property_sources'), deals = useTable('deals'), appts = useTable('appointments');
  const [edit, setEdit] = useState(false);
  const [merge, setMerge] = useState(false);
  const dups = useMemo(() => p ? personDuplicates(storeSnapshot(), { name: p.name, phone: phonesOf(id)[0]?.raw, excludeId: id }) : [], [p, id]);
  if (!p) return <Missing title="غير موجود" />;
  if (p.merged_into) return <div className="page"><p>دُمج هذا السجل في <a href={href('people/' + p.merged_into)}>سجل آخر</a>.</p></div>;
  const myReqs = reqs.filter((r) => r.person_id === id && !r.archived_at);
  const owned = props.filter((x) => x.owner_person_id === id && !x.archived_at);
  const sourced = srcs.filter((s) => s.person_id === id && !s.archived_at).map((s) => props.find((x) => x.id === s.property_id)).filter((x) => x && !owned.includes(x));
  const myDeals = deals.filter((d) => (d.client_person_id === id || d.owner_person_id === id) && !d.archived_at);
  const myAppts = appts.filter((a) => a.person_id === id && !a.archived_at).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return <div className="page detail">
    <div className="detail-head">
      <button className="icon-btn back-btn" onClick={() => back('people')} aria-label="رجوع"><Icon name="back" /></button>
      <div className="dh-title"><KindTag kind="person" small /><h1>{p.name || 'بدون اسم'}</h1>{p.name_alt && <small className="muted">{p.name_alt}</small>}<Pending row={p} /></div>
      <div className="dh-actions">
        <Btn small icon="edit" onClick={() => setEdit(true)}>تعديل</Btn>
        <Btn small kind="ghost" onClick={() => setMerge(true)}>دمج</Btn>
        <Btn small kind="ghost" icon="archive" onClick={() => archive('people', id, !p.archived_at)}>{p.archived_at ? 'استعادة' : 'أرشفة'}</Btn>
      </div>
    </div>
    <div className="status-strip">{(p.roles || []).map((r) => <span key={r} className="tag">{ROLES[r]}</span>)}<span className={p.priority === 'high' ? 'tag warn' : 'tag'}>الأولوية: {PRIORITY[p.priority]}</span>{p.source && <span className="tag">{p.source}</span>}</div>
    {dups.length > 0 && <div className="warn-box"><b>قد يكون مكرراً مع:</b> {dups.map((d) => <a key={d.id} href={href('people/' + d.id)}>{d.name} ({d.reason}) </a>)} <Btn small onClick={() => setMerge(true)}>مراجعة الدمج</Btn></div>}
    <ContactActions personId={id} />
    <NextStep link={{ person_id: id }} defaultTitle={'متابعة مع ' + (p.name || '')} />
    <div className="detail-grid">
      <div>
        <Phones personId={id} />
        {p.notes && <Section title="ملاحظات"><p className="pre">{p.notes}</p></Section>}
        <Section title="الطلبات" count={myReqs.length} actions={<LinkBtn small icon="plus" href={href('requests/new?person=' + id)}>طلب</LinkBtn>}>
          <ul className="plain">{myReqs.map((r) => <li key={r.id}><KindTag kind="request" small /> <a href={href('requests/' + r.id)}>{r.ref}</a> — {requestSummary(r) || '—'} <span className="tag">{REQUEST_STATUS[r.status]}</span></li>)}</ul>
        </Section>
        <Section title="العروض" count={owned.length + sourced.length}>
          <ul className="plain">{owned.map((x) => <li key={x.id}><KindTag kind="offer" small /> <a href={href('properties/' + x.id)}>{x.ref} {propertyTitle(x)}</a> <span className="tag">مالك</span></li>)}{sourced.map((x) => <li key={x.id}><KindTag kind="offer" small /> <a href={href('properties/' + x.id)}>{x.ref} {propertyTitle(x)}</a> <span className="tag">مصدر</span></li>)}</ul>
        </Section>
      </div>
      <div>
        <Section title="الصفقات" count={myDeals.length}><ul className="plain">{myDeals.map((d) => <li key={d.id}><KindTag kind="deal" small /> <a href={href('deals/' + d.id)}>{d.title || 'فرصة'}</a> <span className="tag">{DEAL_STAGES[d.stage]}</span></li>)}</ul></Section>
        <Section title="المواعيد" count={myAppts.length} actions={<LinkBtn small icon="plus" href={href('appointments/new?person=' + id)}>موعد</LinkBtn>}><ul className="plain">{myAppts.slice(0, 8).map((a) => <li key={a.id}><KindTag kind="appointment" small /> <a href={href('appointments/' + a.id)}>{fmtDateTime(a.starts_at)}</a> {a.place} <span className="tag">{APPT_STATUS[a.status]}</span></li>)}</ul></Section>
        <Section title="سجل التواصل" ><Timeline link={{ person_id: id }} /></Section>
        <Section title="ملفات وتسجيلات" collapsible defaultOpen={false}><Photos ownerType="person" ownerId={id} kind="document" /><Photos ownerType="person" ownerId={id} kind="audio" /></Section>
      </div>
    </div>
    {edit && <PersonFormSheet person={p} onClose={() => setEdit(false)} />}
    {merge && <MergeSheet person={p} onClose={() => setMerge(false)} />}
  </div>;
}

function Phones({ personId }) {
  const phones = phonesOf(personId);
  const [raw, setRaw] = useState('');
  const [label, setLabel] = useState('');
  const all = useTable('phones');
  const clash = raw.replace(/\D/g, '').length >= 8 && all.find((x) => x.normalized === normalizePhone(raw) && x.person_id !== personId && !x.archived_at);
  return <Section title="الهواتف">
    <ul className="plain">{phones.map((ph) => <li key={ph.id} className="phone-row"><span dir="ltr">{displayPhone(ph.normalized)}</span> {ph.label && <small className="muted">{ph.label}</small>}
      <label className="inline-check small"><input type="checkbox" checked={!!ph.whatsapp} onChange={(e) => update('phones', ph.id, { whatsapp: e.target.checked })} /> واتساب</label>
      <button className="linklike" onClick={() => archive('phones', ph.id)}>حذف</button></li>)}</ul>
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (raw.trim()) { create('phones', { person_id: personId, raw: raw.trim(), label, whatsapp: true }); setRaw(''); setLabel(''); } }}>
      <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="رقم جديد" type="tel" dir="ltr" />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="وصف (عمل، أخ…)" />
      <Btn small type="submit">أضف</Btn>
    </form>
    {clash && <p className="warn-text small">هذا الرقم مسجل لشخص آخر: <a href={href('people/' + clash.person_id)}>افتح</a></p>}
  </Section>;
}

function MergeSheet({ person, onClose }) {
  const people = useTable('people');
  const [target, setTarget] = useState('');
  const [q, setQ] = useState('');
  const toast = useToast();
  const s = useStore();
  const dups = personDuplicates(storeSnapshot(), { name: person.name, phone: phonesOf(person.id)[0]?.raw, excludeId: person.id });
  const cands = q ? people.filter((x) => x.id !== person.id && !x.archived_at && !x.merged_into && norm(x.name).includes(norm(q))).slice(0, 8) : dups.map((d) => people.find((x) => x.id === d.id)).filter(Boolean);
  const doMerge = async () => {
    if (!s.online) { toast('الدمج يحتاج اتصالاً', 'err'); return; }
    const r = await call('POST', '/people/merge', { source_id: person.id, target_id: target }, 'دمج');
    if (r.ok) { toast('تم الدمج'); onClose(); go('people/' + target); } else toast(r.data?.message || 'تعذر الدمج', 'err');
  };
  return <Sheet title={`دمج «${person.name}» في شخص آخر`} onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="danger" disabled={!target} onClick={doMerge}>ادمج</Btn></>}>
    <p>تنتقل الهواتف والطلبات والعروض والصفقات والمواعيد والملاحظات إلى الشخص المختار، ويبقى هذا السجل مؤرشفاً ومشيراً إليه. لا يُحذف شيء.</p>
    <Field label="ابحث"><Input value={q} onChange={setQ} placeholder="الاسم" /></Field>
    <ul className="plain">{cands.map((c) => <li key={c.id}><label className="inline-check"><input type="radio" name="t" checked={target === c.id} onChange={() => setTarget(c.id)} /> {c.name} <small className="muted">{phonesOf(c.id).map((x) => x.raw).join(' · ')}</small></label></li>)}</ul>
  </Sheet>;
}
