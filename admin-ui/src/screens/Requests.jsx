import React, { useMemo, useState } from 'react';
import { useTable, useRow, create, update, archive, useStore, storeSnapshot } from '../data.js';
import { Btn, Field, Input, NumInput, Select, Seg, Chips, TextArea, Sheet, Section, Empty, KindTag, Pending, Icon, LinkBtn, useToast } from '../ui.jsx';
import { PersonPicker, PriceFields, NextStep, ContactActions, Timeline, SplitLayout, useSettings } from '../components.jsx';
import { TYPES, DEALS, REQUEST_STATUS, PRIORITY, SENT_RESPONSE } from '@shared/vocab.js';
import { matchRequestProperty, rankMatches, LEVEL_LABEL } from '@shared/matching.js';
import { personLabel, price, locLabel, propertyTitle, geoLabel, fmtDate, shareText, primaryPhone, waUrl, ago } from '../fmt.js';
import { MatchReasons } from './Properties.jsx';
import { href, go, back } from '../router.js';
import { norm } from '@shared/text.js';

export default function Requests({ route, wide }) {
  const id = route.parts[1];
  if (id === 'new') return <RequestForm personId={route.query.person} onDone={(nid) => go('requests/' + nid)} />;
  if (id && route.parts[2] === 'edit') return <EditWrap id={id} />;
  return <SplitLayout wide={wide} hasDetail={!!id} list={<RequestList selected={id} />} detail={id && <RequestDetail id={id} tab={route.query.tab} />} />;
}
function EditWrap({ id }) { const r = useRow('requests', id); return r ? <RequestForm initial={r} onDone={() => go('requests/' + id)} /> : <Empty title="غير موجود" />; }

export function requestSummary(r) {
  return [DEALS[r.deal], (r.types || []).map((t) => TYPES[t]).join(' أو '), (r.locations || []).map(locLabel).filter(Boolean).join('، '), r.budget_max != null ? 'حتى ' + price(r.budget_max, r.budget_currency, r.budget_basis) : r.budget_raw, r.area_min ? `${r.area_min}${r.area_max ? '–' + r.area_max : '+'} م²` : ''].filter(Boolean).join(' · ');
}

function RequestList({ selected }) {
  const reqs = useTable('requests');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('open');
  const list = useMemo(() => reqs.filter((r) => {
    if (status === 'open' && (r.archived_at || !['new', 'active', 'paused'].includes(r.status))) return false;
    if (status === 'closed' && (r.archived_at || ['new', 'active', 'paused'].includes(r.status))) return false;
    if (status === 'archived' && !r.archived_at) return false;
    if (q && !norm([r.ref, personLabel(r.person_id), r.specs, r.notes, requestSummary(r)].join(' ')).includes(norm(q))) return false;
    return true;
  }).sort((a, b) => (b.priority === 'high') - (a.priority === 'high') || b.created_at.localeCompare(a.created_at)), [reqs, q, status]);
  return <div className="page list-page">
    <div className="page-head"><h1>الطلبات <small className="muted">({list.length})</small></h1><Btn kind="primary" icon="plus" onClick={() => go('requests/new')}>طلب جديد</Btn></div>
    <div className="filters">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في الطلبات" />
      <Seg value={status} onChange={setStatus} options={[['open', 'جارية'], ['closed', 'منتهية'], ['archived', 'الأرشيف']]} />
    </div>
    {!list.length && <Empty title="لا توجد طلبات" />}
    <ul className="list">{list.map((r) => <li key={r.id}><a className={`list-item${selected === r.id ? ' on' : ''}`} href={href('requests/' + r.id)}>
      <KindTag kind="request" small />
      <div className="li-body">
        <div className="li-top"><b>{r.ref}</b> <span>{personLabel(r.person_id) || 'بدون عميل'}</span> {r.priority === 'high' && <span className="tag warn">مهم</span>} <Pending row={r} /></div>
        <small className="muted block">{requestSummary(r) || 'لم تُحدد المعايير'}</small>
        <div className="li-tags"><span className="tag">{REQUEST_STATUS[r.status]}</span><small className="muted">{ago(r.created_at)}</small></div>
      </div>
    </a></li>)}</ul>
  </div>;
}

