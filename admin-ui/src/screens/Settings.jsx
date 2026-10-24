import React, { useEffect, useState } from 'react';
import { useStore, saveSettings, useTable, create, update, archive, api, logout, loadSettings, uploadFile, fileUrl, uuid } from '../data.js';
import { NKC_ZONES } from '@shared/nouakchottZones.js';
import { parsePlanPackage, splitPlanFile, planLabel } from '@shared/plans.js';
import { Btn, Field, Input, NumInput, TextArea, Section, Seg, Select, useToast, Sheet, LinkBtn, Icon } from '../ui.jsx';
import { href } from '../router.js';
import { fmtDateTime } from '../fmt.js';

const PlanAlign = React.lazy(() => import('../PlanAlign.jsx'));

export default function Settings({ route }) {
  const s = useStore();
  const [tab, setTab] = useState(route?.query?.tab || 'site');
  useEffect(() => { loadSettings(); }, []);
  return <div className="page settings">
    <div className="page-head"><h1>الإعدادات</h1></div>
    <Seg value={tab} onChange={setTab} options={[['site', 'الموقع والتواصل'], ['templates', 'القوالب'], ['areas', 'الأحياء'], ['plans', 'المخططات'], ['data', 'البيانات'], ['account', 'الحساب'], ['integrations', 'واتساب']]} />
    {tab === 'site' && (s.settings ? <SiteSettings settings={s.settings} /> : <p className="muted">الإعدادات تحتاج اتصالاً للتحميل.</p>)}
    {tab === 'templates' && <Templates />}
    {tab === 'areas' && <Areas />}
    {tab === 'plans' && <Plans />}
    {tab === 'data' && <DataTools />}
    {tab === 'account' && <Account />}
    {tab === 'integrations' && <WhatsApp />}
  </div>;
}

function SiteSettings({ settings }) {
  const [v, setV] = useState(settings);
  const toast = useToast();
  const set = (k) => (x) => setV({ ...v, [k]: x });
  const save = async () => { const r = await saveSettings(v); toast(r.ok ? 'حُفظت الإعدادات وطُبقت على الموقع العام' : r.data?.message || 'تعذر الحفظ', r.ok ? 'info' : 'err'); };
  return <>
    <Section title="هوية الموقع">
      <Field label="اسم الموقع"><Input value={v.site_name} onChange={set('site_name')} /></Field>
      <Field label="الشعار النصي"><Input value={v.site_tagline} onChange={set('site_tagline')} /></Field>
      <Field label="نص الترحيب"><TextArea value={v.site_intro} onChange={set('site_intro')} rows={2} /></Field>
      <Field label="الاسم القانوني للنشاط (في صفحات الخصوصية والشروط)"><Input value={v.business_name_legal} onChange={set('business_name_legal')} /></Field>
      <Field label="الرابط العام للموقع" hint="مثلاً https://example.mr — يُستعمل في روابط المشاركة ومعاينات واتساب"><Input value={v.base_url} onChange={set('base_url')} dir="ltr" /></Field>
    </Section>
    <Section title="التواصل (يظهر للزوار)">
      <div className="grid2">
        <Field label="هاتف الاتصال"><Input value={v.contact_phone} onChange={set('contact_phone')} dir="ltr" type="tel" /></Field>
        <Field label="رقم واتساب"><Input value={v.contact_whatsapp} onChange={set('contact_whatsapp')} dir="ltr" type="tel" /></Field>
        <Field label="البريد"><Input value={v.contact_email} onChange={set('contact_email')} dir="ltr" /></Field>
        <Field label="العنوان"><Input value={v.office_address} onChange={set('office_address')} /></Field>
        <Field label="أوقات العمل"><Input value={v.office_hours} onChange={set('office_hours')} /></Field>
      </div>
    </Section>
    <Section title="العمل">
      <div className="grid2">
        <Field label="تنبيه العروض غير المحدثة بعد (يوم)"><NumInput value={v.stale_days} onChange={set('stale_days')} /></Field>
        <Field label="نصف قطر الموقع التقريبي (متر)"><NumInput value={v.approx_radius_m} onChange={set('approx_radius_m')} /></Field>
        <Field label="عدد العقارات في الصفحة الأولى"><NumInput value={v.listing_page_size} onChange={set('listing_page_size')} /></Field>
      </div>
    </Section>
    <Section title="الخرائط" collapsible defaultOpen={false}>
      <p className="hint">الافتراضي: OpenStreetMap مع النسب المطلوب. خوادم OSM العامة للاستخدام الخفيف فقط؛ عند ازدياد الزوار استخدم مزود خرائط بترخيص مناسب وضع رابطه هنا.</p>
      <Field label="رابط البلاطات"><Input value={v.map_tiles_url} onChange={set('map_tiles_url')} dir="ltr" /></Field>
      <Field label="النسب (Attribution)"><Input value={v.map_tiles_attribution} onChange={set('map_tiles_attribution')} dir="ltr" /></Field>
    </Section>
    <Section title="نصوص إضافية للصفحات القانونية" collapsible defaultOpen={false}>
      <Field label="إضافة لصفحة الخصوصية"><TextArea value={v.privacy_extra} onChange={set('privacy_extra')} rows={3} /></Field>
      <Field label="إضافة لصفحة الشروط"><TextArea value={v.terms_extra} onChange={set('terms_extra')} rows={3} /></Field>
    </Section>
    <div className="form-actions sticky"><Btn kind="primary" onClick={save}>حفظ الإعدادات</Btn></div>
  </>;
}

