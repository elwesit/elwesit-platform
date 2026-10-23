import React, { useMemo, useState, useEffect } from 'react';
import { useTable, useRow, update, call, useStore, uuid, table } from '../data.js';
import { Btn, Field, Input, Select, Seg, Sheet, Section, Empty, KindTag, Icon, LinkBtn, useToast } from '../ui.jsx';
import { SplitLayout, Photos, PersonPicker } from '../components.jsx';
import { RequestForm } from './Requests.jsx';
import { INBOX_KINDS, INBOX_SOURCES, TYPES, DEALS } from '@shared/vocab.js';
import { parseCapture, buildGazetteer } from '@shared/capture.js';
import { fmtDateTime, ago, waUrl, telUrl, displayPhone, normalizePhone, personLabel } from '../fmt.js';
import { href, go, back } from '../router.js';

export default function Inbox({ route, wide }) {
  const id = route.parts[1];
  return <SplitLayout wide={wide} hasDetail={!!id} list={<InboxList selected={id} />} detail={id && <InboxDetail id={id} />} />;
}

function InboxList({ selected }) {
  const items = useTable('inbox');
  const [tab, setTab] = useState('new');
  const list = useMemo(() => items.filter((m) => !m.archived_at && (tab === 'new' ? ['new', 'seen'].includes(m.status) : tab === 'done' ? ['converted', 'closed'].includes(m.status) : m.status === 'spam')).sort((a, b) => b.created_at.localeCompare(a.created_at)), [items, tab]);
  return <div className="page list-page">
    <div className="page-head"><h1>الوارد</h1></div>
    <p className="hint">كل ما يصل من الموقع (وواتساب عند ربطه) في مكان واحد. حوّل أي عنصر إلى عميل أو طلب أو عرض دون إعادة كتابة.</p>
    <Seg value={tab} onChange={setTab} options={[['new', 'جديد'], ['done', 'تمت معالجته'], ['spam', 'مهمل']]} />
    {!list.length && <Empty title={tab === 'new' ? 'لا يوجد وارد جديد' : 'لا شيء هنا'} />}
    <ul className="list">{list.map((m) => <li key={m.id}><a className={`list-item${selected === m.id ? ' on' : ''}${m.status === 'new' ? ' unread' : ''}`} href={href('inbox/' + m.id)}>
      <KindTag kind={m.kind === 'offer' ? 'offer' : m.kind === 'search' ? 'request' : 'inbox'} small />
      <div className="li-body">
        <div className="li-top"><b>{INBOX_KINDS[m.kind]}</b> <span>{m.name || displayPhone(m.phone_norm) || 'زائر'}</span>{m.status === 'new' && <span className="tag warn">جديد</span>}</div>
        <small className="muted block">{[m.property_ref && 'العقار ' + m.property_ref, m.payload?.location, m.message].filter(Boolean).join(' · ').slice(0, 120)}</small>
        <small className="muted">{INBOX_SOURCES[m.source]} · {ago(m.created_at)}</small>
      </div>
    </a></li>)}</ul>
  </div>;
}

