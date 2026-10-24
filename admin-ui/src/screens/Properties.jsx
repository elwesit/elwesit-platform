import React, { useMemo, useState, useEffect } from 'react';
import { useTable, useRow, create, update, archive, call, api, storeSnapshot, useStore, getState, table } from '../data.js';
import { fieldsFor, cleanupFor } from '@shared/typeFields.js';
import { Btn, Field, Input, NumInput, Select, Seg, Chips, Toggle, TextArea, Sheet, Section, Empty, KindTag, Pending, Icon, LinkBtn, useToast, Confirm } from '../ui.jsx';
import { Missing, PersonPicker, GeoFields, PriceFields, NextStep, ContactActions, Timeline, Photos, InfoRow, SplitLayout, useSettings, loadLeaflet, tileLayer, pinIcon, zonesLayer, zoneNames, attachPlans } from '../components.jsx';
import { findPlanLots, planLabel, hitTag, hitPlanCount, shapeText, searchPlanLots, parseLotQuery } from '@shared/plans.js';
import { zoneAt, lotLabel, NKC_ZONES } from '@shared/nouakchottZones.js';
import MapPicker from '../MapPicker.jsx';
import { TYPES, DEALS, AVAILABILITY, FEATURES, SENT_RESPONSE } from '@shared/vocab.js';
import { geoLabel, price, ago, propertyTitle, personLabel, shareText, fmtDate, waUrl, primaryPhone, toDateInput, fromDateInput, fillTemplate, locLabel } from '../fmt.js';
import { propertyDuplicates } from '@shared/search.js';
import { matchRequestProperty, rankMatches, LEVEL_LABEL } from '@shared/matching.js';
import { href, go, back } from '../router.js';
import { norm, normLot } from '@shared/text.js';

const STALE = 30;
const verifiedAge = (p) => (p.verified_at ? Math.floor((Date.now() - Date.parse(p.verified_at)) / 86400000) : null);

export default function Properties({ route, wide }) {
  const id = route.parts[1];
  const sub = route.parts[2];
  if (id === 'new') return <PropertyForm onDone={(nid) => go('properties/' + nid)} />;
  if (id === 'map') return <PlanMap key={route.query.q || ''} initialQ={route.query.q} />;
  if (id && sub === 'edit') return <EditWrapper id={id} />;
  return <SplitLayout wide={wide} hasDetail={!!id} list={<PropertyList route={route} selected={id} />} detail={id && <PropertyDetail id={id} tab={route.query.tab} />} />;
}

function EditWrapper({ id }) {
  const p = useRow('properties', id);
  if (!p) return <Missing title="غير موجود" />;
  return <PropertyForm initial={p} onDone={() => go('properties/' + id)} />;
}