function Templates() {
  const tpls = useTable('templates').filter((t) => !t.archived_at).sort((a, b) => a.sort - b.sort);
  const [edit, setEdit] = useState(null);
  return <Section title="قوالب الرسائل" actions={<Btn small icon="plus" onClick={() => setEdit({ kind: 'other', title: '', body: '' })}>قالب</Btn>}>
    <p className="hint">المتغيرات المتاحة: {'{name}'} الاسم، {'{title}'} العنوان، {'{place}'} المكان، {'{price}'} السعر، {'{area}'} المساحة، {'{ref}'} المرجع، {'{link}'} الرابط، {'{deal_label}'}، {'{site_name}'}. قالب «تسويق عقار» يُستعمل في نص المشاركة.</p>
    <ul className="plain">{tpls.map((t) => <li key={t.id} className="tpl"><b>{t.title}</b> <small className="muted">({t.kind})</small><pre className="share-preview small">{t.body}</pre><Btn small icon="edit" onClick={() => setEdit(t)}>تعديل</Btn></li>)}</ul>
    {edit && <Sheet title="قالب" onClose={() => setEdit(null)} footer={<>{edit.id && <Btn kind="ghost" onClick={() => { archive('templates', edit.id); setEdit(null); }}>حذف</Btn>}<Btn kind="primary" onClick={() => { if (edit.id) update('templates', edit.id, { title: edit.title, body: edit.body, kind: edit.kind }); else create('templates', edit); setEdit(null); }}>حفظ</Btn></>}>
      <Field label="العنوان"><Input value={edit.title} onChange={(x) => setEdit({ ...edit, title: x })} /></Field>
      <Field label="الاستعمال"><Select value={edit.kind} onChange={(x) => setEdit({ ...edit, kind: x || 'other' })} options={[['buyer', 'أسئلة المشتري'], ['seller', 'أسئلة البائع'], ['followup', 'متابعة'], ['property', 'تسويق عقار'], ['verify', 'تحقق من عرض'], ['other', 'أخرى']]} /></Field>
      <Field label="النص"><TextArea value={edit.body} onChange={(x) => setEdit({ ...edit, body: x })} rows={7} /></Field>
    </Sheet>}
  </Section>;
}

