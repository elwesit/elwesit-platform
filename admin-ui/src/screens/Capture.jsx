import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTable, useStore, call, uploadFile, uuid, table, storeSnapshot } from '../data.js';
import { Btn, Field, Input, NumInput, Select, Seg, Chips, TextArea, Section, Icon, useToast, KindTag } from '../ui.jsx';
import { GeoFields, PriceFields } from '../components.jsx';
import { RequestForm } from './Requests.jsx';
import { parseCapture, buildGazetteer } from '@shared/capture.js';
import { personDuplicates } from '@shared/search.js';
import { TYPES, DEALS } from '@shared/vocab.js';
import { formatAmountWords } from '@shared/money.js';
import { fmtDateLong, fmtTime, toLocalInput, fromLocalInput, phonesOf, personLabel } from '../fmt.js';
import { go } from '../router.js';

const DRAFT = 'wasit-capture-draft';
const EXAMPLES = ['طلب لمحمد يبحث عن قطعة في تفرغ زينه 400 متر وميزانيته خمسون مليوناً', 'عرض عند أحمد بتيارت 600 متر والسعر سبعون مليوناً', 'ذكرني أتصل بمحمد غداً الساعة العاشرة'];

export default function Capture() {
  const [text, setText] = useState(() => { try { return localStorage.getItem(DRAFT) || ''; } catch { return ''; } });
  const [method, setMethod] = useState('text');
  const [audio, setAudio] = useState(null); // {blob, url, seconds}
  useEffect(() => { try { localStorage.setItem(DRAFT, text); } catch {} }, [text]);
  const s = useStore();
  const people = useTable('people');
  const gaz = useMemo(() => buildGazetteer({ wilayas: table('wilayas'), moughataas: table('moughataas'), areas: table('areas').filter((a) => !a.archived_at) }), [s.server.areas, s.server.moughataas]);
  const peopleIdx = useMemo(() => people.filter((p) => !p.archived_at && !p.merged_into).map((p) => ({ id: p.id, name: p.name, phones: phonesOf(p.id).map((x) => x.normalized) })), [people, s.server.phones]);
  const [parsed, setParsed] = useState(null);
  useEffect(() => { const t = setTimeout(() => setParsed(text.trim() ? parseCapture(text, { gazetteer: gaz, people: peopleIdx, now: new Date() }) : null), 250); return () => clearTimeout(t); }, [text, gaz, peopleIdx]);
  const pendingCaptures = s.outbox.filter((o) => o.type === 'call' && o.path === '/capture/commit').length;

  return <div className="page capture">
    <div className="page-head"><h1>إضافة سريعة</h1></div>
    <p className="hint">اكتب أو أملِ أو الصق رسالة واتساب كما وصلتك. نستخرج المعلومات لتراجعها قبل الحفظ، ونحتفظ بالنص الأصلي دائماً.</p>
    <div className="capture-box">
      <TextArea value={text} onChange={(v) => { setText(v); if (method === 'text' && v.length - text.length > 25) setMethod('paste'); }} rows={4} placeholder={'مثال: ' + EXAMPLES[0]} aria-label="النص" dir="auto" />
      <div className="capture-tools">
        <Dictation onText={(t, final) => { setText((cur) => (final ? (cur ? cur.replace(/\s*$/, ' ') : '') + t : cur)); setMethod('dictation'); }} />
        <Recorder audio={audio} setAudio={setAudio} />
        <Btn small icon="paste" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) { setText((c) => (c ? c + '\n' : '') + t); setMethod('paste'); } } catch { alertPaste(); } }}>لصق</Btn>
        {text && <Btn small kind="ghost" onClick={() => { setText(''); setAudio(null); }}>مسح</Btn>}
      </div>
      {!text && <div className="examples">{EXAMPLES.map((e) => <button key={e} type="button" className="chip" onClick={() => setText(e)}>{e}</button>)}</div>}
    </div>
    {pendingCaptures > 0 && <p className="banner warn">{pendingCaptures} إدخال محفوظ على هذا الجهاز بانتظار الاتصال لإرساله.</p>}
    {parsed && <Review key={parsed.raw} parsed={parsed} method={method} audio={audio} onSaved={() => { setText(''); setAudio(null); try { localStorage.removeItem(DRAFT); } catch {} }} />}
  </div>;
}

function alertPaste() { /* بعض المتصفحات تمنع القراءة المباشرة من الحافظة */ document.querySelector('.capture-box textarea')?.focus(); }