function PropertyList({ route, selected }) {
  const props = useTable('properties');
  const s = useStore();
  const staleDays = s.settings?.stale_days || STALE;
  const [q, setQ] = useState('');
  const [f, setF] = useState({ deal: null, type: null, avail: null, pub: null, filter: route.query.filter || null, archived: false });
  const list = useMemo(() => {
    const nq = norm(q); const lot = normLot(q);
    return props.filter((p) => {
      if (!!p.archived_at !== f.archived) return false;
      if (f.deal && p.deal !== f.deal) return false;
      if (f.type && p.type !== f.type) return false;
      if (f.avail && p.availability !== f.avail) return false;
      if (f.pub === 'yes' && !p.published) return false;
      if (f.pub === 'no' && p.published) return false;
      if (f.filter === 'stale') { const a = verifiedAge(p); if (!(['available', 'unknown', 'reserved'].includes(p.availability) && (a == null || a > staleDays))) return false; }
      if (nq && !(norm([p.ref, p.title, p.area_text, p.landmark, p.plan, p.sector, p.internal_notes, geoLabel(p)].join(' ')).includes(nq) || (lot && p.lot_norm === lot))) return false;
      return true;
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [props, q, f, staleDays]);
  return <div className="page list-page">
    <div className="page-head"><h1>العروض <small className="muted">({list.length})</small></h1><span className="row-actions"><Btn icon="pin" onClick={() => go('properties/map')}>مخطط نواكشوط</Btn><Btn kind="primary" icon="plus" onClick={() => go('properties/new')}>عرض جديد</Btn></span></div>
    <div className="filters">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث: مرجع، حي، رقم قطعة، ملاحظة" aria-label="بحث في العروض" />
      <Select value={f.deal} onChange={(v) => setF({ ...f, deal: v })} placeholder="بيع وإيجار" options={Object.entries(DEALS)} />
      <Select value={f.type} onChange={(v) => setF({ ...f, type: v })} placeholder="كل الأنواع" options={Object.entries(TYPES)} />
      <Select value={f.avail} onChange={(v) => setF({ ...f, avail: v })} placeholder="كل الحالات" options={Object.entries(AVAILABILITY)} />
      <Select value={f.pub} onChange={(v) => setF({ ...f, pub: v })} placeholder="منشور وغير منشور" options={[['yes', 'منشور'], ['no', 'مسودة (غير منشور)']]} />
      <label className="inline-check"><input type="checkbox" checked={f.filter === 'stale'} onChange={(e) => setF({ ...f, filter: e.target.checked ? 'stale' : null })} /> يحتاج تحققاً</label>
      <label className="inline-check"><input type="checkbox" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} /> الأرشيف</label>
    </div>
    {!list.length && <Empty title="لا توجد عروض" action={<Btn kind="primary" onClick={() => go('properties/new')}>أضف عرضاً</Btn>}>أضف عرضاً من هنا أو من «إضافة سريعة».</Empty>}
    <ul className="list">{list.map((p) => {
      const age = verifiedAge(p);
      return <li key={p.id}><a className={`list-item${selected === p.id ? ' on' : ''}`} href={href('properties/' + p.id)}>
        <KindTag kind="offer" small />
        <div className="li-body">
          <div className="li-top"><b>{p.ref}</b> <span>{propertyTitle(p)}</span> <Pending row={p} /></div>
          <small className="muted block">{[geoLabel(p), p.area_m2 ? `${p.area_m2} م²` : '', p.lot_number ? `قطعة ${p.lot_number}` : ''].filter(Boolean).join(' · ')}</small>
          <div className="li-tags">
            <span className="price-tag">{price(p.price_amount, p.price_currency, p.price_basis) || 'سعر غير معروف'}</span>
            <span className={`tag av-${p.availability}`}>{AVAILABILITY[p.availability]}</span>
            {p.published ? <span className="tag pub">منشور</span> : <span className="tag">مسودة</span>}
            <span className={`tag ${age == null || age > staleDays ? 'warn' : ''}`}>{age == null ? 'لم يُتحقق' : `تحقق ${ago(p.verified_at)}`}</span>
          </div>
        </div>
      </a></li>;
    })}</ul>
  </div>;
}

function PropertyDetail({ id, tab }) {
  const p = useRow('properties', id);
  const sources = useTable('property_sources');
  const settings = useSettings();
  const toast = useToast();
  const [showMap, setShowMap] = useState(false);
  const [share, setShare] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  if (!p) return <Missing title="العرض غير موجود" />;
  const age = verifiedAge(p);
  const staleDays = settings.stale_days || STALE;
  const srcs = sources.filter((s) => s.property_id === id && !s.archived_at);
  return <div className="page detail">
    <div className="detail-head">
      <button className="icon-btn back-btn" onClick={() => back('properties')} aria-label="رجوع"><Icon name="back" /></button>
      <div className="dh-title"><KindTag kind="offer" small /><h1>{p.ref} — {propertyTitle(p)}</h1><Pending row={p} /></div>
      <div className="dh-actions">
        <LinkBtn small icon="edit" href={href(`properties/${id}/edit`)}>تعديل</LinkBtn>
        <Btn small icon="share" onClick={() => setShare(true)}>نص المشاركة</Btn>
        <Btn small kind="ghost" icon="archive" onClick={() => (p.archived_at ? archive('properties', id, false) : setConfirmArchive(true))}>{p.archived_at ? 'استعادة' : 'أرشفة'}</Btn>
      </div>
    </div>
    <div className="status-strip">
      <span className={`tag av-${p.availability}`}>{AVAILABILITY[p.availability]}</span>
      <span className={`tag ${age == null || age > staleDays ? 'warn' : 'ok'}`}>{age == null ? 'لم يُسجَّل تحقق من التوفر والسعر' : `آخر تحقق ${ago(p.verified_at)} (${fmtDate(p.verified_at)})`}</span>
      <Btn small icon="check" onClick={() => { update('properties', id, { verified_at: new Date().toISOString(), availability: p.availability === 'unknown' ? 'available' : p.availability }); toast('سُجّل التحقق اليوم'); }}>تحققت اليوم</Btn>
    </div>
    {!p.archived_at && <PublishStatus p={p} />}
    <NextStep link={{ property_id: id }} defaultTitle={'تحقق من ' + p.ref} />
    <div className="detail-grid">
      <div>
        <Section title="المعلومات">
          <dl className="info">
            <InfoRow label="العملية">{DEALS[p.deal]}</InfoRow>
            <InfoRow label="النوع">{TYPES[p.type]}</InfoRow>
            <InfoRow label="الموقع">{geoLabel(p) || '—'}</InfoRow>
            <InfoRow label="معلم قريب">{p.landmark}</InfoRow>
            <InfoRow label="وصف المكان">{p.location_desc}</InfoRow>
            <InfoRow label="المساحة">{p.area_m2 != null ? `${p.area_m2} م²` : null}</InfoRow>
            <InfoRow label="رقم القطعة">{p.lot_number ? <span className="lot">{p.lot_number}</span> : null}</InfoRow>
            <InfoRow label="المخطط / القطاع">{[p.plan, p.sector && 'قطاع ' + p.sector].filter(Boolean).join(' · ')}</InfoRow>
            <InfoRow label="الواجهة">{p.frontage}</InfoRow>
            <InfoRow label="الغرف">{p.bedrooms}</InfoRow>
            <InfoRow label="الحمامات">{p.bathrooms}</InfoRow>
            <InfoRow label="الطوابق">{p.floors}</InfoRow>
            <InfoRow label="المواصفات">{(p.features || []).map((f) => FEATURES[f]).join('، ')}</InfoRow>
            <InfoRow label="السعر">{p.price_amount != null ? price(p.price_amount, p.price_currency, p.price_basis) : (p.price_raw ? null : 'غير معروف')}{p.price_raw ? <small className="muted"> (كما ورد: «{p.price_raw}»)</small> : null}{p.price_negotiable ? ' · قابل للتفاوض' : ''}</InfoRow>
            <InfoRow label="شروط السعر">{p.price_terms}</InfoRow>
            <InfoRow label="المالك">{p.owner_person_id ? <a href={href('people/' + p.owner_person_id)}>{personLabel(p.owner_person_id)}</a> : null}</InfoRow>
            <InfoRow label="الوصف">{p.description}</InfoRow>
          </dl>
          {p.internal_notes && <div className="private-note"><b>ملاحظات خاصة (لا تُنشر):</b><p>{p.internal_notes}</p></div>}
          {p.owner_person_id && <ContactActions personId={p.owner_person_id} link={{ property_id: id }} waText={fillTemplate('السلام عليكم، هل ما زال العقار ({title}) متوفراً؟ وهل السعر ما زال كما هو؟', { title: propertyTitle(p) })} />}
        </Section>
        <Section title="الموقع على الخريطة" actions={<Btn small icon="pin" onClick={() => setShowMap(true)}>{p.lat != null ? 'تعديل' : 'حدد الموقع'}</Btn>}>
          {p.lat != null ? <MiniMap p={p} /> : <p className="muted">لا يوجد موقع على الخريطة. يمكن التسجيل والمتابعة بدونه.</p>}
          {p.lat != null && <p className="hint">{p.location_precision === 'exact' ? 'موقع دقيق' : 'موقع تقريبي'} · أُدخل {({ pin: 'بعلامة على الخريطة', gps: 'من موقع الهاتف', coords: 'بالإحداثيات', link: 'من رابط', plan: 'من مخطط التجزئة' })[p.location_method] || ''} · <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noopener">الاتجاهات</a></p>}
          <Geometries property={p} />
        </Section>
        <Section title="الصور" collapsible>
          <Photos ownerType="property" ownerId={id} />
        </Section>
        <Section title="الوثائق الخاصة" collapsible defaultOpen={false}>
          <Photos ownerType="property" ownerId={id} kind="document" />
        </Section>
      </div>
      <div>
        <Sources property={p} sources={srcs} />
        <PublishPanel p={p} />
        <PropertyMatches p={p} open={tab === 'matches'} />
        <SentList propertyId={id} />
        <Section title="سجل التواصل والملاحظات" collapsible><Timeline link={{ property_id: id }} /></Section>
      </div>
    </div>
    {showMap && <MapPicker value={p} onSave={(v) => update('properties', id, v)} onClose={() => setShowMap(false)} />}
    {share && <ShareSheet p={p} onClose={() => setShare(false)} />}
    {confirmArchive && <Confirm title="أرشفة العرض" message={p.published ? 'العرض منشور؛ ستُسحب صفحته العامة. يبقى السجل في الأرشيف ويمكن استعادته.' : 'يبقى السجل في الأرشيف ويمكن استعادته.'} onConfirm={() => archive('properties', id)} onClose={() => setConfirmArchive(false)} />}
  </div>;
}

function MiniMap({ p }) {
  const ref = React.useRef();
  const settings = useSettings();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    let map;
    loadLeaflet().then((L) => {
      map = L.map(ref.current, { scrollWheelZoom: false }).setView([p.lat, p.lng], 16);
      tileLayer(L, settings).addTo(map); map.attributionControl.setPrefix(false);
      if (zoneAt(p.lat, p.lng)) zonesLayer(L, { names: zoneNames(table('moughataas')), highlight: p.moughataa_code }).addTo(map);
      attachPlans(L, map, table('plans'));
      const mk = L.marker([p.lat, p.lng], { icon: pinIcon(L) }).addTo(map);
      if (lotLabel(p)) mk.bindTooltip(lotLabel(p), { permanent: true, direction: 'top', offset: [0, -28], className: 'lot-label' });
    });
    return () => map?.remove();
  }, [on, p.lat, p.lng, p.lot_number, p.sector, p.plan, p.moughataa_code]); // eslint-disable-line
  return <div ref={ref} className="map map-mini">{!on && <button className="btn btn-default" onClick={() => setOn(true)}>اعرض الخريطة</button>}</div>;
}

// ---------- مصادر العرض ----------
function Sources({ property, sources }) {
  const [edit, setEdit] = useState(null);
  return <Section title="مصادر العرض" count={sources.length} actions={<Btn small icon="plus" onClick={() => setEdit({ relation: 'broker', price_currency: 'unknown', price_basis: 'total' })}>مصدر</Btn>}>
    <p className="hint">من أين وصلك العرض. لا يظهر أي مصدر للجمهور ولا لمصدر آخر.</p>
    {!sources.length && <p className="muted small">لا يوجد مصدر مسجل.</p>}
    <ul className="sources">{sources.map((s) => <li key={s.id}>
      <div><b>{s.person_id ? <a href={href('people/' + s.person_id)}>{personLabel(s.person_id)}</a> : 'مصدر بدون اسم'}</b> <span className="tag">{({ owner: 'المالك', broker: 'وسيط', relative: 'قريب المالك', other: 'أخرى' })[s.relation]}</span> {s.channel && <small className="muted">عبر {s.channel}</small>}</div>
      <div className="small">{s.price_amount != null ? price(s.price_amount, s.price_currency, s.price_basis) : s.price_raw || 'بدون سعر'}{s.commission_terms && <> · العمولة: {s.commission_terms}</>}</div>
      {s.conditions && <div className="small muted">الشروط: {s.conditions}</div>}
      <div className="small"><span className={!s.verified_at || (Date.now() - Date.parse(s.verified_at)) / 86400000 > STALE ? 'warn-text' : 'muted'}>{s.verified_at ? `تحقق ${ago(s.verified_at)}` : 'لم يُتحقق'}</span></div>
      <div className="row-actions">
        {s.person_id && <ContactActions personId={s.person_id} compact link={{ property_id: property.id }} />}
        <Btn small onClick={() => update('property_sources', s.id, { verified_at: new Date().toISOString() })}>تحققت اليوم</Btn>
        <Btn small kind="ghost" icon="edit" onClick={() => setEdit(s)} aria-label="تعديل" />
      </div>
    </li>)}</ul>
    {edit && <SourceSheet property={property} source={edit} onClose={() => setEdit(null)} />}
  </Section>;
}

function SourceSheet({ property, source, onClose }) {
  const [s, setS] = useState({ ...source });
  const set = (p) => setS({ ...s, ...p });
  const save = () => {
    const body = { person_id: s.person_id, relation: s.relation, channel: s.channel || '', price_raw: s.price_raw || '', price_amount: s.price_amount ?? null, price_currency: s.price_currency, price_basis: s.price_basis, commission_terms: s.commission_terms || '', conditions: s.conditions || '', verified_at: s.verified_at || null, notes: s.notes || '' };
    if (source.id) update('property_sources', source.id, body); else create('property_sources', { ...body, property_id: property.id });
    onClose();
  };
  return <Sheet title={source.id ? 'تعديل المصدر' : 'مصدر جديد'} onClose={onClose} footer={<>{source.id && <Btn kind="ghost" onClick={() => { archive('property_sources', source.id); onClose(); }}>حذف</Btn>}<Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ</Btn></>}>
    <PersonPicker value={s.person_id} onChange={(v) => set({ person_id: v })} label="الشخص (المالك أو الوسيط)" roles={[s.relation === 'owner' ? 'owner' : 'broker']} />
    <Field label="صفته"><Seg value={s.relation} onChange={(v) => set({ relation: v })} options={[['owner', 'المالك'], ['broker', 'وسيط'], ['relative', 'قريب المالك'], ['other', 'أخرى']]} /></Field>
    <Field label="وسيلة التواصل"><Input value={s.channel} onChange={(v) => set({ channel: v })} placeholder="اتصال، واتساب، لقاء…" /></Field>
    <PriceFields value={s} onChange={set} label="سعره" />
    <Field label="العمولة المتفق عليها معه"><Input value={s.commission_terms} onChange={(v) => set({ commission_terms: v })} placeholder="مثلاً: مناصفة، أو مبلغ محدد" /></Field>
    <Field label="شروطه"><Input value={s.conditions} onChange={(v) => set({ conditions: v })} /></Field>
    <Field label="تاريخ التحقق"><input type="date" value={toDateInput(s.verified_at)} onChange={(e) => set({ verified_at: fromDateInput(e.target.value) })} /></Field>
    <Field label="ملاحظات"><TextArea value={s.notes} onChange={(v) => set({ notes: v })} rows={2} /></Field>
  </Sheet>;
}

// ---------- الحدود: مرسومة يدوياً أو مستوردة من مصدر موثق ----------
function Geometries({ property }) {
  const geoms = useTable('geometries').filter((g) => g.property_id === property.id && !g.archived_at);
  const [adding, setAdding] = useState(false);
  return <div className="geoms">
    {geoms.map((g) => <div key={g.id} className="geom-item"><span className={`tag ${g.method === 'imported' ? 'ok' : ''}`}>{g.method === 'imported' ? 'حدود مستوردة' : 'حدود رسمتها بنفسي'}</span> {g.source_name && <small>المصدر: {g.source_name}{g.source_license ? ` (${g.source_license})` : ''}</small>} {g.verified ? <span className="tag ok">موثق</span> : <span className="tag warn">غير موثق</span>} <button className="linklike" onClick={() => archive('geometries', g.id)}>حذف</button></div>)}
    <button className="linklike" onClick={() => setAdding(true)}>+ إرفاق حدود القطعة (GeoJSON)</button>
    {adding && <GeometrySheet property={property} onClose={() => setAdding(false)} />}
  </div>;
}
function GeometrySheet({ property, onClose }) {
  const [g, setG] = useState({ method: 'imported', source_name: '', source_license: '', verified: false, geojson: '', lot_number: property.lot_number, plan: property.plan, sector: property.sector });
  const [err, setErr] = useState('');
  const save = () => {
    try { const j = JSON.parse(g.geojson); if (!j.type) throw 0; } catch { setErr('ملف GeoJSON غير صالح'); return; }
    if (g.method === 'imported' && !g.source_name.trim()) { setErr('اذكر مصدر البيانات المستوردة'); return; }
    create('geometries', { ...g, verified: g.method === 'imported' && g.verified ? 1 : 0, property_id: property.id });
    onClose();
  };
  return <Sheet title="حدود القطعة" onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ</Btn></>}>
    <p className="hint">لا تُرفق إلا بيانات لديك حق استخدامها. الحدود المرسومة يدوياً لا تُعرض للجمهور كحدود موثقة.</p>
    <Field label="النوع"><Seg value={g.method} onChange={(v) => setG({ ...g, method: v })} options={[['imported', 'مستوردة من مصدر'], ['manual', 'رسمتها بنفسي']]} /></Field>
    {g.method === 'imported' && <><Field label="اسم المصدر"><Input value={g.source_name} onChange={(v) => setG({ ...g, source_name: v })} placeholder="مثلاً: مخطط رسمي من..." /></Field>
      <Field label="الترخيص / إذن الاستخدام"><Input value={g.source_license} onChange={(v) => setG({ ...g, source_license: v })} /></Field>
      <Field label="تاريخ البيانات"><input type="date" onChange={(e) => setG({ ...g, source_date: fromDateInput(e.target.value) })} /></Field>
      <Toggle checked={g.verified} onChange={(v) => setG({ ...g, verified: v })} label="بيانات موثقة ومسموح بنشرها" /></>}
    <Field label="ملف GeoJSON"><input type="file" accept=".geojson,.json,application/geo+json" onChange={async (e) => { const f = e.target.files[0]; if (f) setG({ ...g, geojson: await f.text() }); }} /></Field>
    <Field label="أو الصق النص"><TextArea value={g.geojson} onChange={(v) => setG({ ...g, geojson: v })} rows={4} dir="ltr" /></Field>
    {err && <p className="form-msg err">{err}</p>}
  </Sheet>;
}