function Areas() {
  const areas = useTable('areas').filter((a) => !a.archived_at).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const moughataas = useTable('moughataas');
  const wilayas = useTable('wilayas');
  const [edit, setEdit] = useState(null);
  return <Section title="الأحياء والمعالم والمخططات" actions={<Btn small icon="plus" onClick={() => setEdit({ name: '', aliases: [], kind: 'area' })}>إضافة</Btn>}>
    <p className="hint">أضف أسماء السوق كما تُستعمل، مع الكتابات البديلة (عربية وفرنسية). حدّد المقاطعة فقط إن كنت متأكداً؛ يمكن تركها فارغة. تُستعمل هذه القائمة في الإدخال والبحث والمطابقة والالتقاط.</p>
    <p className="hint">التقسيم الإداري (15 ولاية و63 مقاطعة) مصدره قائمة المقاطعات المحدثة 2023 ومرسوم 8 سبتمبر 2021. يُنصح بمطابقته مع المصادر الرسمية.</p>
    <table className="table"><thead><tr><th>الاسم</th><th>أسماء بديلة</th><th>النوع</th><th>المقاطعة</th><th></th></tr></thead>
      <tbody>{areas.map((a) => <tr key={a.id}><td>{a.name}</td><td>{(a.aliases || []).join('، ')}</td><td>{({ area: 'حي', landmark: 'معلم', plan: 'مخطط' })[a.kind]}</td><td>{moughataas.find((m) => m.code === a.moughataa_code)?.name_ar || <span className="muted">غير محددة</span>}</td><td><Btn small kind="ghost" icon="edit" onClick={() => setEdit(a)} aria-label="تعديل" /></td></tr>)}</tbody></table>
    {edit && <Sheet title="حي / معلم" onClose={() => setEdit(null)} footer={<>{edit.id && <Btn kind="ghost" onClick={() => { archive('areas', edit.id); setEdit(null); }}>حذف</Btn>}<Btn kind="primary" disabled={!edit.name?.trim()} onClick={() => { const body = { name: edit.name.trim(), aliases: edit.aliases, kind: edit.kind, moughataa_code: edit.moughataa_code || null, wilaya_code: edit.moughataa_code ? moughataas.find((m) => m.code === edit.moughataa_code)?.wilaya_code : edit.wilaya_code || null }; if (edit.id) update('areas', edit.id, body); else create('areas', body); setEdit(null); }}>حفظ</Btn></>}>
      <Field label="الاسم"><Input value={edit.name} onChange={(x) => setEdit({ ...edit, name: x })} /></Field>
      <Field label="أسماء بديلة (افصل بفاصلة)"><Input value={(edit.aliases || []).join('، ')} onChange={(x) => setEdit({ ...edit, aliases: x.split(/[،,]/).map((y) => y.trim()).filter(Boolean) })} /></Field>
      <Field label="النوع"><Seg value={edit.kind} onChange={(x) => setEdit({ ...edit, kind: x })} options={[['area', 'حي/منطقة'], ['landmark', 'معلم'], ['plan', 'مخطط']]} /></Field>
      <Field label="المقاطعة (اختياري — فقط إن كنت متأكداً)"><Select value={edit.moughataa_code} onChange={(x) => setEdit({ ...edit, moughataa_code: x })} placeholder="غير محددة" options={[...wilayas].sort((a, b) => a.sort - b.sort).map((w) => ({ label: w.name_ar, options: moughataas.filter((m) => m.wilaya_code === w.code).map((m) => [m.code, m.name_ar]) }))} /></Field>
    </Sheet>}
  </Section>;
}