function RequestDetail({ id, tab }) {
  const r = useRow('requests', id);
  if (!r) return <Empty title="الطلب غير موجود" />;
  return <div className="page detail">
    <div className="detail-head">
      <button className="icon-btn back-btn" onClick={() => back('requests')} aria-label="رجوع"><Icon name="back" /></button>
      <div className="dh-title"><KindTag kind="request" small /><h1>طلب {r.ref}{r.person_id ? ' — ' + personLabel(r.person_id) : ''}</h1><Pending row={r} /></div>
      <div className="dh-actions">
        <LinkBtn small icon="edit" href={href(`requests/${id}/edit`)}>تعديل</LinkBtn>
        <Btn small kind="ghost" icon="archive" onClick={() => archive('requests', id, !r.archived_at)}>{r.archived_at ? 'استعادة' : 'أرشفة'}</Btn>
      </div>
    </div>
    <div className="status-strip">
      <Select value={r.status} onChange={(v) => update('requests', id, { status: v })} options={Object.entries(REQUEST_STATUS)} aria-label="الحالة" />
      <Select value={r.priority} onChange={(v) => update('requests', id, { priority: v })} options={Object.entries(PRIORITY)} aria-label="الأولوية" />
      {r.source && <span className="tag">المصدر: {r.source}</span>}
    </div>
    <NextStep link={{ request_id: id, person_id: r.person_id || undefined }} defaultTitle={'متابعة طلب ' + (personLabel(r.person_id) || r.ref)} />
    <div className="detail-grid">
      <div>
        <Section title="ماذا يريد">
          <p className="summary">{requestSummary(r) || <span className="muted">لم تُحدد المعايير بعد</span>}</p>
          {r.budget_raw && <p className="small muted">الميزانية كما وردت: «{r.budget_raw}»{r.budget_currency === 'unknown' && r.budget_max != null ? ' — العملة غير مؤكدة' : ''}</p>}
          {r.bedrooms_min != null && <p className="small">غرف: {r.bedrooms_min}+</p>}
          {r.specs && <p><b>المواصفات:</b> {r.specs}</p>}
          {r.flexibility && <p><b>المرونة:</b> {r.flexibility}</p>}
          {r.notes && <p className="private-note">{r.notes}</p>}
        </Section>
        {r.person_id && <Section title="العميل"><p><a href={href('people/' + r.person_id)}>{personLabel(r.person_id)}</a></p><ContactActions personId={r.person_id} link={{ request_id: id }} /></Section>}
        <Section title="سجل التواصل" collapsible><Timeline link={{ request_id: id }} /></Section>
      </div>
      <div>
        <Matches r={r} />
        <Sent r={r} />
      </div>
    </div>
  </div>;
}

function Matches({ r }) {
  const s = useStore();
  const props = useTable('properties');
  const sent = useTable('sent_offers');
  const settings = useSettings();
  const [sending, setSending] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const staleDays = settings.stale_days || 30;
  const sentIds = new Set(sent.filter((x) => x.request_id === r.id && !x.archived_at).map((x) => x.property_id));
  const all = useMemo(() => rankMatches(props.map((p) => ({ p, match: matchRequestProperty(r, p, { staleDays }) })).filter((x) => x.match)), [props, r, staleDays]);
  const fresh = all.filter((x) => !sentIds.has(x.p.id));
  const shown = showAll ? fresh : fresh.filter((x) => x.match.level !== 'weak');
  return <Section title="عروض مناسبة" count={fresh.length}>
    <p className="hint">المطابقة حسب العملية والنوع والموقع والسعر والمساحة. الأسباب والاختلافات والنواقص معروضة؛ القرار لك.</p>
    {!shown.length && <p className="muted small">لا توجد عروض مناسبة{fresh.length ? ' قوية أو جزئية' : ''} حالياً.</p>}
    <ul className="matches">{shown.map(({ p, match }) => <li key={p.id} className={`match ${match.level}`}>
      <div className="m-head"><span className={`level ${match.level}`}>{LEVEL_LABEL[match.level]}</span> <a href={href('properties/' + p.id)}><b>{p.ref}</b> {propertyTitle(p)}</a></div>
      <small className="muted">{geoLabel(p)} · {price(p.price_amount, p.price_currency, p.price_basis) || 'سعر غير معروف'}{p.area_m2 ? ` · ${p.area_m2} م²` : ''}</small>
      <MatchReasons match={match} />
      <div className="row-actions">
        <Btn small kind="primary" icon="wa" onClick={() => setSending(p)}>أرسل للعميل</Btn>
        <Btn small onClick={() => create('sent_offers', { request_id: r.id, person_id: r.person_id, property_id: p.id, sent_at: new Date().toISOString(), channel: 'other', response: 'dismissed', notes: 'استُبعد دون إرسال' })}>استبعد</Btn>
      </div>
    </li>)}</ul>
    {fresh.some((x) => x.match.level === 'weak') && <button className="linklike" onClick={() => setShowAll(!showAll)}>{showAll ? 'إخفاء المطابقات الضعيفة' : 'إظهار المطابقات الضعيفة أيضاً'}</button>}
    {sending && <SendSheet r={r} p={sending} onClose={() => setSending(null)} />}
  </Section>;
}