// ---------- النشر ----------
// النشر وإلغاؤه: منطق واحد تستعمله بطاقة الحالة أعلى العرض
function usePublish(p) {
  const files = useTable('files').filter((f) => f.owner_type === 'property' && f.owner_id === p.id && f.kind === 'photo' && !f.archived_at && !f._pending);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState(null);
  const s = useStore();
  const sel = p.pub_photo_ids || [];
  const problemsLocal = [];
  if (!p.deal) problemsLocal.push('حدد: بيع أم إيجار');
  if (!p.type) problemsLocal.push('حدد نوع العقار');
  if (!p.wilaya_code && !p.moughataa_code) problemsLocal.push('حدد الولاية أو المقاطعة على الأقل');
  if (['sold', 'rented', 'withdrawn'].includes(p.availability)) problemsLocal.push('حالة العرض ليست «متوفر»');
  const doPublish = async () => {
    if (!s.online) { toast('النشر يحتاج اتصالاً بالإنترنت', 'err'); return; }
    setBusy(true); setProblems(null);
    if (!sel.length && files.length) update('properties', p.id, { pub_photo_ids: files.map((f) => f.id) });
    const r = await call('POST', `/properties/${p.id}/publish`, {}, 'نشر');
    setBusy(false);
    if (r.ok) toast(r.data.warnings?.length ? 'نُشر. ' + r.data.warnings.join(' — ') : 'نُشر العرض، ويراه الزوار الآن'); else setProblems(r.data?.problems || [r.data?.message || 'تعذر النشر']);
  };
  const doUnpublish = async () => {
    if (!s.online) { toast('إلغاء النشر يحتاج اتصالاً بالإنترنت', 'err'); return; }
    setBusy(true); const r = await call('POST', `/properties/${p.id}/unpublish`, {}, 'إلغاء النشر'); setBusy(false);
    if (r.ok) toast('أُلغي النشر، ولم يعد الزوار يرونه');
  };
  return { files, sel, busy, problems, problemsLocal, doPublish, doUnpublish };
}