// ---------- الإملاء (التعرف على الكلام في المتصفح) ----------
function Dictation({ onText }) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [state, setState] = useState('idle'); // idle | listening | error
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState('ar-SA');
  const [err, setErr] = useState('');
  const rec = useRef(null);
  if (!SR) return <span className="hint small">الإملاء غير مدعوم هنا؛ استخدم زر الميكروفون في لوحة مفاتيح الهاتف.</span>;
  const start = () => {
    setErr('');
    const r = new SR();
    r.lang = lang; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let fin = '', tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else tmp += t; }
      if (fin) onText(fin.trim(), true);
      setInterim(tmp);
    };
    r.onerror = (e) => { setErr(e.error === 'not-allowed' ? 'رُفض إذن الميكروفون.' : e.error === 'network' ? 'التحويل إلى نص يحتاج اتصالاً في هذا المتصفح.' : e.error === 'no-speech' ? 'لم يُسمع كلام.' : 'توقف الإملاء: ' + e.error); };
    // عند الانقطاع نحتفظ بما وصل (النص الجزئي يُضاف كما هو)
    r.onend = () => { setInterim((t) => { if (t) onText(t.trim(), true); return ''; }); setState('idle'); };
    rec.current = r;
    try { r.start(); setState('listening'); } catch (e) { setErr('تعذر بدء الإملاء'); }
  };
  const stop = () => { try { rec.current?.stop(); } catch {} };
  return <span className="dictation">
    {state === 'listening' ? <Btn small kind="danger" icon="stop" onClick={stop}>إيقاف الإملاء</Btn> : <Btn small icon="mic" onClick={start}>إملاء</Btn>}
    {state !== 'listening' && <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="لغة الإملاء"><option value="ar-SA">عربية</option><option value="fr-FR">Français</option></select>}
    {state === 'listening' && <span className="rec-dot" aria-live="polite">يستمع… {interim && <i>{interim}</i>}</span>}
    {err && <small className="error">{err}</small>}
  </span>;
}

// ---------- تسجيل صوتي يُرفق كملف ----------
function Recorder({ audio, setAudio }) {
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const chunks = useRef([]);
  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, [rec]);
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      // نجمع المقاطع كل ثانية؛ إن انقطع التسجيل نحتفظ بما سُجّل
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }); if (blob.size) setAudio({ blob, url: URL.createObjectURL(blob), seconds: secs }); setRec(null); };
      mr.onerror = () => { setErr('توقف التسجيل؛ حُفظ ما سُجّل.'); try { mr.stop(); } catch {} };
      mr.start(1000); setSecs(0); setRec(mr);
    } catch (e) { setErr(e.name === 'NotAllowedError' ? 'رُفض إذن الميكروفون.' : 'تعذر بدء التسجيل.'); }
  };
  return <span className="recorder">
    {rec ? <Btn small kind="danger" icon="stop" onClick={() => rec.stop()}>إيقاف التسجيل ({secs} ث)</Btn> : <Btn small icon="mic" onClick={start}>{audio ? 'تسجيل جديد' : 'تسجيل صوتي'}</Btn>}
    {rec && <span className="rec-dot">يسجّل…</span>}
    {audio && !rec && <span className="audio-prev"><audio controls src={audio.url} /> <button type="button" className="linklike" onClick={() => setAudio(null)}>حذف</button></span>}
    {err && <small className="error">{err}</small>}
    {audio && !rec && <small className="hint block">يُحفظ التسجيل مرفقاً كما هو. التحويل إلى نص يتم عبر «إملاء».</small>}
  </span>;
}