function SendSheet({ r, p, onClose }) {
  const settings = useSettings();
  const tpl = useTable('templates').find((t) => t.kind === 'property' && !t.archived_at);
  const ph = r.person_id && primaryPhone(r.person_id);
  const [text, setText] = useState(() => `السلام عليكم ${personLabel(r.person_id) || ''}،\nعندي عرض قد يناسب طلبك:\n\n` + shareText(p, settings, tpl?.body));
  const toast = useToast();
  const record = (channel) => { create('sent_offers', { request_id: r.id, person_id: r.person_id, property_id: p.id, sent_at: new Date().toISOString(), channel, response: 'pending' }); create('activities', { kind: 'whatsapp', body: `أُرسل العرض ${p.ref}`, person_id: r.person_id, request_id: r.id, property_id: p.id, occurred_at: new Date().toISOString() }); toast('سُجّل الإرسال'); onClose(); };
  return <Sheet title={`إرسال ${p.ref} إلى ${personLabel(r.person_id) || 'العميل'}`} onClose={onClose} footer={<>
    {ph?.whatsapp ? <a className="btn btn-wa" href={waUrl(ph.raw, text)} target="_blank" rel="noopener"><span>افتح واتساب</span></a> : <span className="muted small">{r.person_id ? 'لا يوجد رقم واتساب للعميل' : 'الطلب بلا عميل'}</span>}
    <Btn kind="primary" onClick={() => record(ph?.whatsapp ? 'whatsapp' : 'other')}>أرسلته — سجّل الإرسال</Btn>
  </>}>
    <p className="hint">المنظومة لا ترسل شيئاً بنفسها. افتح واتساب وأرسل، ثم سجّل الإرسال حتى لا يتكرر.</p>
    <TextArea value={text} onChange={setText} rows={9} />
  </Sheet>;
}

function Sent({ r }) {
  const sent = useTable('sent_offers').filter((x) => x.request_id === r.id && !x.archived_at).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const props = useTable('properties');
  if (!sent.length) return null;
  return <Section title="ما أرسلته لهذا العميل" count={sent.length}>
    <ul className="sent">{sent.map((s) => { const p = props.find((x) => x.id === s.property_id); return <li key={s.id}>
      <div><a href={href('properties/' + s.property_id)}>{p?.ref} {p ? propertyTitle(p) : ''}</a> <small className="muted">· {fmtDate(s.sent_at)}</small></div>
      <Select value={s.response} onChange={(v) => update('sent_offers', s.id, { response: v })} options={Object.entries(SENT_RESPONSE)} aria-label="رد العميل" />
      {s.response === 'interested' && <LinkBtn small href={href(`deals/new?request=${r.id}&property=${s.property_id}`)}>افتح فرصة</LinkBtn>}
    </li>; })}</ul>
  </Section>;
}