function InboxDetail({ id }) {
  const m = useRow('inbox', id);
  const [convert, setConvert] = useState(null);
  const phones = useTable('phones');
  useEffect(() => { if (m?.status === 'new' && !m._pending) update('inbox', id, { status: 'seen' }); }, [id, m?.status]); // eslint-disable-line
  if (!m) return <Empty title="غير موجود" />;
  const p = m.payload || {};
  const known = phones.find((x) => x.normalized === m.phone_norm && !x.archived_at);
  const prop = m.property_ref && table('properties').find((x) => x.ref === m.property_ref);
  const conv = m.converted || {};
  return <div className="page detail">
    <div className="detail-head">
      <button className="icon-btn back-btn" onClick={() => back('inbox')} aria-label="رجوع"><Icon name="back" /></button>
      <div className="dh-title"><KindTag kind="inbox" small /><h1>{INBOX_KINDS[m.kind]} — {m.name || 'زائر'}</h1></div>
    </div>
    <p className="muted">وصل من {INBOX_SOURCES[m.source]} · {fmtDateTime(m.created_at)}</p>
    <Section title="ما أرسله">
      <dl className="info">
        <div className="info-row"><dt>الهاتف</dt><dd dir="ltr">{m.phone} {p.contact_pref && <small className="muted">(يفضّل {p.contact_pref === 'call' ? 'الاتصال' : 'واتساب'})</small>}</dd></div>
        {m.property_ref && <div className="info-row"><dt>العقار</dt><dd>{prop ? <a href={href('properties/' + prop.id)}>{m.property_ref}</a> : m.property_ref}</dd></div>}
        {p.deal && <div className="info-row"><dt>العملية</dt><dd>{DEALS[p.deal]}</dd></div>}
        {p.type && <div className="info-row"><dt>النوع</dt><dd>{TYPES[p.type]}</dd></div>}
        {p.location && <div className="info-row"><dt>المكان</dt><dd>{p.location}</dd></div>}
        {p.budget && <div className="info-row"><dt>الميزانية</dt><dd>{p.budget}</dd></div>}
        {p.price && <div className="info-row"><dt>السعر</dt><dd>{p.price}</dd></div>}
        {p.area && <div className="info-row"><dt>المساحة</dt><dd>{p.area}</dd></div>}
        {p.relation && <div className="info-row"><dt>صفته</dt><dd>{({ owner: 'المالك', broker: 'وسيط', other: 'أخرى' })[p.relation]}</dd></div>}
        {m.message && <div className="info-row"><dt>الرسالة</dt><dd className="pre">{m.message}</dd></div>}
      </dl>
      {m.kind === 'offer' && <Photos ownerType="inbox" ownerId={id} />}
      <div className="row-actions">
        <a className="btn btn-default btn-sm" href={telUrl(m.phone)}><Icon name="phone" size={16} /><span>اتصال</span></a>
        <a className="btn btn-wa btn-sm" href={waUrl(m.phone, `السلام عليكم${m.name ? ' ' + m.name : ''}، وصلنا طلبك عبر الموقع${m.property_ref ? ' بخصوص العقار ' + m.property_ref : ''}.`)} target="_blank" rel="noopener"><Icon name="wa" size={16} /><span>واتساب</span></a>
      </div>
      {known && <p className="hint">هذا الرقم مسجل لـ <a href={href('people/' + known.person_id)}>{personLabel(known.person_id)}</a>.</p>}
    </Section>
    {m.status === 'converted' ? <Section title="تمت المعالجة">
      <ul className="plain">
        {conv.person_id && <li>الشخص: <a href={href('people/' + conv.person_id)}>{personLabel(conv.person_id)}</a></li>}
        {conv.request_id && <li><a href={href('requests/' + conv.request_id)}>الطلب</a></li>}
        {conv.property_id && <li><a href={href('properties/' + conv.property_id)}>العرض</a></li>}
        {conv.deal_id && <li><a href={href('deals/' + conv.deal_id)}>الفرصة</a></li>}
      </ul>
    </Section> : <Section title="المعالجة">
      <div className="row-actions wrap">
        {m.kind === 'search' && <Btn kind="primary" onClick={() => setConvert('request')}>حوّل إلى عميل + طلب</Btn>}
        {m.kind === 'offer' && <Btn kind="primary" onClick={() => setConvert('property')}>حوّل إلى عميل + عرض</Btn>}
        {m.kind === 'interest' && <Btn kind="primary" onClick={() => setConvert('deal')}>حوّل إلى عميل + فرصة على العقار</Btn>}
        <Btn onClick={() => setConvert('person')}>عميل فقط</Btn>
        {m.kind !== 'search' && <Btn onClick={() => setConvert('request')}>عميل + طلب</Btn>}
        <Btn kind="ghost" onClick={() => update('inbox', id, { status: 'closed' })}>إغلاق دون تحويل</Btn>
        <Btn kind="ghost" onClick={() => update('inbox', id, { status: 'spam' })}>مهمل</Btn>
      </div>
    </Section>}
    {convert && <ConvertSheet m={m} mode={convert} knownPersonId={known?.person_id} prop={prop} onClose={() => setConvert(null)} />}
  </div>;
}