// مخططات التجزئة: تُستورد كحزم (.wasitplan.json) فيها صورة مضبوطة على الخريطة وفهرس القطع
function Plans() {
  const plans = useTable('plans').filter((p) => !p.archived_at).sort((a, b) => (a.lotissement || a.name).localeCompare(b.lotissement || b.name));
  const moughataas = useTable('moughataas');
  const areas = useTable('areas').filter((a) => !a.archived_at && a.kind !== 'landmark');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [ren, setRen] = useState(null);
  const mName = (c) => moughataas.find((m) => m.code === c)?.name_ar;
  const aName = (id) => areas.find((a) => a.id === id)?.name;
  // تعديل الاسم والمقاطعة والمنطقة؛ المنطقة الجديدة تُنشأ حياً، ولا تُنسب إلى المقاطعة إلا بعد التأكيد
  const saveRen = () => {
    let area_id = ren.area_id === '+' ? null : ren.area_id || null;
    if (ren.area_id === '+' && ren.new_area?.trim()) {
      area_id = uuid();
      create('areas', { id: area_id, name: ren.new_area.trim(), kind: 'area', aliases: [], moughataa_code: ren.place_verified ? ren.moughataa_code || null : null, wilaya_code: ren.place_verified ? moughataas.find((m) => m.code === ren.moughataa_code)?.wilaya_code || null : null });
    }
    update('plans', ren.id, { name: ren.name.trim(), lotissement: ren.name.trim(), moughataa_code: ren.moughataa_code || null, area_id, place_verified: ren.place_verified ? 1 : 0 });
    setRen(null);
  };
  const [toAlign, setToAlign] = useState([]); // ملفات بلا إحداثيات تنتظر الضبط بنقطتين
  const savePlan = async (row, image) => {
    const id = uuid();
    const image_file_id = image ? await uploadFile(image, { kind: 'document', owner_type: 'plan', owner_id: id }) : null;
    create('plans', { ...row, id, image_file_id });
  };
  const importFiles = async (files) => {
    setBusy(true);
    let ok = 0;
    const items = [];
    for (const file of files) {
      // بلا تقييد للنوع في المنتقي: بعض الهواتف تخفي ملفات PDF أو تعطيها اسماً بلا امتداد، فنتعرف عليها من محتواها
      const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...head) === '%PDF-' || /\.pdf$/i.test(file.name) || file.type === 'application/pdf') { items.push({ file, pdf: true }); continue; }
      if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) { setToAlign((a) => [...a, file]); continue; }
      try { for (const d of splitPlanFile(await file.text())) items.push({ file, d }); } catch (e) { toast(`${file.name}: ${e.message}`, 'err'); }
    }
    const seen = [...plans];
    for (const { file, d, pdf } of items) {
      try {
        // إعادة إضافة الملف نفسه تُحدّث المخطط (مثلاً لإضافة حدود القطع لمخطط استُورد قبلها)
        const again = pdf && plans.find((p) => p.source_name === file.name);
        let parsed;
        if (pdf) {
          const g = await import('../geopdfImport.js');
          try { parsed = await g.readGeoPdf(file, (step) => setBusy(`${file.name}: ${step}…`)); } catch (e) { if (e instanceof g.NoGeoError) { setToAlign((a) => [...a, file]); continue; } throw e; }
        } else parsed = parsePlanPackage(d);
        const { row, image } = parsed;
        if (again) {
          if (!row.lots.length && again.lots?.length) { toast(`«${planLabel(again)}» موجود من قبل`, 'err'); continue; }
          const image_file_id = image ? await uploadFile(image, { kind: 'document', owner_type: 'plan', owner_id: again.id }) : again.image_file_id;
          const { name, lotissement, moughataa_code, ...rest } = row;
          update('plans', again.id, { ...rest, image_file_id });
          ok++;
          toast(`«${planLabel(again)}» حُدّث: ${row.lots.length} قطعة، منها ${row.lots.filter((l) => l[4]).length} بحدودها`);
          continue;
        }
        const dup = seen.find((p) => p.name === row.name && p.lotissement === row.lotissement);
        if (dup) { toast(`«${planLabel(row)}» مستورد من قبل`, 'err'); continue; }
        let img = image;
        if (typeof image === 'string') {
          const [head, b64] = image.split(',');
          const bin = atob(b64); const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const type = head.slice(5).split(';')[0];
          img = new File([bytes], (row.lotissement || 'plan') + '.' + type.split('/')[1], { type });
        }
        await savePlan(row, img);
        seen.push(row);
        ok++;
        if (pdf) toast(row.lots.length ? `«${planLabel(row)}»: ${row.lots.length} قطعة، منها ${row.lots.filter((l) => l[4]).length} بحدودها` : `«${planLabel(row)}»: وُضع على الخريطة، ولم نجد أرقام قطع في نصه`);
      } catch (e) { toast(`${file.name}: ${e.message}`, 'err'); }
    }
    setBusy(false);
    if (ok) toast(`استُورد ${ok} مخطط`);
  };
  const aligned = async ({ row, image }) => {
    const file = toAlign[0];
    setToAlign((a) => a.slice(1));
    try { await savePlan(row, image); toast(`«${planLabel(row)}» وُضع على الخريطة`); } catch (e) { toast(`${file.name}: ${e.message}`, 'err'); }
  };
  return <Section title="مخططات التجزئة">
    <p className="hint">اختر ملف PDF المخطط كما خرج من ArcMap أو QGIS (بإحداثياته)، ويمكن اختيار عدة ملفات معاً. الملف الممسوح أو الصورة بلا إحداثيات تضبطه بنفسك بنقطتين. لإضافة حدود القطع وأضلاعها إلى مخطط أضفته سابقاً، أضف ملفه نفسه مرة أخرى فيُحدَّث. كل مخطط يظهر فوق الخريطة في مكانه، وأرقام قطعه قابلة للبحث: اكتب رقم القطعة في العرض فيقترح البرنامج موقعها. المخططات خاصة بك ولا تظهر للزوار.</p>
    {plans.length === 0 && <p className="muted">لا توجد مخططات بعد.</p>}
    {plans.map((p) => <div key={p.id} className="plan-row">
      <div>
        <b>{p.name || planLabel(p)}</b>
        <small className="muted block">{[p.lotissement, mName(p.moughataa_code) && (p.place_verified ? mName(p.moughataa_code) : `${mName(p.moughataa_code)} (غير مؤكدة)`), aName(p.area_id), p.lots?.length ? `${p.lots.length} قطعة${p.lots.some((l) => l[4]) ? `، ${p.lots.filter((l) => l[4]).length} بحدودها` : ''}` : 'بلا فهرس قطع', p.source_date && `بتاريخ ${p.source_date}`, p.georef === 'geopdf' ? 'إحداثيات من الملف نفسه' : p.georef === 'points' ? 'مضبوط بنقاط مرجعية' : ''].filter(Boolean).join(' · ')}</small>
        {p.source_name && <small className="muted block">المصدر: {p.source_name}</small>}
      </div>
      {p.image_file_id && <label className="inline-check"><input type="checkbox" checked={!!p.visible} onChange={(e) => update('plans', p.id, { visible: e.target.checked })} /> يظهر على الخريطة</label>}
      {p.image_file_id && <a className="btn btn-default btn-sm" href={fileUrl({ id: p.image_file_id })} target="_blank" rel="noopener">الصورة</a>}
      <Btn small kind="ghost" onClick={() => setRen({ id: p.id, name: planLabel(p), moughataa_code: p.moughataa_code, area_id: aName(p.area_id) ? p.area_id : null, place_verified: !!p.place_verified })}>تعديل</Btn>
      <Btn small kind="ghost" onClick={() => setDel(p)}>حذف</Btn>
    </div>)}
    <div className="row-actions">
      <label className={`btn btn-default upload-btn${busy ? ' disabled' : ''}`}>{busy ? (typeof busy === 'string' ? busy : 'جارٍ الاستيراد…') : 'إضافة مخطط (PDF)'}<input type="file" multiple hidden disabled={busy} onChange={(e) => { importFiles([...e.target.files]); e.target.value = ''; }} /></label>
    </div>
    {toAlign.length > 0 && <React.Suspense fallback={null}><PlanAlign key={toAlign[0].name + toAlign.length} file={toAlign[0]} onDone={aligned} onClose={() => setToAlign((a) => a.slice(1))} /></React.Suspense>}
    {ren && <Sheet title="بيانات المخطط" onClose={() => setRen(null)} footer={<><Btn onClick={() => setRen(null)}>إلغاء</Btn><Btn kind="primary" disabled={!ren.name.trim() || (ren.area_id === '+' && !ren.new_area?.trim())} onClick={saveRen}>حفظ</Btn></>}>
      <Field label="الاسم كما تبحث به (مثل: المنارة، قطاع 9)"><Input value={ren.name} onChange={(x) => setRen({ ...ren, name: x })} /></Field>
      <Field label="المقاطعة"><Select aria-label="المقاطعة" value={ren.moughataa_code} onChange={(x) => setRen({ ...ren, moughataa_code: x, place_verified: false })} placeholder="غير محددة" options={moughataas.filter((m) => NKC_ZONES[m.code]).map((m) => [m.code, m.name_ar])} /></Field>
      <Field label="المنطقة أو الحي"><Select aria-label="المنطقة أو الحي" value={ren.area_id} onChange={(x) => setRen({ ...ren, area_id: x, place_verified: false })} placeholder="غير محددة" options={[...areas.slice().sort((a, b) => (b.moughataa_code === ren.moughataa_code) - (a.moughataa_code === ren.moughataa_code) || a.name.localeCompare(b.name, 'ar')).map((a) => [a.id, a.moughataa_code && a.moughataa_code !== ren.moughataa_code ? `${a.name} (${mName(a.moughataa_code)})` : a.name]), ['+', 'منطقة جديدة…']]} /></Field>
      {ren.area_id === '+' && <Field label="اسم المنطقة الجديدة"><Input value={ren.new_area || ''} onChange={(x) => setRen({ ...ren, new_area: x })} /></Field>}
      <label className="inline-check"><input type="checkbox" checked={!!ren.place_verified} onChange={(e) => setRen({ ...ren, place_verified: e.target.checked })} /> تحققت أن المخطط يتبع هذه المقاطعة والمنطقة</label>
      <p className="hint">المقاطعة تُقترح من موقع المخطط على الخريطة وتبقى «غير مؤكدة» حتى تؤكدها. البحث بالخانات يعرض المخطط تحت المقاطعة والمنطقة المختارتين هنا.</p>
    </Sheet>}
    {del && <Sheet title="حذف المخطط" onClose={() => setDel(null)} footer={<><Btn onClick={() => setDel(null)}>إلغاء</Btn><Btn kind="primary" onClick={() => { archive('plans', del.id); setDel(null); }}>حذف</Btn></>}>
      <p>حذف «{del.name || planLabel(del)}» من الخريطة والبحث؟ مواقع العروض التي وُضعت منه تبقى كما هي.</p>
    </Sheet>}
  </Section>;
}