function PublishStatus({ p }) {
  const { busy, problems, problemsLocal, doPublish, doUnpublish } = usePublish(p);
  const pubUrl = `/p/${encodeURIComponent(p.ref)}`;
  if (p.published) return <div className="pub-status on" role="status">
    <div className="pub-label">الحالة: منشور <small>يراه زوار الموقع الآن</small></div>
    <LinkBtn icon="globe" href={pubUrl} target="_blank" rel="noopener">افتح الصفحة العامة</LinkBtn>
    <Btn kind="danger" disabled={busy} onClick={doUnpublish}>{busy ? 'جارٍ…' : 'إلغاء النشر'}</Btn>
  </div>;
  return <div className="pub-status" role="status">
    <div className="pub-label">الحالة: مسودة <small>{problemsLocal.length ? 'لا يراه الزوار. ينقص للنشر: ' + problemsLocal.join('، ') : 'لا يراه الزوار حتى تنشره'}</small></div>
    {problemsLocal.length ? <LinkBtn icon="edit" href={href(`properties/${p.id}/edit`)}>أكمل البيانات</LinkBtn> : <Btn kind="primary" icon="globe" disabled={busy} onClick={doPublish}>{busy ? 'جارٍ…' : 'انشر على الموقع'}</Btn>}
    {problems && <div className="warn-box" style={{ flexBasis: '100%' }}>{problems.map((x) => <div key={x}>{x}</div>)}</div>}
  </div>;
}

function PublishPanel({ p }) {
  const { files, sel } = usePublish(p);
  const set = (patch) => update('properties', p.id, patch);
  return <Section title="خيارات النشر" collapsible defaultOpen={false}>
    <p className="hint">اختر ما يراه الزوار عند النشر. لا يُنشر أبداً: المالك وأرقامه، المصادر، الملاحظات الخاصة، الوثائق، العمولات.</p>
    <Field label="عنوان الإعلان"><Input value={p.pub_title} onChange={(v) => set({ pub_title: v })} placeholder={propertyTitle(p)} /></Field>
    <Field label="وصف الإعلان" hint="إذا تُرك فارغاً يُستعمل «الوصف» من بيانات العرض"><TextArea value={p.pub_description} onChange={(v) => set({ pub_description: v })} rows={3} /></Field>
    <Toggle checked={p.pub_show_price} onChange={(v) => set({ pub_show_price: v })} label="إظهار السعر" hint={p.price_currency === 'unknown' && p.price_amount != null ? 'العملة غير مؤكدة: سيظهر «السعر عند التواصل»' : 'وإلا يظهر «السعر عند التواصل»'} />
    <Toggle checked={p.pub_show_lot} onChange={(v) => set({ pub_show_lot: v })} label="إظهار رقم القطعة" />
    <Toggle checked={p.pub_show_plan} onChange={(v) => set({ pub_show_plan: v })} label="إظهار المخطط والقطاع" />
    <Toggle checked={p.pub_show_landmark} onChange={(v) => set({ pub_show_landmark: v })} label="إظهار المعلم القريب" />
    <Field label="الموقع للجمهور"><Seg value={p.pub_location} onChange={(v) => set({ pub_location: v })} options={[['approximate', 'تقريبي'], ['exact', 'دقيق'], ['hidden', 'مخفي']]} /></Field>
    {p.pub_location === 'exact' && <Toggle checked={p.pub_show_boundary} onChange={(v) => set({ pub_show_boundary: v })} label="إظهار الحدود الموثقة إن وجدت" />}
    {files.length > 0 && <><p className="field-label">الصور المنشورة ({sel.length} من {files.length})</p><Photos ownerType="property" ownerId={p.id} selectable selected={sel} onSelect={(ids) => set({ pub_photo_ids: ids })} /></>}
    {p.published ? <p className="hint">التعديلات المحفوظة تُحدّث الصفحة العامة تلقائياً. إذا أصبح العقار «بيع/أُجّر/سُحب» يُسحب نشره تلقائياً.</p> : null}
  </Section>;
}

