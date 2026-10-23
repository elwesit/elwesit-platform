import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTable, create, update, archive, uploadFile, fileUrl, blobGet, storeSnapshot, getRow, useStore, uuid } from './data.js';
import { Btn, Field, Input, NumInput, Select, Seg, Sheet, Icon, TextArea, useToast, LinkBtn, Section } from './ui.jsx';
import { personLabel, phonesOf, waUrl, telUrl, displayPhone, fmtDateTime, relDay, daysFrom, toLocalInput, fromLocalInput, ago, fmtTime } from './fmt.js';
import { personDuplicates } from '@shared/search.js';
import { currencyReadings, formatAmountWords, PRICE_BASIS } from '@shared/money.js';
import { ACTIVITY_KINDS, ROLES } from '@shared/vocab.js';
import { href, go } from './router.js';
import { norm } from '@shared/text.js';

// ---------- اختيار شخص (أو إنشاء جديد مع تنبيه التكرار) ----------
export function PersonPicker({ value, onChange, label = 'الشخص', roles = [], allowNew = true }) {
  const people = useTable('people');
  const phones = useTable('phones');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const current = value && people.find((p) => p.id === value);
  const results = useMemo(() => {
    const nq = norm(q); const d = q.replace(/\D/g, '');
    if (nq.length < 1 && d.length < 3) return [];
    return people.filter((p) => !p.archived_at && !p.merged_into && ((nq && norm(p.name + ' ' + p.name_alt).includes(nq)) || (d.length >= 3 && phones.some((ph) => ph.person_id === p.id && ph.normalized?.includes(d))))).slice(0, 8);
  }, [q, people, phones]);
  if (current) return <Field label={label}><div className="picked"><a href={href('people/' + current.id)}>{current.name || 'بدون اسم'}</a><small className="muted">{phonesOf(current.id).map((p) => p.raw).join(' · ')}</small><button type="button" className="icon-btn" aria-label="تغيير" onClick={() => onChange(null)}><Icon name="close" size={16} /></button></div></Field>;
  return <Field label={label}>
    <div className="picker">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الهاتف" />
      {results.length > 0 && <ul className="picker-list">{results.map((p) => <li key={p.id}><button type="button" onClick={() => { onChange(p.id); setQ(''); }}><b>{p.name || 'بدون اسم'}</b> <small>{phonesOf(p.id).map((x) => x.raw).join(' · ')}</small></button></li>)}</ul>}
      {allowNew && <button type="button" className="linklike" onClick={() => setAdding(true)}>+ شخص جديد{q && !/^\d/.test(q) ? ` «${q}»` : ''}</button>}
    </div>
    {adding && <NewPersonSheet initialName={/^\d/.test(q) ? '' : q} initialPhone={/^\d/.test(q) ? q : ''} roles={roles} onClose={() => setAdding(false)} onCreated={(id) => { onChange(id); setAdding(false); setQ(''); }} />}
  </Field>;
}

export function NewPersonSheet({ initialName = '', initialPhone = '', roles = [], onClose, onCreated }) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [rs, setRs] = useState(roles);
  const dups = useMemo(() => personDuplicates(storeSnapshot(), { name, phone }), [name, phone]);
  const save = () => {
    const id = create('people', { name: name.trim(), roles: rs });
    if (phone.trim()) create('phones', { person_id: id, raw: phone.trim(), whatsapp: true });
    onCreated(id);
  };
  return <Sheet title="شخص جديد" onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={save} disabled={!name.trim() && !phone.trim()}>حفظ</Btn></>}>
    <Field label="الاسم"><Input value={name} onChange={setName} autoFocus /></Field>
    <Field label="الهاتف"><Input value={phone} onChange={setPhone} type="tel" inputMode="tel" dir="ltr" /></Field>
    <RolesPicker value={rs} onChange={setRs} />
    {dups.length > 0 && <div className="warn-box"><b>تنبيه تكرار محتمل:</b><ul>{dups.map((d) => <li key={d.id}>{d.reason}: <button type="button" className="linklike" onClick={() => onCreated(d.id)}>{d.name || 'بدون اسم'} — استخدم هذا الشخص</button></li>)}</ul><small>لن يُدمج أي شيء تلقائياً.</small></div>}
  </Sheet>;
}