// ---------- مراجعة ما استُخرج ----------
function Review({ parsed, method, audio, onSaved }) {
  const toast = useToast();
  const s = useStore();
  const [intent, setIntent] = useState(parsed.intent_sure ? parsed.intent : null);
  const [personMode, setPersonMode] = useState(parsed.person.match_ids.length === 1 ? 'existing' : parsed.person.name || parsed.person.phone ? 'new' : 'none');
  const [personId, setPersonId] = useState(parsed.person.match_ids[0] || null);
  const [pname, setPname] = useState(parsed.person.name);
  const [pphone, setPphone] = useState(parsed.person.phone);
  const [currencyOk, setCurrencyOk] = useState(parsed.price ? parsed.price.currency !== 'unknown' : true);
  const [dealOk, setDealOk] = useState(!parsed.deal_inferred);
  const [timeOk, setTimeOk] = useState(!parsed.issues.some((i) => i.kind === 'time_period'));
  const [req, setReq] = useState(() => ({ deal: parsed.deal, types: parsed.types, locations: parsed.locations.map(({ wilaya_code, moughataa_code, area_id, text }) => ({ wilaya_code, moughataa_code, area_id, text })), budget_raw: parsed.price?.raw || '', budget_min: parsed.price?.min ?? null, budget_max: parsed.price?.max ?? parsed.price?.amount ?? null, budget_currency: parsed.price?.currency || 'unknown', budget_basis: parsed.price?.basis || 'total', area_min: parsed.area_m2 != null ? Math.round(parsed.area_m2 * 0.9) : null, area_max: parsed.area_m2 != null ? Math.round(parsed.area_m2 * 1.15) : null, bedrooms_min: parsed.bedrooms, specs: '', priority: 'normal', status: 'new', flexibility: '' }));
  const loc0 = parsed.locations.find((l) => l.level !== 'wilaya') || parsed.locations[0];
  const [prop, setProp] = useState(() => ({ deal: parsed.deal, type: parsed.types[0] || null, wilaya_code: loc0?.wilaya_code || null, moughataa_code: loc0?.moughataa_code || null, area_id: loc0?.area_id || null, area_text: loc0?.level === 'area' ? loc0.label : '', landmark: parsed.landmark, area_m2: parsed.area_m2, lot_number: parsed.lot_number, plan: parsed.plan, sector: parsed.sector, bedrooms: parsed.bedrooms, features: parsed.features, price_raw: parsed.price?.raw || '', price_amount: parsed.price?.amount ?? parsed.price?.max ?? null, price_currency: parsed.price?.currency || 'unknown', price_basis: parsed.price?.basis || 'total', availability: 'available', verified_at: new Date().toISOString() }));
  const [relation, setRelation] = useState('owner');
  const [commission, setCommission] = useState('');
  const [task, setTask] = useState(() => ({ title: parsed.task_title || '', due_at: parsed.due?.iso || null, due_has_time: parsed.due?.has_time ? 1 : 0, enabled: parsed.intent === 'reminder' || !!parsed.due }));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const dups = useMemo(() => personMode === 'new' ? personDuplicates(storeSnapshot(), { name: pname, phone: pphone }) : [], [personMode, pname, pphone]);

  const priceObj = intent === 'request' ? { amount: req.budget_max, currency: req.budget_currency } : { amount: prop.price_amount, currency: prop.price_currency };
  const blocking = [];
  if (!intent) blocking.push('اختر نوع الإدخال');
  if ((intent === 'request' || intent === 'offer') && priceObj.amount != null && priceObj.currency === 'unknown' && !currencyOk) blocking.push('حدد العملة أو اختر «لا أعرف بعد»');
  if ((intent === 'request' || intent === 'offer') && !dealOk) blocking.push('أكّد نوع العملية');
  if (task.enabled && !timeOk) blocking.push('حدد هل الوقت صباحاً أم مساءً');
  if (intent === 'reminder' && !task.due_at) blocking.push('حدد موعد التذكير');
  if (intent === 'reminder' && !task.title.trim()) blocking.push('اكتب نص التذكير');

  const save = async () => {
    setBusy(true);
    const captureId = uuid();
    let audioId = null;
    if (audio) audioId = await uploadFile(new File([audio.blob], `تسجيل-${new Date().toISOString().slice(0, 16)}.${audio.blob.type.includes('mp4') ? 'm4a' : 'webm'}`, { type: audio.blob.type.split(';')[0] }), { kind: 'audio', owner_type: 'capture', owner_id: captureId });
    const body = { capture: { id: captureId, raw_text: parsed.raw, method: audio ? 'audio' : method, parsed: { intent: parsed.intent, issues: parsed.issues.map((i) => i.message) } }, intent };
    if (personMode === 'existing' && personId) body.person = { id: personId };
    else if (personMode === 'new' && (pname.trim() || pphone.trim())) body.person = { new: { id: uuid(), phone_id: uuid(), name: pname.trim(), phone: pphone.trim(), roles: intent === 'offer' ? [relation === 'broker' ? 'broker' : 'owner'] : intent === 'request' ? ['buyer'] : [] } };
    if (intent === 'request') body.request = { ...req, id: uuid() };
    if (intent === 'offer') { body.property = { ...prop, id: uuid() }; body.source = { id: uuid(), relation, commission_terms: commission }; }
    if (task.enabled && task.title.trim()) body.task = { title: task.title.trim(), due_at: task.due_at, due_has_time: task.due_has_time };
    else if (intent === 'request' || intent === 'offer') body.task = { title: intent === 'request' ? `ابحث عن عروض لـ ${pname || personLabel(personId) || 'العميل'}` : `تحقق من العرض${pname ? ' عند ' + pname : ''}`, due_at: new Date(Date.now() + 86400000).toISOString(), due_has_time: 0 };
    if (intent === 'note' || note.trim()) body.note = note.trim() || parsed.raw;
    if (audioId) body.audio_file_id = audioId;
    const online = s.online;
    const p = call('POST', '/capture/commit', body, 'التقاط');
    onSaved();
    setBusy(false);
    if (!online) { toast('حُفظ على هذا الجهاز وسيُرسل عند الاتصال'); return; }
    const r = await p;
    if (r.ok) { toast('تم الحفظ'); const c = r.data.created; if (c.request_id) go('requests/' + c.request_id); else if (c.property_id) go('properties/' + c.property_id); else if (c.person_id) go('people/' + c.person_id); }
    else toast(r.data?.message || 'تعذر الحفظ', 'err');
  };

  const issuesShown = parsed.issues.filter((i) => !['currency', 'time_period', 'inferred'].includes(i.kind) && i.field !== 'intent');
  return <div className="review">
    <h2>راجع قبل الحفظ</h2>
    <Field label="نوع الإدخال" error={!intent ? (parsed.issues.find((i) => i.field === 'intent')?.message || 'اختر النوع') : null}>
      <div className="seg">{[['request', 'طلب', 'request'], ['offer', 'عرض', 'offer'], ['reminder', 'تذكير/مهمة', 'task'], ['note', 'ملاحظة', 'activity']].map(([k, l, kind]) => <button type="button" key={k} className={intent === k ? 'on' : ''} aria-checked={intent === k} role="radio" onClick={() => setIntent(k)}><KindTag kind={kind} small /> {l}</button>)}</div>
      {intent && !parsed.intent_sure && <small className="hint">اخترت «{({ request: 'طلب', offer: 'عرض', reminder: 'تذكير', note: 'ملاحظة' })[intent]}»</small>}
    </Field>

    <Section title="الشخص">
      <Seg value={personMode} onChange={setPersonMode} options={[...(parsed.person.match_ids.length ? [['existing', 'شخص موجود']] : []), ['new', 'شخص جديد'], ['none', 'بدون شخص']]} />
      {personMode === 'existing' && <div className="chips">{parsed.person.match_ids.map((id) => <button key={id} type="button" className={personId === id ? 'chip on' : 'chip'} onClick={() => setPersonId(id)}>{personLabel(id)} <small>{phonesOf(id).map((p) => p.raw).join(' ')}</small></button>)}</div>}
      {personMode === 'new' && <div className="grid2"><Field label="الاسم"><Input value={pname} onChange={setPname} /></Field><Field label="الهاتف"><Input value={pphone} onChange={setPphone} dir="ltr" type="tel" /></Field></div>}
      {dups.length > 0 && <div className="warn-box small">موجود مسبقاً؟ {dups.map((d) => <button key={d.id} type="button" className="linklike" onClick={() => { setPersonMode('existing'); setPersonId(d.id); parsed.person.match_ids = [...new Set([...parsed.person.match_ids, d.id])]; }}>{d.name} ({d.reason})</button>)}</div>}
    </Section>

    {(intent === 'request' || intent === 'offer') && parsed.deal_inferred && <div className="confirm-box"><b>نوع العملية:</b> افترضنا «{DEALS[intent === 'request' ? req.deal : prop.deal]}» من حجم المبلغ. <Btn small kind={dealOk ? 'primary' : 'default'} onClick={() => setDealOk(true)}>{dealOk ? '✓ مؤكد' : 'نعم، صحيح'}</Btn> <Btn small onClick={() => { intent === 'request' ? setReq({ ...req, deal: 'rent' }) : setProp({ ...prop, deal: 'rent' }); setDealOk(true); }}>بل إيجار</Btn></div>}
    {(intent === 'request' || intent === 'offer') && priceObj.amount != null && priceObj.currency === 'unknown' && !currencyOk && <div className="confirm-box">
      <b>العملة غير محددة في «{parsed.price?.raw}»:</b>
      <div className="row-actions wrap">{parsed.price.readings.map((r) => <Btn key={r.currency} small onClick={() => { intent === 'request' ? setReq({ ...req, budget_currency: r.currency }) : setProp({ ...prop, price_currency: r.currency }); setCurrencyOk(true); }}>{r.label} <small>({r.hint})</small></Btn>)}<Btn small kind="ghost" onClick={() => setCurrencyOk(true)}>لا أعرف بعد — احفظها غير مؤكدة</Btn></div>
      <small className="hint">القيمة غير المؤكدة لا تُستعمل في المطابقة ولا تُنشر حتى تحددها.</small>
    </div>}

    {intent === 'request' && <Section title="الطلب"><RequestForm embedded value={req} onChange={setReq} /></Section>}
    {intent === 'offer' && <Section title="العرض">
      <Field label="العملية"><Seg value={prop.deal} onChange={(x) => setProp({ ...prop, deal: x })} options={Object.entries(DEALS)} allowNone /></Field>
      <Field label="النوع"><div className="chips">{Object.entries(TYPES).map(([k, l]) => <button type="button" key={k} className={prop.type === k ? 'chip on' : 'chip'} onClick={() => setProp({ ...prop, type: k })}>{l}</button>)}</div></Field>
      <GeoFields value={prop} onChange={(p) => setProp({ ...prop, ...p })} />
      <div className="grid3">
        <Field label="المساحة م²"><NumInput value={prop.area_m2} onChange={(x) => setProp({ ...prop, area_m2: x })} /></Field>
        <Field label="رقم القطعة"><Input value={prop.lot_number} onChange={(x) => setProp({ ...prop, lot_number: x })} /></Field>
        <Field label="المخطط"><Input value={prop.plan} onChange={(x) => setProp({ ...prop, plan: x })} /></Field>
        <Field label="القطاع"><Input value={prop.sector} onChange={(x) => setProp({ ...prop, sector: x })} /></Field>
        <Field label="معلم قريب"><Input value={prop.landmark} onChange={(x) => setProp({ ...prop, landmark: x })} /></Field>
        <Field label="الغرف"><NumInput value={prop.bedrooms} onChange={(x) => setProp({ ...prop, bedrooms: x })} /></Field>
      </div>
      <PriceFields value={prop} onChange={(p) => setProp({ ...prop, ...p })} />
      <Field label="مصدر العرض"><Seg value={relation} onChange={setRelation} options={[['owner', 'المالك نفسه'], ['broker', 'وسيط'], ['relative', 'قريب المالك'], ['other', 'أخرى']]} /></Field>
      <Field label="العمولة المتفق عليها مع المصدر (اختياري)"><Input value={commission} onChange={setCommission} /></Field>
    </Section>}

    <Section title={intent === 'reminder' ? 'التذكير' : 'متابعة (اختياري)'}>
      {intent !== 'reminder' && <label className="inline-check"><input type="checkbox" checked={task.enabled} onChange={(e) => setTask({ ...task, enabled: e.target.checked })} /> أضف متابعة بموعد</label>}
      {(task.enabled || intent === 'reminder') && <>
        <Field label="ماذا؟"><Input value={task.title} onChange={(x) => setTask({ ...task, title: x, enabled: true })} /></Field>
        {parsed.due && <p className="extracted">المستخلص: <b>{fmtDateLong(task.due_at)}{task.due_has_time ? ' الساعة ' + fmtTime(task.due_at) : ''}</b> <small className="muted">(توقيت نواكشوط{parsed.due.raw ? ` — من «${parsed.due.raw}»` : ''})</small></p>}
        {!timeOk && parsed.due?.alternatives?.length === 2 && <div className="confirm-box"><b>صباحاً أم مساءً؟</b> {parsed.due.alternatives.map((iso) => <Btn key={iso} small onClick={() => { setTask({ ...task, due_at: iso, due_has_time: 1, enabled: true }); setTimeOk(true); }}>{fmtTime(iso)}</Btn>)}</div>}
        <Field label="الموعد (توقيت نواكشوط)"><input type="datetime-local" value={toLocalInput(task.due_at)} onChange={(e) => { setTask({ ...task, due_at: fromLocalInput(e.target.value), due_has_time: 1, enabled: true }); setTimeOk(true); }} /></Field>
      </>}
    </Section>
    {intent !== 'note' && <Field label="ملاحظة إضافية (اختياري)"><Input value={note} onChange={setNote} /></Field>}
    {issuesShown.length > 0 && <div className="info-box"><b>ملاحظات على الاستخراج:</b><ul>{issuesShown.map((i, k) => <li key={k}>{i.message}</li>)}</ul></div>}
    <details className="raw"><summary>النص الأصلي (يُحفظ كما هو)</summary><pre>{parsed.raw}</pre></details>
    {blocking.length > 0 && <div className="warn-box"><b>قبل الحفظ:</b><ul>{blocking.map((b) => <li key={b}>{b}</li>)}</ul></div>}
    <div className="form-actions sticky"><Btn kind="primary" disabled={busy || blocking.length > 0} onClick={save}>{busy ? 'جارٍ…' : 'حفظ'}</Btn></div>
  </div>;
}