export function RequestForm({ initial, personId, onDone, embedded, value: ext, onChange: extChange }) {
  const [v, setV] = useState(() => initial ? { ...initial } : { deal: null, types: [], locations: [], budget_currency: 'unknown', budget_basis: 'total', priority: 'normal', status: 'new', person_id: personId || null });
  const val = ext || v;
  const set = (p) => (extChange ? extChange({ ...val, ...p }) : setV((x) => ({ ...x, ...p })));
  const wilayas = useTable('wilayas'), moughataas = useTable('moughataas'), areas = useTable('areas');
  const [locPick, setLocPick] = useState('');
  const [locText, setLocText] = useState('');
  const addLoc = (l) => set({ locations: [...(val.locations || []), l] });
  const save = () => {
    const keys = ['person_id', 'deal', 'types', 'locations', 'budget_raw', 'budget_min', 'budget_max', 'budget_currency', 'budget_basis', 'area_min', 'area_max', 'bedrooms_min', 'specs', 'flexibility', 'priority', 'source', 'status', 'notes'];
    const body = {};
    for (const k of keys) if (!initial || JSON.stringify(val[k]) !== JSON.stringify(initial[k])) if (val[k] !== undefined) body[k] = val[k];
    if (initial) { if (Object.keys(body).length) update('requests', initial.id, body); onDone(initial.id); }
    else onDone(create('requests', body));
  };
  const fields = <>
    {!embedded && <PersonPicker value={val.person_id} onChange={(x) => set({ person_id: x })} label="العميل" roles={['buyer']} />}
    <Field label="يبحث عن"><Seg value={val.deal} onChange={(x) => set({ deal: x })} options={[['sale', 'شراء'], ['rent', 'إيجار']]} allowNone /></Field>
    <Field label="نوع العقار (يمكن أكثر من نوع)"><Chips value={val.types} onChange={(x) => set({ types: x })} options={Object.entries(TYPES)} /></Field>
    <Field label="المواقع المطلوبة">
      <div className="chips">{(val.locations || []).map((l, i) => <span key={i} className="chip on">{locLabel(l)}<button type="button" aria-label="إزالة" onClick={() => set({ locations: val.locations.filter((_, j) => j !== i) })}>×</button></span>)}</div>
      <div className="inline-form">
        <select value={locPick} onChange={(e) => { const x = e.target.value; setLocPick(''); if (!x) return; const [kind, code] = x.split(':'); if (kind === 'w') addLoc({ wilaya_code: code, text: wilayas.find((w) => w.code === code)?.name_ar }); else if (kind === 'm') { const m = moughataas.find((mm) => mm.code === code); addLoc({ wilaya_code: m.wilaya_code, moughataa_code: code, text: m.name_ar }); } else { const a = areas.find((aa) => aa.id === code); addLoc({ area_id: code, moughataa_code: a.moughataa_code, wilaya_code: a.wilaya_code, text: a.name }); } }}>
          <option value="">+ أضف ولاية / مقاطعة / حي</option>
          {[...wilayas].sort((a, b) => a.sort - b.sort).map((w) => <optgroup key={w.code} label={w.name_ar}><option value={'w:' + w.code}>كل {w.name_ar}</option>{moughataas.filter((m) => m.wilaya_code === w.code).map((m) => <option key={m.code} value={'m:' + m.code}>{m.name_ar}</option>)}</optgroup>)}
          {areas.filter((a) => !a.archived_at).length > 0 && <optgroup label="أحياء محفوظة">{areas.filter((a) => !a.archived_at).map((a) => <option key={a.id} value={'a:' + a.id}>{a.name}</option>)}</optgroup>}
        </select>
        <input value={locText} onChange={(e) => setLocText(e.target.value)} placeholder="أو اكتب حياً/معلماً" />
        <Btn small onClick={() => { if (locText.trim()) { addLoc({ text: locText.trim() }); setLocText(''); } }}>أضف</Btn>
      </div>
    </Field>
    <PriceFields prefix="budget" label="الميزانية (الحد الأعلى)" value={{ budget_raw: val.budget_raw, budget_amount: val.budget_max, budget_currency: val.budget_currency, budget_basis: val.budget_basis }} onChange={(p) => { const m = {}; for (const [k, x] of Object.entries(p)) m[k === 'budget_amount' ? 'budget_max' : k] = x; set(m); }} />
    <div className="grid3">
      <Field label="الحد الأدنى للميزانية (اختياري)"><NumInput value={val.budget_min} onChange={(x) => set({ budget_min: x })} /></Field>
      <Field label="المساحة من (م²)"><NumInput value={val.area_min} onChange={(x) => set({ area_min: x })} /></Field>
      <Field label="المساحة إلى (م²)"><NumInput value={val.area_max} onChange={(x) => set({ area_max: x })} /></Field>
      <Field label="غرف على الأقل"><NumInput value={val.bedrooms_min} onChange={(x) => set({ bedrooms_min: x })} /></Field>
    </div>
    <Field label="مواصفات أخرى"><TextArea value={val.specs} onChange={(x) => set({ specs: x })} rows={2} placeholder="ركن، قرب الشارع المسفلت…" /></Field>
    <Field label="المرونة"><Input value={val.flexibility} onChange={(x) => set({ flexibility: x })} placeholder="يقبل مقاطعة مجاورة، أو زيادة بسيطة…" /></Field>
    <div className="grid2">
      <Field label="الأولوية"><Select value={val.priority} onChange={(x) => set({ priority: x || 'normal' })} options={Object.entries(PRIORITY)} /></Field>
      <Field label="المصدر"><Input value={val.source} onChange={(x) => set({ source: x })} placeholder="معرفة، واتساب، الموقع…" /></Field>
    </div>
    {!embedded && <Field label="ملاحظات خاصة"><TextArea value={val.notes} onChange={(x) => set({ notes: x })} rows={2} /></Field>}
  </>;
  if (embedded) return fields;
  return <div className="page form-page">
    <div className="page-head"><h1>{initial ? `تعديل الطلب ${initial.ref}` : 'طلب جديد'}</h1></div>
    {fields}
    <div className="form-actions sticky"><Btn onClick={() => back('requests')}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ</Btn></div>
  </div>;
}