export function RolesPicker({ value = [], onChange }) {
  const set = new Set(value);
  return <Field label="الأدوار"><div className="chips">{Object.entries(ROLES).map(([k, l]) => <button type="button" key={k} className={set.has(k) ? 'chip on' : 'chip'} aria-pressed={set.has(k)} onClick={() => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); onChange([...n]); }}>{l}</button>)}</div></Field>;
}

// ---------- الموقع الإداري: ولاية ← مقاطعة ← حي (مع اقتراحات وإدخال حر) ----------
export function GeoFields({ value, onChange }) {
  const wilayas = useTable('wilayas');
  const moughataas = useTable('moughataas');
  const areas = useTable('areas');
  const ms = moughataas.filter((m) => !value.wilaya_code || m.wilaya_code === value.wilaya_code).sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
  const [areaQ, setAreaQ] = useState('');
  const curArea = value.area_id && areas.find((a) => a.id === value.area_id);
  const sugg = useMemo(() => {
    const q = norm(areaQ || value.area_text || '');
    if (!q) return [];
    // أحياء المقاطعة المختارة فقط (والأحياء غير المربوطة بمقاطعة)، لا أحياء المقاطعات الأخرى
    const inScope = (a) => (value.moughataa_code ? !a.moughataa_code || a.moughataa_code === value.moughataa_code : !value.wilaya_code || !a.wilaya_code || a.wilaya_code === value.wilaya_code);
    return areas.filter((a) => !a.archived_at && inScope(a) && [a.name, ...(a.aliases || [])].some((n) => norm(n).includes(q))).slice(0, 6);
  }, [areaQ, value.area_text, areas, value.moughataa_code, value.wilaya_code]);
  // حي محفوظ لا يتبع المقاطعة/الولاية الجديدة يُفرَّغ
  const areaFits = (a, m, w) => !a || ((!m || !a.moughataa_code || a.moughataa_code === m) && (!w || !a.wilaya_code || a.wilaya_code === w));
  return <div className="grid2">
    <Field label="الولاية"><Select value={value.wilaya_code} onChange={(v) => { const m = v && value.moughataa_code && moughataas.find((x) => x.code === value.moughataa_code)?.wilaya_code !== v ? null : value.moughataa_code; onChange({ wilaya_code: v, moughataa_code: m, ...(areaFits(curArea, m, v) ? {} : { area_id: null, area_text: '' }) }); }} placeholder="—" options={[...wilayas].sort((a, b) => a.sort - b.sort).map((w) => [w.code, w.name_ar])} /></Field>
    <Field label="المقاطعة"><Select value={value.moughataa_code} onChange={(v) => { const w = v ? moughataas.find((m) => m.code === v)?.wilaya_code : value.wilaya_code; onChange({ moughataa_code: v, wilaya_code: w, ...(areaFits(curArea, v, w) ? {} : { area_id: null, area_text: '' }) }); }} placeholder="—" options={ms.map((m) => [m.code, m.name_ar])} /></Field>
    <Field label="الحي / المنطقة" hint={curArea ? 'من قائمة الأحياء المحفوظة' : 'اكتب كما يُعرف في السوق'} wide>
      {curArea ? <div className="picked"><span>{curArea.name}</span><button type="button" className="icon-btn" aria-label="تغيير" onClick={() => onChange({ area_id: null, area_text: curArea.name })}><Icon name="close" size={16} /></button></div> : <div className="picker">
        <input value={value.area_text || ''} onChange={(e) => { setAreaQ(e.target.value); onChange({ area_text: e.target.value }); }} placeholder="مثلاً: سوكوجيم، كارفور مدريد، بلوكات" />
        {sugg.length > 0 && <ul className="picker-list">{sugg.map((a) => <li key={a.id}><button type="button" onClick={() => { onChange({ area_id: a.id, area_text: a.name, moughataa_code: a.moughataa_code || value.moughataa_code, wilaya_code: a.wilaya_code || value.wilaya_code }); setAreaQ(''); }}>{a.name}{a.aliases?.length ? <small> ({a.aliases.join('، ')})</small> : null}</button></li>)}</ul>}
        {value.area_text && !sugg.some((a) => norm(a.name) === norm(value.area_text)) && <button type="button" className="linklike" onClick={() => { const id = create('areas', { name: value.area_text.trim(), aliases: [], kind: 'area', wilaya_code: value.wilaya_code || null, moughataa_code: value.moughataa_code || null }); onChange({ area_id: id }); }}>+ احفظ «{value.area_text}» في قائمة الأحياء{value.moughataa_code ? ' (تابع للمقاطعة المختارة)' : ''}</button>}
      </div>}
    </Field>
  </div>;
}

