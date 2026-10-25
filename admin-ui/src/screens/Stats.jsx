import React, { useEffect, useState } from 'react';
import { api, useStore } from '../data.js';
import { Seg, Section, Empty } from '../ui.jsx';
import { href } from '../router.js';

const PAGE_AR = { home: 'الصفحة الرئيسية', listing: 'صفحات العروض', lots: 'البحث عن قطعة', area: 'صفحات المقاطعات', form: 'النماذج', other: 'صفحات أخرى' };
const nf = (n) => Number(n || 0).toLocaleString('ar-MR-u-nu-latn');

// زيارات الموقع العام ونقرات واتساب ومصادر الزوار (أعداد مجمّعة، بلا هوية الزائر)
export default function Stats() {
  const s = useStore();
  const [days, setDays] = useState('30');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setErr('');
    api('GET', '/stats?days=' + days).then((r) => { if (!live) return; if (r.ok) setData(r.data); else setErr(r.data?.message || 'تعذر التحميل'); }).catch(() => live && setErr('الإحصاءات تحتاج اتصالاً بالإنترنت'));
    return () => { live = false; };
  }, [days, s.online]);
  const t = data?.totals;
  const max = Math.max(1, ...(data?.daily || []).map((d) => d.views));
  return <div className="page stats">
    <div className="page-head"><div><h1>إحصاءات الموقع</h1><p className="muted">زيارات الموقع العام ونقرات «استفسر عبر واتساب»، ومن أين جاء الزوار. زياراتك أنت كمدير لا تُحسب.</p></div></div>
    <Seg value={days} onChange={setDays} options={[['7', '7 أيام'], ['30', '30 يوماً'], ['90', '3 أشهر']]} />
    {err && <p className="muted">{err}</p>}
    {t && <>
      <div className="kpis">
        <div className="kpi"><b>{nf(t.views)}</b><span>زيارة</span></div>
        <div className="kpi"><b>{nf(t.wa)}</b><span>نقرة واتساب</span></div>
        <div className="kpi"><b>{nf(t.shares)}</b><span>مشاركة</span></div>
        <a className="kpi" href={href('inbox')}><b>{nf(t.inquiries)}</b><span>طلب واستفسار من الموقع</span></a>
      </div>
      {!t.views && !t.wa ? <Empty title="لا زيارات مسجلة بعد">تبدأ الأرقام بالظهور عندما يزور الناس الموقع. استعمل «نص المشاركة» في صفحة العرض لتحصل على روابط تعرف بها مصدر كل زائر.</Empty> : <>
        <Section title="الزيارات يومياً">
          <div className="bars" role="img" aria-label="عدد الزيارات في كل يوم">{data.daily.map((d) => <div key={d.day} className="bar" title={`${d.day}: ${d.views} زيارة، ${d.wa} واتساب`}><span style={{ height: `${Math.round((d.views / max) * 100)}%` }} /></div>)}</div>
          <p className="hint">من {data.from} إلى اليوم.</p>
        </Section>
        <Section title="مصادر الزوار">
          <table className="tbl"><thead><tr><th>المصدر</th><th>زيارات</th><th>واتساب</th><th>مشاركة</th></tr></thead>
            <tbody>{data.by_src.map((r) => <tr key={r.src}><td>{r.label}</td><td>{nf(r.views)}</td><td>{nf(r.wa)}</td><td>{nf(r.shares)}</td></tr>)}</tbody></table>
          <p className="hint">«مباشر» يشمل من فتح رابطاً في واتساب أو كتبه بنفسه. لتمييز واتساب وفيسبوك وتيك توك، انسخ الرابط من «نص المشاركة» واختر المنصة.</p>
        </Section>
        <Section title="أكثر العروض مشاهدة">
          {data.top.length ? <table className="tbl"><thead><tr><th>العرض</th><th>زيارات</th><th>واتساب</th><th>مشاركة</th></tr></thead>
            <tbody>{data.top.map((r) => <tr key={r.ref}><td>{r.id ? <a href={href('properties/' + r.id)}>{r.ref} — {r.title}</a> : `${r.ref} — ${r.title}`}{!r.published && <small className="muted"> (غير منشور الآن)</small>}</td><td>{nf(r.views)}</td><td>{nf(r.wa)}</td><td>{nf(r.shares)}</td></tr>)}</tbody></table> : <p className="muted">لا زيارات لصفحات العروض بعد.</p>}
        </Section>
        <Section title="الصفحات" collapsible defaultOpen={false}>
          <table className="tbl"><tbody>{data.by_page.map((r) => <tr key={r.page}><td>{PAGE_AR[r.page] || r.page}</td><td>{nf(r.views)}</td></tr>)}</tbody></table>
        </Section>
      </>}
    </>}
  </div>;
}
