import React, { useState, useEffect, useMemo } from 'react';
import { useStore, storeSnapshot, syncNow, resolveConflict, dismissFailed, retryFailed } from './data.js';
import { useRoute, go, href } from './router.js';
import { Icon, ToastHost, useIsWide, Sheet, Btn, KindTag } from './ui.jsx';
import { searchStore } from '@shared/search.js';
import Login from './screens/Login.jsx';
import Today from './screens/Today.jsx';
import Inbox from './screens/Inbox.jsx';
import Properties from './screens/Properties.jsx';
import Requests from './screens/Requests.jsx';
import People from './screens/People.jsx';
import Appointments from './screens/Appointments.jsx';
import Deals from './screens/Deals.jsx';
import Settings from './screens/Settings.jsx';
import Capture from './screens/Capture.jsx';
import Stats from './screens/Stats.jsx';

const NAV = [
  ['today', 'اليوم', 'today'],
  ['inbox', 'الوارد', 'inbox'],
  ['properties', 'العروض', 'home'],
  ['requests', 'الطلبات', 'request'],
  ['people', 'العملاء', 'people'],
  ['appointments', 'المواعيد', 'calendar'],
  ['deals', 'الصفقات', 'deal'],
  ['stats', 'الإحصاءات', 'chart'],
  ['settings', 'الإعدادات', 'settings'],
];

export default function App() {
  return <ToastHost><Shell /></ToastHost>;
}

function Shell() {
  const s = useStore();
  const route = useRoute();
  const wide = useIsWide();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { setMenu(false); }, [route.parts.join('/')]);

  if (!s.ready) return <div className="splash"><img src="/static/icon.svg" alt="" width="56" /><p>جارٍ الفتح…</p></div>;
  if (s.auth !== 'in') return <Login />;

  const section = route.parts[0] || 'today';
  const newInbox = Object.values(s.server.inbox || {}).filter((m) => m.status === 'new' && !m.archived_at).length;
  let screen;
  switch (section) {
    case 'inbox': screen = <Inbox route={route} wide={wide} />; break;
    case 'properties': screen = <Properties route={route} wide={wide} />; break;
    case 'requests': screen = <Requests route={route} wide={wide} />; break;
    case 'people': screen = <People route={route} wide={wide} />; break;
    case 'appointments': screen = <Appointments route={route} wide={wide} />; break;
    case 'deals': screen = <Deals route={route} wide={wide} />; break;
    case 'settings': screen = <Settings route={route} />; break;
    case 'capture': screen = <Capture route={route} />; break;
    case 'stats': screen = <Stats />; break;
    case 'search': screen = <SearchScreen q={route.query.q || ''} />; break;
    default: screen = <Today wide={wide} />;
  }

  return <div className={`app ${wide ? 'is-wide' : 'is-narrow'}`}>
    {wide && <aside className="sidebar">
      <a className="side-brand" href={href('today')}><img src="/static/icon.svg" alt="" width="32" /><span>{s.settings?.site_name || 'الوسيط'}</span></a>
      <button className="btn btn-primary btn-block quick-add" onClick={() => go('capture')}><Icon name="plus" /><span>إضافة سريعة</span></button>
      <nav aria-label="الأقسام">{NAV.map(([k, label, icon]) => <a key={k} href={href(k)} className={section === k ? 'on' : ''} aria-current={section === k ? 'page' : undefined}><Icon name={icon} /><span>{label}</span>{k === 'inbox' && newInbox > 0 && <b className="count">{newInbox}</b>}</a>)}</nav>
      <a className="side-public" href="/" target="_blank" rel="noopener"><Icon name="globe" /><span>الموقع العام</span></a>
    </aside>}
    <div className="main-col">
      <header className="topbar">
        {!wide && <a className="top-brand" href={href('today')}><img src="/static/icon.svg" alt="" width="28" /></a>}
        {wide ? <GlobalSearch /> : <button className="top-search" onClick={() => setSearchOpen(true)}><Icon name="search" /><span>بحث بالاسم، الهاتف، الحي، رقم القطعة…</span></button>}
        <SyncBadge />
        {!wide && <button className="icon-btn" aria-label="المزيد" onClick={() => setMenu(true)}><Icon name="more" /></button>}
      </header>
      <Banners />
      <main className="content" id="main">{screen}</main>
    </div>
    {!wide && <nav className="bottomnav" aria-label="الأقسام">
      <a href={href('today')} className={section === 'today' ? 'on' : ''}><Icon name="today" /><span>اليوم</span></a>
      <a href={href('inbox')} className={section === 'inbox' ? 'on' : ''}><Icon name="inbox" /><span>الوارد</span>{newInbox > 0 && <b className="count">{newInbox}</b>}</a>
      <a href={href('capture')} className="fab" aria-label="إضافة سريعة"><Icon name="plus" size={28} /></a>
      <a href={href('properties')} className={section === 'properties' ? 'on' : ''}><Icon name="home" /><span>العروض</span></a>
      <a href={href('requests')} className={section === 'requests' ? 'on' : ''}><Icon name="request" /><span>الطلبات</span></a>
    </nav>}
    {menu && <Sheet title="الأقسام" onClose={() => setMenu(false)}>
      <nav className="menu-list">{NAV.map(([k, label, icon]) => <a key={k} href={href(k)} onClick={() => setMenu(false)}><Icon name={icon} /><span>{label}</span></a>)}<a href="/" target="_blank" rel="noopener"><Icon name="globe" /><span>الموقع العام</span></a></nav>
    </Sheet>}
    {searchOpen && <Sheet title="بحث" onClose={() => setSearchOpen(false)}><GlobalSearch autoFocus onPick={() => setSearchOpen(false)} /></Sheet>}
  </div>;
}