function DataTools() {
  const [busy, setBusy] = useState(false);
  return <>
    <Section title="تصدير Excel">
      <p className="hint">ملف Excel بعناوين عربية: العملاء، الطلبات، العروض، المواعيد، الصفقات، العمولات، المتابعات. الملف يحتوي بيانات خاصة؛ احفظه في مكان آمن.</p>
      <div className="row-actions wrap">
        <a className="btn btn-primary" href="/api/admin/export.xlsx" download><Icon name="download" /><span>تصدير الكل</span></a>
        <a className="btn btn-default btn-sm" href="/api/admin/export.xlsx?sheets=people" download>العملاء فقط</a>
        <a className="btn btn-default btn-sm" href="/api/admin/export.xlsx?sheets=appointments,tasks" download>المواعيد والمتابعات</a>
      </div>
    </Section>
    <Section title="النسخ الاحتياطي والنقل">
      <p className="hint">نسخة كاملة (قاعدة البيانات + الصور والوثائق) في ملف واحد tar.gz. احتفظ بها خارج الخادم (حاسوبك أو تخزين سحابي خاص). الاستعادة تتم على الخادم بأمر موثق في دليل التشغيل.</p>
      <div className="row-actions wrap">
        <a className="btn btn-primary" href="/api/admin/backup" download onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 4000); }}><Icon name="download" /><span>{busy ? 'جارٍ التجهيز…' : 'تنزيل نسخة احتياطية كاملة'}</span></a>
        <a className="btn btn-default btn-sm" href="/api/admin/export.json" download>تصدير JSON (للنقل إلى نظام آخر)</a>
      </div>
    </Section>
  </>;
}