function ConvertSheet({ m, mode, knownPersonId, prop, onClose }) {
  const p = m.payload || {};
  const s = useStore();
  const toast = useToast();
  const [personId, setPersonId] = useState(knownPersonId || null);
  const [name, setName] = useState(m.name || '');
  // تعبئة مسبقة من بيانات الوارد، مع قراءة المكان والميزانية بالمحلل نفسه (للمراجعة)
  const parsed = useMemo(() => {
    const gaz = buildGazetteer({ wilayas: table('wilayas'), moughataas: table('moughataas'), areas: table('areas') });
    return parseCapture([p.location, p.budget || p.price, p.area ? p.area + ' متر' : ''].filter(Boolean).join(' '), { gazetteer: gaz });
  }, []); // eslint-disable-line
  const [req, setReq] = useState(() => ({ deal: p.deal, types: p.type ? [p.type] : [], locations: parsed.locations.length ? parsed.locations.map(({ wilaya_code, moughataa_code, area_id, text }) => ({ wilaya_code, moughataa_code, area_id, text })) : (p.location ? [{ text: p.location }] : []), budget_raw: p.budget || '', budget_max: parsed.price?.max ?? parsed.price?.amount ?? null, budget_currency: parsed.price?.currency || 'unknown', budget_basis: parsed.price?.basis || 'total', area_min: parsed.area_m2, specs: m.message || '', priority: 'normal', status: 'new' }));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!s.online) { toast('التحويل يحتاج اتصالاً؛ سيُرسل عند الاتصال', 'info'); }
    setBusy(true);
    const body = { person_id: personId, name, phone: m.phone, new_person_id: uuid(), roles: mode === 'property' ? [p.relation === 'broker' ? 'broker' : 'owner'] : ['buyer'] };
    if (mode === 'request') body.request = req;
    if (mode === 'property') body.property = { deal: p.deal, type: p.type, area_text: parsed.locations[0] ? '' : p.location, wilaya_code: parsed.locations[0]?.wilaya_code, moughataa_code: parsed.locations[0]?.moughataa_code, area_id: parsed.locations[0]?.area_id, area_m2: parsed.area_m2 ?? (Number(p.area) || null), price_raw: p.price || '', price_amount: parsed.price?.amount ?? null, price_currency: parsed.price?.currency || 'unknown', price_basis: parsed.price?.basis || 'total', description: m.message || '', availability: 'unknown' };
    if (mode === 'property') body.source_relation = p.relation || 'owner';
    if (mode === 'deal') body.deal = { title: `اهتمام بـ ${m.property_ref}${name ? ' — ' + name : ''}`, property_id: prop?.id || null, stage: 'interest', owner_person_id: prop?.owner_person_id || null };
    body.task = { title: `اتصل بـ ${name || 'الزائر'} (${INBOX_KINDS[m.kind]})`, due_at: new Date(Date.now() + 2 * 3600000).toISOString(), due_has_time: 1 };
    const r = await call('POST', `/inbox/${m.id}/convert`, body, 'تحويل وارد');
    setBusy(false);
    if (r.ok) { toast('تم التحويل'); onClose(); const c = r.data.created; go(c.request_id ? 'requests/' + c.request_id : c.property_id ? 'properties/' + c.property_id : c.deal_id ? 'deals/' + c.deal_id : 'people/' + c.person_id); }
    else toast(r.data?.message || 'تعذر التحويل', 'err');
  };
  return <Sheet title="تحويل الوارد" wide onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" disabled={busy} onClick={submit}>{busy ? 'جارٍ…' : 'حوّل'}</Btn></>}>
    <PersonPicker value={personId} onChange={setPersonId} label="اربط بشخص موجود (اختياري)" allowNew={false} />
    {!personId && <Field label="أو أنشئ شخصاً جديداً باسم" hint={`الهاتف: ${m.phone}`}><Input value={name} onChange={setName} /></Field>}
    {mode === 'request' && <><h3>الطلب</h3><RequestForm embedded value={req} onChange={setReq} /></>}
    {mode === 'property' && <p className="hint">سيُنشأ عرض غير منشور بحالة «غير مؤكد» مع صور الوارد، ومصدره هذا الشخص. راجع التفاصيل بعد التحويل.</p>}
    {mode === 'deal' && <p className="hint">ستُفتح فرصة بمرحلة «اهتمام» على العقار {m.property_ref}.</p>}
    <p className="hint">ستُضاف متابعة «اتصل به» بعد ساعتين.</p>
  </Sheet>;
}