function SyncBadge() {
  const s = useStore();
  const pending = s.outbox.length;
  let cls = 'ok', label = 'محفوظ';
  if (!s.online) { cls = 'off'; label = pending ? `بلا اتصال · ${pending} بانتظار الإرسال` : 'بلا اتصال'; }
  else if (pending) { cls = 'wait'; label = `جارٍ الحفظ (${pending})`; }
  else if (s.syncing) { cls = 'wait'; label = 'مزامنة…'; }
  else if (s.syncError) { cls = 'off'; label = s.syncError; }
  return <button className={`sync ${cls}`} onClick={() => syncNow()} title={s.lastSync ? 'آخر مزامنة: ' + new Date(s.lastSync).toLocaleTimeString('ar-MR-u-nu-latn', { timeZone: 'Africa/Nouakchott' }) : ''}><span className="dot" aria-hidden="true" /><span className="sync-label">{label}</span></button>;
}

function Banners() {
  const s = useStore();
  const [show, setShow] = useState(null);
  return <>
    {s.preview && s.ephemeral && <div className="banner warn">نسخة تجريبية للمعاينة: البيانات هنا للاختبار فقط وتُمسح عند إعادة تشغيل الخادم. لا تُدخل بيانات عملاء حقيقية.</div>}
    {s.offlineBoot && <div className="banner warn">تعرض النسخة المحفوظة على هذا الجهاز. لم نتمكن من التحقق من الجلسة مع الخادم بعد؛ التعديلات ستنتظر حتى الاتصال.</div>}
    {s.conflicts.length > 0 && <div className="banner danger"><span>{s.conflicts.length} تعديل يتعارض مع تعديل من جهاز آخر — لم يُكتب فوقه.</span><Btn small kind="primary" onClick={() => setShow('conflicts')}>راجع واختر</Btn></div>}
    {s.failed.length > 0 && <div className="banner danger"><span>{s.failed.length} عملية لم تُحفظ.</span><Btn small onClick={() => setShow('failed')}>التفاصيل</Btn></div>}
    {show === 'conflicts' && <ConflictSheet onClose={() => setShow(null)} />}
    {show === 'failed' && <Sheet title="عمليات لم تُحفظ" onClose={() => setShow(null)}>
      {s.failed.map((f, i) => <div key={i} className="failed-item"><p><b>{f.message}</b></p>{f.problems && <ul>{f.problems.map((p) => <li key={p}>{p}</li>)}</ul>}<p className="muted small">{describeOp(f.op)}</p><div className="row-actions"><Btn small onClick={() => retryFailed(i)}>إعادة المحاولة</Btn><Btn small kind="ghost" onClick={() => dismissFailed(i)}>تجاهل</Btn></div></div>)}
      {!s.failed.length && <p>لا شيء.</p>}
    </Sheet>}
  </>;
}