// ---------- السعر: القيمة + العملة (والنص كما ورد والأساس في وضع التفاصيل) ----------
// simple: القيمة والعملة فقط؛ الأساس يتبع العملية تلقائياً (إيجار = شهري) ويُعدَّل من «تفاصيل إضافية»
export function PriceFields({ prefix = 'price', value, onChange, label = 'السعر', simple = false, detailsOnly = false }) {
  const raw = value[`${prefix}_raw`] ?? '';
  const amount = value[`${prefix}_amount`];
  const currency = value[`${prefix}_currency`] || 'unknown';
  const basis = value[`${prefix}_basis`] || 'total';
  const readings = amount != null ? currencyReadings(amount) : [];
  const rawF = <Field label="السعر كما قيل (نص)" hint="يُحفظ كما هو للرجوع إليه"><Input value={raw} onChange={(v) => onChange({ [`${prefix}_raw`]: v })} placeholder="مثلاً: 70 مليون" /></Field>;
  const basisF = <Field label="السعر محسوب على"><Select value={basis} onChange={(v) => onChange({ [`${prefix}_basis`]: v || 'total' })} options={Object.entries(PRICE_BASIS)} /></Field>;
  if (detailsOnly) return <div className="grid2">{rawF}{basisF}</div>;
  const basisNote = basis !== 'total' ? ` (${PRICE_BASIS[basis]})` : '';
  return <fieldset className="fieldset"><legend>{label}{simple ? basisNote : ''}</legend>
    <div className="grid2">
      {!simple && rawF}
      <Field label="المبلغ بالأرقام" hint={amount != null ? formatAmountWords(amount) : 'اتركه فارغاً إن لم يُعرف بعد'}><NumInput value={amount} onChange={(v) => onChange({ [`${prefix}_amount`]: v })} placeholder="مثلاً 3000000" /></Field>
    </div>
    <Field label="العملة"><Seg value={currency} onChange={(v) => onChange({ [`${prefix}_currency`]: v })} options={[['MRU', 'أوقية جديدة'], ['MRO', 'أوقية قديمة'], ['unknown', 'لا أعرف']]} /></Field>
    {amount != null && currency === 'unknown' && <div className="warn-box small">اختر العملة: {readings.map((r) => <span key={r.currency}><b>{r.label}</b> {r.hint}؛ </span>)} بدونها لا يُنشر السعر ولا يدخل في المطابقة.</div>}
    {amount != null && currency !== 'unknown' && <small className="hint">= {currency === 'MRO' ? `${formatAmountWords(amount / 10)} أوقية جديدة` : `${formatAmountWords(amount * 10)} أوقية قديمة`}</small>}
    {!simple && basisF}
  </fieldset>;
}

// ---------- الخطوة التالية (مهمة مفتوحة مرتبطة بالسجل) ----------
export function NextStep({ link, defaultTitle = 'متابعة' }) {
  const tasks = useTable('tasks');
  const open = tasks.filter((t) => !t.archived_at && !t.done_at && Object.entries(link).every(([k, v]) => t[k] === v)).sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  const [editing, setEditing] = useState(null);
  const t = open[0];
  return <div className="nextstep">
    {t ? <div className="nextstep-row">
      <div><b>الخطوة التالية:</b> {t.title} <span className={new Date(t.due_at) < new Date() ? 'late' : 'muted'}>{t.due_at ? `— ${relDay(t.due_at)}${t.due_has_time ? ' ' + fmtTime(t.due_at) : ''}` : ''}</span></div>
      <div className="row-actions">
        <Btn small icon="check" onClick={() => update('tasks', t.id, { done_at: new Date().toISOString() })}>تم</Btn>
        <Postpone task={t} />
        <Btn small kind="ghost" icon="edit" onClick={() => setEditing(t)} aria-label="تعديل" />
      </div>
      {open.length > 1 && <small className="muted">و{open.length - 1} مهام أخرى</small>}
    </div> : <div className="nextstep-row empty-step"><span className="muted">لا توجد خطوة تالية محددة</span><Btn small kind="primary" icon="plus" onClick={() => setEditing({ title: defaultTitle, due_at: daysFrom(1, 10), due_has_time: 1 })}>حدد الخطوة التالية</Btn></div>}
    {editing && <TaskSheet task={editing} link={link} onClose={() => setEditing(null)} />}
  </div>;
}