function Account() {
  const s = useStore();
  const toast = useToast();
  const [cur, setCur] = useState(''); const [next, setNext] = useState('');
  const [sessions, setSessions] = useState(null);
  useEffect(() => { api('GET', '/sessions').then((r) => r.ok && setSessions(r.data.sessions)).catch(() => {}); }, []);
  const change = async () => { const r = await api('POST', '/password', { current: cur, next }, { base: '/api/auth' }).catch(() => null); toast(r?.ok ? 'تغيّرت كلمة المرور وأُنهيت الجلسات الأخرى' : r?.data?.message || 'تعذر التغيير', r?.ok ? 'info' : 'err'); if (r?.ok) { setCur(''); setNext(''); } };
  const pending = s.outbox.length;
  return <>
    <Section title="الحساب"><p>{s.user?.name} — <span dir="ltr">{s.user?.email}</span></p></Section>
    <Section title="تغيير كلمة المرور">
      <Field label="الحالية"><Input type="password" value={cur} onChange={setCur} autoComplete="current-password" /></Field>
      <Field label="الجديدة (10 أحرف على الأقل)"><Input type="password" value={next} onChange={setNext} autoComplete="new-password" /></Field>
      <Btn kind="primary" onClick={change} disabled={!cur || next.length < 10}>تغيير</Btn>
    </Section>
    <Section title="الأجهزة المسجلة">
      {sessions ? <ul className="plain small">{sessions.map((x, i) => <li key={i}>{x.current ? <b>هذا الجهاز · </b> : null}{(x.user_agent || '').slice(0, 80)} · آخر نشاط {fmtDateTime(x.last_seen_at)}</li>)}</ul> : <p className="muted small">يحتاج اتصالاً.</p>}
      <p className="hint">على iPhone، التطبيق المثبّت على الشاشة الرئيسية له جلسة مستقلة عن Safari؛ سجّل الدخول فيه مرة واحدة.</p>
    </Section>
    <Section title="الخروج">
      {pending > 0 && <p className="warn-text">يوجد {pending} تعديل لم يُرسل بعد. الخروج الآن يحذفه من هذا الجهاز.</p>}
      <p className="hint">الخروج يحذف النسخة المحفوظة من بياناتك على هذا الجهاز.</p>
      <div className="row-actions"><Btn kind="danger" onClick={() => logout()}>خروج من هذا الجهاز</Btn><Btn onClick={() => logout({ all: true })}>خروج من كل الأجهزة</Btn></div>
    </Section>
    <Section title="تثبيت التطبيق" collapsible defaultOpen={false}>
      <p><b>iPhone:</b> افتح مساحة العمل في Safari ← زر المشاركة ← «إضافة إلى الشاشة الرئيسية».</p>
      <p><b>Android:</b> من قائمة Chrome ← «تثبيت التطبيق».</p>
      <p><b>اللابتوب:</b> من شريط العنوان في Chrome/Edge ← أيقونة التثبيت.</p>
    </Section>
  </>;
}

function WhatsApp() {
  const [st, setSt] = useState(null);
  const load = (refresh) => api('GET', '/integrations/whatsapp' + (refresh ? '?refresh=1' : '')).then((r) => setSt(r.data)).catch(() => setSt({ state: 'error', label: 'لا يوجد اتصال' }));
  useEffect(() => { load(false); }, []);
  return <Section title="WhatsApp Business (اختياري)">
    <p>الحالة: <b className={st?.state === 'connected' ? 'ok-text' : 'warn-text'}>{st ? st.label : '…'}</b> {st?.detail && <small className="muted">— {st.detail}</small>}</p>
    <Btn small onClick={() => load(true)}>تحقق الآن</Btn>
    <p className="hint">المنظومة تعمل كاملة بروابط واتساب والاتصال دون هذا الربط. عند توفر حساب WhatsApp Business Platform وتطبيق Meta، تُضبط الأسرار على الخادم (متغيرات البيئة) ويُستقبل الوارد هنا تلقائياً. لا تُرسل المنظومة أي رسالة بنفسها. التفاصيل ومتطلبات Coexistence في دليل التشغيل.</p>
  </Section>;
}