// ---------- المطابقة من جهة العرض ----------
function PropertyMatches({ p, open }) {
  const s = useStore();
  const reqs = useTable('requests');
  const staleDays = s.settings?.stale_days || STALE;
  const list = useMemo(() => rankMatches(reqs.filter((r) => !r.archived_at && ['new', 'active'].includes(r.status)).map((r) => ({ r, match: matchRequestProperty(r, p, { staleDays }) })).filter((x) => x.match)), [reqs, p, staleDays]);
  return <Section title="طلبات قد تناسب هذا العرض" count={list.length} collapsible defaultOpen={open || list.length > 0}>
    {!list.length && <p className="muted small">لا توجد طلبات جارية مناسبة.</p>}
    <ul className="matches">{list.map(({ r, match }) => <li key={r.id} className={`match ${match.level}`}>
      <div><span className={`level ${match.level}`}>{LEVEL_LABEL[match.level]}</span> <a href={href('requests/' + r.id)}>طلب {r.ref} — {personLabel(r.person_id) || 'بدون اسم'}</a></div>
      <MatchReasons match={match} />
    </li>)}</ul>
  </Section>;
}

export function MatchReasons({ match }) {
  return <div className="reasons">
    {match.reasons.length > 0 && <div className="r-ok"><b>✓ يتوافق:</b> {match.reasons.join('، ')}</div>}
    {match.diffs.length > 0 && <div className="r-diff"><b>≠ يختلف:</b> {match.diffs.join('، ')}</div>}
    {match.missing.length > 0 && <div className="r-miss"><b>? ناقص:</b> {match.missing.join('، ')}</div>}
  </div>;
}

function SentList({ propertyId }) {
  const sent = useTable('sent_offers').filter((s) => s.property_id === propertyId && !s.archived_at);
  if (!sent.length) return null;
  return <Section title="أُرسل إلى" count={sent.length} collapsible>
    <ul className="plain">{sent.map((s) => <li key={s.id}><a href={href('people/' + s.person_id)}>{personLabel(s.person_id)}</a> · {fmtDate(s.sent_at)} · <b>{SENT_RESPONSE[s.response]}</b></li>)}</ul>
  </Section>;
}