export function Postpone({ task }) {
  const [open, setOpen] = useState(false);
  const toDay = (n) => {
    const d = task.due_at ? new Date(task.due_at) : new Date();
    const base = new Date(daysFrom(n, task.due_has_time ? d.getUTCHours() : 9));
    if (task.due_has_time) base.setUTCMinutes(d.getUTCMinutes());
    update('tasks', task.id, { due_at: base.toISOString() });
    setOpen(false);
  };
  return <span className="postpone">
    <Btn small icon="clock" onClick={() => setOpen(!open)} aria-expanded={open}>تأجيل</Btn>
    {open && <span className="pop"><button onClick={() => toDay(1)}>غداً</button><button onClick={() => toDay(3)}>3 أيام</button><button onClick={() => toDay(7)}>أسبوع</button></span>}
  </span>;
}

export function TaskSheet({ task, link = {}, onClose }) {
  const [t, setT] = useState({ ...task });
  const save = () => {
    const body = { title: t.title, due_at: t.due_at, due_has_time: t.due_has_time ? 1 : 0, notes: t.notes || '' };
    if (task.id) update('tasks', task.id, body); else create('tasks', { ...body, ...link });
    onClose();
  };
  return <Sheet title={task.id ? 'تعديل المتابعة' : 'الخطوة التالية'} onClose={onClose} footer={<>{task.id && <Btn kind="ghost" onClick={() => { archive('tasks', task.id); onClose(); }}>حذف</Btn>}<Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={save} disabled={!t.title?.trim()}>حفظ</Btn></>}>
    <Field label="ماذا ستفعل؟"><Input value={t.title} onChange={(v) => setT({ ...t, title: v })} /></Field>
    <div className="quick-dates">{[['اليوم', 0], ['غداً', 1], ['بعد 3 أيام', 3], ['بعد أسبوع', 7]].map(([l, n]) => <button type="button" key={n} className="chip" onClick={() => setT({ ...t, due_at: daysFrom(n, t.due_has_time ? new Date(t.due_at || daysFrom(0, 10)).getUTCHours() : 9) })}>{l}</button>)}</div>
    <Field label="الموعد (بتوقيت نواكشوط)"><input type="datetime-local" value={toLocalInput(t.due_at)} onChange={(e) => setT({ ...t, due_at: fromLocalInput(e.target.value), due_has_time: 1 })} /></Field>
    <Field label="ملاحظة"><TextArea value={t.notes} onChange={(v) => setT({ ...t, notes: v })} rows={2} /></Field>
  </Sheet>;
}

// ---------- إجراءات سريعة للتواصل ----------
export function ContactActions({ personId, waText, link = {}, compact }) {
  const phones = phonesOf(personId);
  const [logged, setLogged] = useState(false);
  const [after, setAfter] = useState(false);
  const toast = useToast();
  const p = phones.find((x) => x.whatsapp) || phones[0];
  if (!personId) return null;
  const logContact = (kind) => { create('activities', { kind, body: kind === 'call' ? 'اتصال' : 'تواصل عبر واتساب', person_id: personId, ...link, occurred_at: new Date().toISOString() }); };
  return <div className={`contact-actions${compact ? ' compact' : ''}`}>
    {phones.length === 0 && <span className="muted small">لا يوجد رقم</span>}
    {phones.map((ph) => <React.Fragment key={ph.id}>
      <LinkBtn small icon="phone" href={telUrl(ph.raw)} onClick={() => logContact('call')}>{compact ? null : (phones.length > 1 ? displayPhone(ph.normalized) : 'اتصال')}</LinkBtn>
      {ph.whatsapp ? <LinkBtn small kind="wa" icon="wa" href={waUrl(ph.raw, waText)} target="_blank" rel="noopener">{compact ? null : 'واتساب'}</LinkBtn> : null}
    </React.Fragment>)}
    <Btn small icon="check" onClick={() => { create('activities', { kind: 'other', body: 'تم التواصل', person_id: personId, ...link, occurred_at: new Date().toISOString() }); toast('سُجّل التواصل'); setAfter(true); }}>تم التواصل</Btn>
    {after && <TaskSheet task={{ title: 'متابعة مع ' + personLabel(personId), due_at: daysFrom(3, 10), due_has_time: 1 }} link={{ person_id: personId, ...link }} onClose={() => setAfter(false)} />}
  </div>;
}