const FIELD_AR = { name: 'الاسم', notes: 'الملاحظات', title: 'العنوان', price_amount: 'السعر', price_currency: 'العملة', availability: 'التوفر', status: 'الحالة', stage: 'المرحلة', due_at: 'الموعد', done_at: 'الإنجاز', archived_at: 'الأرشفة', description: 'الوصف', internal_notes: 'ملاحظات خاصة', verified_at: 'تاريخ التحقق', area_m2: 'المساحة', lot_number: 'رقم القطعة', starts_at: 'وقت الموعد', outcome: 'النتيجة', amount: 'المبلغ' };
const ENT_AR = { people: 'شخص', properties: 'عرض', requests: 'طلب', tasks: 'مهمة', appointments: 'موعد', deals: 'صفقة', commissions: 'عمولة', phones: 'هاتف', property_sources: 'مصدر عرض', inbox: 'وارد', files: 'ملف' };
function describeOp(op) { return `${ENT_AR[op.entity] || op.label || 'عملية'} — ${op.type === 'create' ? 'إضافة' : op.type === 'update' ? 'تعديل' : op.type === 'upload' ? 'رفع ملف' : op.label || ''}`; }
const show = (v) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function ConflictSheet({ onClose }) {
  const s = useStore();
  const [choice, setChoice] = useState({});
  const c = s.conflicts[0];
  if (!c) { onClose(); return null; }
  return <Sheet title={`تضارب في ${ENT_AR[c.op.entity] || 'سجل'}`} onClose={onClose} footer={<Btn kind="primary" onClick={() => { resolveConflict(0, choice); setChoice({}); }}>اعتمد اختياري</Btn>}>
    <p>عدّلت هذه الحقول على هذا الجهاز، وعُدّلت أيضاً من جهاز آخر. اختر القيمة التي تبقى لكل حقل:</p>
    {c.fields.map((f) => {
      const mine = f === 'archived_at' ? (c.op.patch.archived ? 'مؤرشف' : 'غير مؤرشف') : c.op.patch[f];
      const theirs = f === 'archived_at' ? (c.current.archived_at ? 'مؤرشف' : 'غير مؤرشف') : c.current[f];
      const pick = choice[f] || 'theirs';
      return <fieldset key={f} className="conflict-field"><legend>{FIELD_AR[f] || f}</legend>
        <label className={pick === 'mine' ? 'on' : ''}><input type="radio" checked={pick === 'mine'} onChange={() => setChoice({ ...choice, [f]: 'mine' })} /> قيمتي: <b>{show(mine)}</b></label>
        <label className={pick === 'theirs' ? 'on' : ''}><input type="radio" checked={pick === 'theirs'} onChange={() => setChoice({ ...choice, [f]: 'theirs' })} /> من الجهاز الآخر: <b>{show(theirs)}</b></label>
      </fieldset>;
    })}
    <p className="muted small">الحقول الأخرى التي عدلتها دون تضارب حُفظت أو ستُحفظ تلقائياً.</p>
  </Sheet>;
}

function GlobalSearch({ autoFocus, onPick }) {
  const [q, setQ] = useState('');
  const s = useStore();
  const results = useMemo(() => (q.trim().length >= 2 ? searchStore(storeSnapshot(), q, { limit: 12 }) : []), [q, s.server, s.outbox]);
  const open = (r) => {
    const map = { person: 'people', property: 'properties', request: 'requests', deal: 'deals', inbox: 'inbox' };
    if (r.type === 'activity') go(r.ref.person_id ? `people/${r.ref.person_id}` : r.ref.property_id ? `properties/${r.ref.property_id}` : r.ref.request_id ? `requests/${r.ref.request_id}` : 'today');
    else if (r.type === 'planlot') go('properties/map?q=' + encodeURIComponent(q));
    else if (r.type === 'geometry') go('search?q=' + encodeURIComponent(q));
    else go(`${map[r.type]}/${r.id}`);
    setQ(''); onPick?.();
  };
  return <div className="gsearch">
    <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) { go('search?q=' + encodeURIComponent(q)); setQ(''); onPick?.(); } }}>
      <Icon name="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم، الهاتف، الحي، رقم القطعة، المرجع، أو كلمة من الملاحظات" autoFocus={autoFocus} aria-label="بحث موحد" />
    </form>
    {results.length > 0 && <ul className="gsearch-results" role="listbox">{results.map((r) => <li key={r.type + r.id}><button onClick={() => open(r)}><KindTag kind={r.type} small /><span className="t">{r.title}</span><small>{r.sub}</small><small className="why">{r.why}</small></button></li>)}<li><button className="all" onClick={() => { go('search?q=' + encodeURIComponent(q)); setQ(''); onPick?.(); }}>كل النتائج ←</button></li></ul>}
  </div>;
}

function SearchScreen({ q }) {
  const s = useStore();
  const [arch, setArch] = useState(false);
  const results = useMemo(() => searchStore(storeSnapshot(), q, { includeArchived: arch, limit: 200 }), [q, arch, s.server, s.outbox]);
  const map = { person: 'people', property: 'properties', request: 'requests', deal: 'deals', inbox: 'inbox' };
  return <div className="page">
    <h1>نتائج «{q}»</h1>
    <label className="inline-check"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> تضمين الأرشيف</label>
    {!results.length && <p className="muted">لا نتائج.</p>}
    <ul className="list">{results.map((r) => <li key={r.type + r.id}><a className="list-item" href={r.type === 'activity' ? href(r.ref.person_id ? `people/${r.ref.person_id}` : `properties/${r.ref.property_id}`) : r.type === 'geometry' ? undefined : r.type === 'planlot' ? href('properties/map?q=' + encodeURIComponent(q)) : href(`${map[r.type]}/${r.id}`)}><KindTag kind={r.type} small /><div><b>{r.title}</b>{r.archived && <span className="tag">مؤرشف</span>}<small className="muted block">{r.sub} · {r.why}</small></div></a></li>)}</ul>
  </div>;
}