function ShareSheet({ p, onClose }) {
  const settings = useSettings();
  const tpls = useTable('templates').filter((t) => !t.archived_at && t.kind === 'property');
  const [tpl, setTpl] = useState(tpls[0]?.id);
  const text = shareText(p, settings, tpls.find((t) => t.id === tpl)?.body);
  const toast = useToast();
  return <Sheet title="نص المشاركة" onClose={onClose} footer={<><Btn onClick={async () => { try { await navigator.clipboard.writeText(text); toast('نُسخ النص'); } catch { toast('انسخ النص يدوياً', 'err'); } }}>نسخ</Btn><LinkBtn kind="wa" icon="wa" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">مشاركة عبر واتساب</LinkBtn></>}>
    {tpls.length > 1 && <Field label="القالب"><Select value={tpl} onChange={setTpl} options={tpls.map((t) => [t.id, t.title])} /></Field>}
    <pre className="share-preview">{text}</pre>
    <p className="hint">النص يحترم خيارات النشر: السعر ورقم القطعة والمعلم تظهر فقط إن سمحت بها، ولا يتضمن المالك أو المصدر أو ملاحظاتك.{!p.published && ' العرض غير منشور، لذا لا يوجد رابط.'}</p>
  </Sheet>;
}

// ---------- مخطط نواكشوط: العروض على الخريطة مع المقاطعات ورقم القطعة ----------
function PlanMap({ initialQ }) {
  const ref = React.useRef();
  const mapRef = React.useRef();
  const settings = useSettings();
  const props = useTable('properties');
  const moughataas = useTable('moughataas');
  const plans = useTable('plans');
  const [q, setQ] = useState(initialQ || '');
  const [msg, setMsg] = useState(null);
  const [hits, setHits] = useState([]);
  const [opacity, setOpacity] = useState(0.85);
  const live = useMemo(() => props.filter((p) => !p.archived_at), [props]);
  const placed = live.filter((p) => p.lat != null);
  // العروض بلا موقع على الخريطة تُعدّ في مقاطعتها
  const counts = useMemo(() => {
    const c = {};
    for (const p of live) { const z = NKC_ZONES[p.moughataa_code] ? p.moughataa_code : zoneAt(p.lat, p.lng); if (z) c[z] = (c[z] || 0) + 1; }
    return c;
  }, [live]);
  const unplaced = live.filter((p) => p.lat == null && NKC_ZONES[p.moughataa_code]).length;
  useEffect(() => {
    let map; let layer;
    loadLeaflet().then((L) => {
      if (!ref.current) return;
      map = L.map(ref.current).setView(settings.map_center || [18.0858, -15.9785], 12);
      tileLayer(L, settings).addTo(map); map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution('حدود المقاطعات تقريبية: geoBoundaries / OCHA');
      zonesLayer(L, { names: zoneNames(moughataas), counts }).addTo(map);
      const pl = attachPlans(L, map, plans, { opacity });
      layer = L.layerGroup().addTo(map);
      const markers = {};
      for (const p of placed) {
        const mk = L.marker([p.lat, p.lng], { icon: pinIcon(L, p.availability === 'available' ? '#0e5a4c' : '#8a8f8d') }).addTo(layer).on('click', () => go('properties/' + p.id));
        const lbl = p.lot_number ? `${p.lot_number}${p.sector ? ' / ' + p.sector : ''}` : p.ref;
        mk.bindTooltip(lbl, { permanent: true, direction: 'top', offset: [0, -28], className: 'lot-label' });
        markers[p.id] = mk;
      }
      mapRef.current = { map, markers, L, pl, found: L.layerGroup().addTo(map) };
      setTimeout(() => map.invalidateSize(), 200);
    });
    return () => map?.remove();
  }, [placed.length, moughataas.length, plans.map((p) => p.id + p.visible + (p.archived_at || '')).join()]); // eslint-disable-line
  useEffect(() => { mapRef.current?.pl?.setOpacity(opacity); }, [opacity]);
  const [lotInfo, setLotInfo] = useState(null);
  const showLot = (h) => {
    const m = mapRef.current; if (!m) return;
    m.found.clearLayers();
    m.L.marker([h.lat, h.lng], { icon: pinIcon(m.L, '#7a4ab8') }).addTo(m.found)
      .bindTooltip(`قطعة ${h.lot} · ${planLabel(h.plan)}${h.status_label ? ' · ' + h.status_label : ''}`, { permanent: true, direction: 'top', offset: [0, -28], className: 'lot-label' });
    if (h.shape) {
      // حدود القطعة وطول كل ضلع على منتصفه
      m.L.polygon(h.shape.poly, { color: '#7a4ab8', weight: 2, fillOpacity: 0.15 }).addTo(m.found);
      h.shape.poly.forEach((p, i) => {
        const q = h.shape.poly[(i + 1) % h.shape.poly.length];
        if (h.shape.sides[i] < 2) return;
        m.L.marker([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], { icon: m.L.divIcon({ className: 'lot-side', html: `<span>${(Math.round(h.shape.sides[i] * 10) / 10).toLocaleString('ar-u-nu-latn')} م</span>`, iconSize: null }), interactive: false }).addTo(m.found);
      });
      m.map.fitBounds(m.L.latLngBounds(h.shape.poly).pad(0.6), { maxZoom: 20 });
    } else m.map.setView([h.lat, h.lng], 18);
    setLotInfo({ h, elev: null });
    // صندوق المعلومات يُزيح الخريطة: نعيد الضبط بعد ظهوره
    // وعلى الهاتف يمتد إطار الخريطة تحت حافة الشاشة: نضع القطعة في الجزء الظاهر منها
    setTimeout(() => {
      m.map.invalidateSize();
      const r = m.map.getContainer().getBoundingClientRect();
      const hidden = Math.max(0, Math.min(r.height - 120, r.bottom - window.innerHeight + 80));
      const b = h.shape ? m.L.latLngBounds(h.shape.poly).pad(0.6) : m.L.latLng(h.lat, h.lng).toBounds(60);
      m.map.fitBounds(b, { maxZoom: h.shape ? 20 : 18, paddingTopLeft: [10, 30], paddingBottomRight: [10, hidden + 10] });
    }, 60);
    const pts = [[h.lat, h.lng], ...(h.shape?.poly || [])];
    api('GET', '/elevation?pts=' + pts.map((p) => p.map((x) => x.toFixed(6)).join(',')).join(';')).then((r) => {
      const e = r.ok ? r.data.elevations.filter((x) => x != null) : [];
      // الوسيط: النموذج يشمل المباني، فقيمة نقطة واحدة قد تكون سطح بيت
      const med = [...e].sort((x, y) => x - y)[Math.floor(e.length / 2)];
      if (e.length) setLotInfo((cur) => (cur?.h === h ? { h, elev: med } : cur));
    }).catch(() => {});
  };
  const find = (e) => {
    e?.preventDefault();
    const nq = norm(q);
    // «57 المنارة» أو «F9 561»: الرقم وحده، والكلمات الباقية اسم المخطط أو المنطقة
    const pq = parseLotQuery(q);
    const lot = normLot(pq.lot || (/\d/.test(q) ? q : ''));
    if (!lot && !nq) return;
    const res = searchPlanLots(plans, q, { moughataas });
    const ph = res.hits;
    setHits(ph);
    if (ph.length) showLot(ph[0]); else { setLotInfo(null); mapRef.current?.found.clearLayers(); }
    const notes = [];
    if (res.unmatched) notes.push(`لم نجد مخططاً أو منطقة باسم «${res.rest}» فيها هذه القطعة؛ هذه كل القطع بالرقم ${res.lot}.`);
    const nameOk = (p) => !pq.rest || [p.plan, p.sector, p.area_text, moughataas.find((m) => m.code === p.moughataa_code)?.name_ar].some((x) => x && norm(x).includes(norm(pq.rest)));
    let found = live.filter((p) => (lot && p.lot_norm === lot && nameOk(p)) || norm(p.ref) === nq);
    if (!found.length && lot && pq.rest) found = live.filter((p) => p.lot_norm === lot);
    const onMap = found.filter((p) => p.lat != null);
    const m = mapRef.current;
    if (!found.length) notes.push(ph.length ? '' : pq.lot ? `لا توجد قطعة بالرقم ${pq.lot} في المخططات المضافة ولا في العروض.` : 'اكتب رقم القطعة، ويمكن إضافة اسم المخطط أو المنطقة، مثل: 57 المنارة.');
    else if (!onMap.length) notes.push(`وُجد ${found.length} عرض بهذا الرقم لكن بلا موقع على الخريطة.`);
    else if (ph.length) notes.push(`وأيضاً ${onMap.length} عرض مسجل بهذا الرقم: ${onMap.map((p) => lotLabel(p) || p.ref).join('، ')}`);
    else if (m) {
      m.map.setView([onMap[0].lat, onMap[0].lng], 17);
      notes.push(onMap.length > 1 ? `${onMap.length} عروض بهذا الرقم (في مخططات/قطاعات مختلفة): ${onMap.map((p) => lotLabel(p) || p.ref).join('، ')}` : lotLabel(onMap[0]) || onMap[0].ref);
    }
    setMsg(notes.filter(Boolean).join(' ') || null);
  };
  // فتح الشاشة من البحث الموحد بقطعة محددة
  const ran = React.useRef(false);
  useEffect(() => {
    if (ran.current || !initialQ) return;
    const t = setInterval(() => { if (mapRef.current) { clearInterval(t); ran.current = true; find(); } }, 100);
    return () => clearInterval(t);
  }, [initialQ, plans.length]); // eslint-disable-line
  return <div className="page">
    <div className="page-head"><h1>مخطط نواكشوط</h1><Btn onClick={() => go('properties')}>القائمة</Btn></div>
    <form className="inline-form map-tools" onSubmit={find}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="رقم القطعة، ويمكن إضافة المخطط أو المنطقة: 57 المنارة" aria-label="رقم القطعة" dir="auto" />
      <Btn small type="submit">اعرض</Btn>
    </form>
    {hits.length > 0 && <div className="plan-hits">{hits.length > 1 && <small className="muted">{hitPlanCount(hits) > 1 ? `الرقم موجود في ${hitPlanCount(hits)} مخططات:` : `الرقم مكرر ${hits.length} مرات في المخطط:`}</small>}{hits.map((h, i) => <button type="button" key={i} className="chip" onClick={() => showLot(h)}>قطعة {h.lot} · {planLabel(h.plan)}{hitTag(hits, i)}{h.shape ? ` · ${h.shape.area.toLocaleString('ar-u-nu-latn')} م²` : ''}{h.status_label ? ` (${h.status_label})` : ''}</button>)}</div>}
    {lotInfo && <div className="lot-info">
      <b>قطعة {lotInfo.h.lot} · {planLabel(lotInfo.h.plan)}</b>
      {lotInfo.h.shape ? <span>المساحة {shapeText(lotInfo.h.shape)}</span> : <span className="muted">حدود القطعة غير متوفرة في هذا المخطط</span>}
      {lotInfo.elev != null && <span>الارتفاع التقريبي عن سطح البحر: {(Math.round(lotInfo.elev * 2) / 2).toLocaleString('ar-u-nu-latn')} م</span>}
      <small className="muted">الأضلاع والمساحة محسوبة من خطوط المخطط، والارتفاع من نموذج Copernicus (دقته بضعة أمتار): للاسترشاد وليست وثيقة رسمية.</small>
    </div>}
    {msg && <p className="form-msg">{msg}</p>}
    <div ref={ref} className="map map-plan" />
    {plans.some((p) => !p.archived_at && p.image_file_id) && <label className="inline-check opacity-ctl">شفافية المخططات <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></label>}
    <p className="hint">الأرقام بجانب أسماء المقاطعات = عدد العروض فيها. فوق كل علامة: رقم القطعة / القطاع. اضغط العلامة لفتح العرض. مخططات التجزئة تظهر عند التقريب داخل إطارها، وتُضاف من الإعدادات.{unplaced > 0 && ` ${unplaced} عرض في نواكشوط بلا موقع على الخريطة.`} حدود المقاطعات تقريبية وليست حدوداً عقارية رسمية.</p>
  </div>;
}

// ---------- نموذج الإضافة/التعديل ----------
export function PropertyForm({ initial, onDone }) {
  const isNew = !initial;
  const [v, setV] = useState(() => initial ? { ...initial } : { deal: null, type: null, availability: 'available', price_currency: 'unknown', price_basis: 'total', features: [], pub_location: 'approximate', pub_show_price: 1, pub_show_plan: 1, pub_show_landmark: 1, verified_at: new Date().toISOString(), location_precision: 'none' });
  const [showMap, setShowMap] = useState(false);
  const [owner, setOwner] = useState(initial?.owner_person_id || null);
  const set = (p) => setV((x) => ({ ...x, ...p }));
  const dups = useMemo(() => (v.lot_number || v.lat != null) ? propertyDuplicates(storeSnapshot(), { lot_number: v.lot_number, plan: v.plan, sector: v.sector, moughataa_code: v.moughataa_code, lat: v.lat, lng: v.lng, type: v.type, excludeId: initial?.id }) : [], [v.lot_number, v.plan, v.sector, v.moughataa_code, v.lat, v.lng, v.type]);
  const FIELDS = ['deal', 'type', 'title', 'description', 'wilaya_code', 'moughataa_code', 'area_id', 'area_text', 'landmark', 'location_desc', 'lat', 'lng', 'location_method', 'location_precision', 'plan', 'sector', 'lot_number', 'area_m2', 'frontage', 'bedrooms', 'bathrooms', 'floors', 'features', 'price_raw', 'price_amount', 'price_currency', 'price_basis', 'price_negotiable', 'price_terms', 'availability', 'verified_at', 'internal_notes', 'pub_location', 'pub_show_price', 'pub_show_plan', 'pub_show_landmark'];
  const save = () => {
    const body = { owner_person_id: owner };
    for (const k of FIELDS) if (isNew ? v[k] !== undefined : JSON.stringify(v[k]) !== JSON.stringify(initial[k])) body[k] = v[k];
    if (isNew) {
      const id = create('properties', body);
      if (owner) create('property_sources', { property_id: id, person_id: owner, relation: 'owner', price_raw: v.price_raw || '', price_amount: v.price_amount ?? null, price_currency: v.price_currency, price_basis: v.price_basis, verified_at: v.verified_at });
      onDone(id);
    } else {
      if (owner === initial.owner_person_id) delete body.owner_person_id;
      if (Object.keys(body).length) update('properties', initial.id, body);
      onDone(initial.id);
    }
  };
  const f = fieldsFor(v.type, v.deal);
  // تغيير النوع أو العملية يُفرغ القيم التي لم تعد مناسبة (الغرف لأرض، النمرة لإيجار شقة…)
  const choose = (patch) => setV((x) => { const n = { ...x, ...patch }; return { ...n, ...cleanupFor(n) }; });
  // اقتراحات المخطط والقطاع من العروض المسجلة في المقاطعة نفسها فقط
  const plans = useTable('plans');
  const known = useMemo(() => {
    const ps = table('properties').filter((p) => !p.archived_at && v.moughataa_code && p.moughataa_code === v.moughataa_code);
    const uniq = (k) => [...new Set(ps.map((p) => p[k]).filter(Boolean))].slice(0, 30);
    const fromPlans = plans.filter((p) => !p.archived_at && (!v.moughataa_code || !p.moughataa_code || p.moughataa_code === v.moughataa_code)).map(planLabel);
    return { plans: [...new Set([...fromPlans, ...uniq('plan')])], sectors: uniq('sector') };
  }, [v.moughataa_code, plans]);
  // رقم القطعة موجود في مخطط مستورد ← نقترح وضع الموقع عليها مباشرة
  const planHits = useMemo(() => (f.lot && v.lot_number ? findPlanLots(plans, v.lot_number, { plan: v.plan, moughataa_code: v.moughataa_code }) : []), [f.lot, v.lot_number, v.plan, v.moughataa_code, plans]);
  const onPlanLot = (h) => v.lat != null && Math.abs(v.lat - h.lat) < 2e-5 && Math.abs(v.lng - h.lng) < 2e-5;
  const usePlanLot = (h) => {
    const mc = v.moughataa_code || h.plan.moughataa_code || zoneAt(h.lat, h.lng);
    const wc = mc ? table('moughataas').find((m) => m.code === mc)?.wilaya_code : v.wilaya_code;
    set({ lat: h.lat, lng: h.lng, location_method: 'plan', location_precision: 'exact', plan: v.plan || planLabel(h.plan), moughataa_code: mc || null, wilaya_code: wc || v.wilaya_code || null, ...(h.shape && v.area_m2 == null ? { area_m2: h.shape.area } : {}) });
  };
  const extraCount = ['title', 'landmark', 'location_desc', 'frontage', 'bathrooms', 'floors', 'price_raw', 'price_terms', 'description'].filter((k) => v[k] != null && v[k] !== '').length + (v.features?.length ? 1 : 0) + (v.price_negotiable ? 1 : 0);
  return <div className="page form-page">
    <div className="page-head"><h1>{isNew ? 'عرض جديد' : `تعديل ${initial.ref}`}</h1></div>
    <p className="hint">لا شيء إلزامي للحفظ. سجّل ما تعرفه الآن وأكمل لاحقاً.</p>
    <fieldset className="fieldset"><legend>العرض</legend>
      <Field label="بيع أم إيجار؟"><Seg value={v.deal} onChange={(x) => choose({ deal: x })} options={Object.entries(DEALS)} allowNone /></Field>
      <Field label="نوع العقار"><div className="chips">{Object.entries(TYPES).map(([k, l]) => <button type="button" key={k} className={v.type === k ? 'chip on' : 'chip'} aria-pressed={v.type === k} onClick={() => choose({ type: v.type === k ? null : k })}>{l}</button>)}</div></Field>
    </fieldset>
    <fieldset className="fieldset"><legend>المكان</legend>
      <GeoFields value={v} onChange={set} />
      {f.lot && <div className="grid3">
        <Field label="المخطط"><Input value={v.plan} onChange={(x) => set({ plan: x })} list="dl-plans" /></Field>
        <Field label="القطاع / الحرف"><Input value={v.sector} onChange={(x) => set({ sector: x })} list="dl-sectors" /></Field>
        <Field label="رقم القطعة (النمرة)"><Input value={v.lot_number} onChange={(x) => set({ lot_number: x })} dir="auto" /></Field>
        <datalist id="dl-plans">{known.plans.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-sectors">{known.sectors.map((x) => <option key={x} value={x} />)}</datalist>
      </div>}
      {planHits.length > 0 && <div className="plan-hits">
        {planHits.some(onPlanLot)
          ? <small className="ok-text">✓ الموقع على القطعة {v.lot_number} من مخطط «{planLabel(planHits.find(onPlanLot).plan)}»{planHits.find(onPlanLot).status_label ? ` · ${planHits.find(onPlanLot).status_label}` : ''}{planHits.find(onPlanLot).shape ? ` · ${shapeText(planHits.find(onPlanLot).shape)}` : ''}</small>
          : <>
            <small className="muted">القطعة {v.lot_number} موجودة في {planHits.length > 1 ? `${hitPlanCount(planHits) > 1 ? `${hitPlanCount(planHits)} مخططات` : 'أكثر من موضع'}، اختر الصحيح:` : 'مخطط مستورد:'}</small>
            {planHits.map((h, i) => <button type="button" key={i} className="chip" onClick={() => usePlanLot(h)}>ضع الموقع على القطعة · {planLabel(h.plan)}{hitTag(planHits, i)}{h.status_label ? ` (${h.status_label})` : ''}</button>)}
          </>}
      </div>}
      <div className="row-actions"><Btn icon="pin" onClick={() => setShowMap(true)}>{v.lat != null ? `على الخريطة: ${v.lat.toFixed(4)}, ${v.lng.toFixed(4)} (${v.location_precision === 'exact' ? 'دقيق' : 'تقريبي'})` : 'حدد على الخريطة (اختياري)'}</Btn></div>
    </fieldset>
    <fieldset className="fieldset"><legend>المواصفات</legend>
      <div className="grid2">
        <Field label="المساحة بالمتر المربع"><NumInput value={v.area_m2} onChange={(x) => set({ area_m2: x })} placeholder="مثلاً 300" /></Field>
        {f.rooms && <Field label="عدد الغرف"><NumInput value={v.bedrooms} onChange={(x) => set({ bedrooms: x })} /></Field>}
      </div>
      {dups.length > 0 && <div className="warn-box"><b>قد يكون مسجلاً من قبل:</b><ul>{dups.map((d) => <li key={d.id}>{d.reason}: <a href={href('properties/' + d.id)} target="_blank" rel="noopener">{d.ref}</a></li>)}</ul><small>إن كان العقار نفسه من مصدر آخر، أضفه «مصدراً» للعرض الموجود.</small></div>}
    </fieldset>
    <PriceFields value={v} onChange={set} simple />
    <fieldset className="fieldset"><legend>المالك وملاحظاتك</legend>
      <PersonPicker value={owner} onChange={setOwner} label="المالك (إن عُرف)" roles={['owner', 'seller']} />
      <Field label="ملاحظات خاصة (لا تُنشر أبداً)"><TextArea value={v.internal_notes} onChange={(x) => set({ internal_notes: x })} rows={2} /></Field>
    </fieldset>
    <details className="more-details">
      <summary>تفاصيل إضافية {extraCount ? <small>({extraCount} معبأة)</small> : <small>(اختيارية)</small>}</summary>
      {(f.frontage || f.baths || f.floors) && <div className="grid3">
        {f.frontage && <Field label="الواجهة / الأبعاد"><Input value={v.frontage} onChange={(x) => set({ frontage: x })} placeholder="مثلاً 20×30" /></Field>}
        {f.baths && <Field label="الحمامات"><NumInput value={v.bathrooms} onChange={(x) => set({ bathrooms: x })} /></Field>}
        {f.floors && <Field label="الطوابق"><NumInput value={v.floors} onChange={(x) => set({ floors: x })} /></Field>}
      </div>}
      {f.features.length > 0 && <Field label="مميزات"><Chips value={v.features} onChange={(x) => set({ features: x })} options={f.features.map((k) => [k, FEATURES[k]])} /></Field>}
      <div className="grid2">
        <Field label="معلم قريب"><Input value={v.landmark} onChange={(x) => set({ landmark: x })} placeholder="مثلاً: قرب كارفور مدريد" /></Field>
        <Field label="وصف المكان"><Input value={v.location_desc} onChange={(x) => set({ location_desc: x })} placeholder="الشارع الثاني بعد المسجد…" /></Field>
      </div>
      <PriceFields value={v} onChange={set} detailsOnly />
      <Toggle checked={v.price_negotiable} onChange={(x) => set({ price_negotiable: x })} label="السعر قابل للتفاوض" />
      <Field label="شروط الدفع"><Input value={v.price_terms} onChange={(x) => set({ price_terms: x })} placeholder="مثلاً: دفعة أولى، أقساط…" /></Field>
      <div className="grid2">
        <Field label="حالة العرض"><Select value={v.availability} onChange={(x) => set({ availability: x || 'unknown' })} options={Object.entries(AVAILABILITY)} /></Field>
        <Field label="آخر تأكد من التوفر والسعر"><input type="date" value={toDateInput(v.verified_at)} onChange={(e) => set({ verified_at: fromDateInput(e.target.value) })} /></Field>
      </div>
      <Field label="اسم داخلي للعرض"><Input value={v.title} onChange={(x) => set({ title: x })} placeholder={propertyTitle(v)} /></Field>
      <Field label="وصف للزوار (يظهر عند النشر)"><TextArea value={v.description} onChange={(x) => set({ description: x })} rows={3} /></Field>
    </details>
    <div className="form-actions sticky"><Btn onClick={() => back('properties')}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ العرض</Btn></div>
    {showMap && <MapPicker value={v} onSave={set} onClose={() => setShowMap(false)} />}
  </div>;
}