// ---------- سجل التواصل والملاحظات ----------
export function Timeline({ link }) {
  const acts = useTable('activities');
  const [kind, setKind] = useState('note');
  const [body, setBody] = useState('');
  const list = acts.filter((a) => !a.archived_at && Object.entries(link).some(([k, v]) => a[k] === v)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return <div className="timeline">
    <form className="note-form" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; create('activities', { kind, body: body.trim(), ...link, occurred_at: new Date().toISOString() }); setBody(''); }}>
      <Select value={kind} onChange={(v) => setKind(v || 'note')} options={Object.entries(ACTIVITY_KINDS)} aria-label="النوع" />
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="أضف ملاحظة أو ما تم في التواصل" />
      <Btn type="submit" small kind="primary">إضافة</Btn>
    </form>
    <ul>{list.map((a) => <li key={a.id}><span className="tl-kind">{ACTIVITY_KINDS[a.kind]}</span><span className="tl-body">{a.body}</span><small className="muted">{fmtDateTime(a.occurred_at)}</small></li>)}</ul>
    {!list.length && <p className="muted small">لا يوجد سجل بعد.</p>}
  </div>;
}

// ---------- الصور والوثائق ----------
export function Photos({ ownerType, ownerId, kind = 'photo', selectable, selected, onSelect }) {
  const files = useTable('files');
  const toast = useToast();
  const [busy, setBusy] = useState(0);
  const list = files.filter((f) => f.owner_type === ownerType && f.owner_id === ownerId && f.kind === kind && !f.archived_at).sort((a, b) => (b.is_cover - a.is_cover) || (a.sort - b.sort));
  const onFiles = async (fl) => {
    const arr = Array.from(fl || []);
    setBusy(arr.length);
    for (const f of arr) {
      try {
        const prepared = kind === 'photo' ? await compressImage(f) : f;
        if (prepared.size > 25 * 1024 * 1024) { toast('الملف أكبر من 25 ميغابايت: ' + f.name, 'err'); continue; }
        await uploadFile(prepared, { kind, owner_type: ownerType, owner_id: ownerId });
      } catch (e) { toast('تعذر تجهيز ' + f.name, 'err'); }
      setBusy((b) => b - 1);
    }
    setBusy(0);
  };
  const move = (f, dir) => {
    const i = list.indexOf(f); const j = i + dir;
    if (j < 0 || j >= list.length) return;
    update('files', f.id, { sort: list[j].sort }); update('files', list[j].id, { sort: f.sort });
  };
  const setCover = (f) => { for (const x of list) if (x.is_cover && x.id !== f.id) update('files', x.id, { is_cover: 0 }); update('files', f.id, { is_cover: 1 }); };
  return <div className="photos">
    <div className={kind === 'photo' ? 'photo-grid' : 'doc-list'}>
      {list.map((f, i) => kind === 'photo' ? <figure key={f.id} className={selectable && selected?.includes(f.id) ? 'sel' : ''}>
        <Thumb f={f} />
        {f.is_cover ? <span className="cover-tag">الغلاف</span> : null}
        {selectable && <label className="pick"><input type="checkbox" checked={selected?.includes(f.id) || false} onChange={(e) => onSelect(e.target.checked ? [...(selected || []), f.id] : (selected || []).filter((x) => x !== f.id))} /> للنشر</label>}
        <figcaption>
          <button type="button" onClick={() => move(f, -1)} aria-label="تقديم" disabled={i === 0}>‹</button>
          {!f.is_cover && <button type="button" onClick={() => setCover(f)}>غلاف</button>}
          <button type="button" onClick={() => archive('files', f.id)} aria-label="حذف">حذف</button>
          <button type="button" onClick={() => move(f, 1)} aria-label="تأخير" disabled={i === list.length - 1}>›</button>
        </figcaption>
        {f._pending && <span className="pending-dot">ينتظر الرفع</span>}
      </figure> : <div key={f.id} className="doc-item"><Icon name="doc" /><a href={f._pending ? undefined : fileUrl(f)} target="_blank" rel="noopener">{f.name || 'وثيقة'}</a><small className="muted">{ago(f.created_at)}</small>{f._pending && <span className="pending-dot">ينتظر الرفع</span>}<button type="button" className="linklike" onClick={() => archive('files', f.id)}>حذف</button></div>)}
    </div>
    <label className="btn btn-default btn-sm upload-btn">
      <Icon name={kind === 'photo' ? 'photo' : 'doc'} size={16} /><span>{busy ? `جارٍ التجهيز (${busy})…` : kind === 'photo' ? 'أضف صوراً (كاميرا، ألبوم، ملفات)' : kind === 'audio' ? 'أضف تسجيلاً' : 'أضف وثيقة'}</span>
      <input type="file" hidden multiple accept={kind === 'photo' ? 'image/*,.heic,.heif' : kind === 'audio' ? 'audio/*' : '.pdf,image/*,.doc,.docx,.xls,.xlsx,.txt'} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
    </label>
    {kind === 'photo' && <small className="hint block">تُضغط الصور وتُزال منها بيانات الموقع المضمنة. لقطات الشاشة مدعومة.</small>}
    {kind === 'document' && <small className="hint block">الوثائق خاصة ولا تُنشر أبداً.</small>}
  </div>;
}

function Thumb({ f }) {
  const [src, setSrc] = useState(f._pending ? null : fileUrl(f, true));
  useEffect(() => {
    let url;
    if (f._pending && f._blobKey) blobGet(f._blobKey).then((b) => { if (b) { url = URL.createObjectURL(b); setSrc(url); } });
    else setSrc(fileUrl(f, true));
    return () => url && URL.revokeObjectURL(url);
  }, [f.id, f._pending]);
  return src ? <a href={f._pending ? undefined : fileUrl(f)} target="_blank" rel="noopener"><img src={src} alt={f.name || ''} loading="lazy" /></a> : <div className="thumb-ph" />;
}

// ضغط في المتصفح: يقلل الحجم ويحوّل HEIC (حيث يدعمه المتصفح، مثل Safari) ويزيل EXIF
export async function compressImage(file) {
  const isImg = file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
  if (!isImg) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    // المتصفح لا يقرأ الصيغة (مثل HEIC على Chrome/Windows): نرسل الأصل والخادم يحاول، أو يرد برسالة واضحة
    return file;
  }
}

// ---------- مخطط Leaflet عند الحاجة ----------
let leafletP = null;
export function loadLeaflet() {
  if (!leafletP) leafletP = Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([m]) => m.default || m);
  return leafletP;
}
export function tileLayer(L, settings) {
  return L.tileLayer(settings?.map_tiles_url || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: settings?.map_tiles_max_zoom || 19, attribution: settings?.map_tiles_attribution || '&copy; OpenStreetMap' });
}
export const pinIcon = (L, color = '#0e5a4c') => L.divIcon({ className: 'wpin', html: `<svg viewBox="0 0 24 24" width="32" height="32"><path fill="${color}" stroke="#fff" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>`, iconSize: [32, 32], iconAnchor: [16, 31] });

export function InfoRow({ label, children }) {
  const empty = (c) => c == null || c === '' || c === false || (Array.isArray(c) && c.every(empty));
  if (empty(children)) return null;
  return <div className="info-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

export function useSettings() { return useStore().settings || {}; }

export function SplitLayout({ wide, list, detail, hasDetail }) {
  if (!wide) return hasDetail ? detail : list;
  return <div className="split"><div className="split-list">{list}</div><div className="split-detail">{hasDetail ? detail : <div className="split-empty muted">اختر عنصراً من القائمة</div>}</div></div>;
}
