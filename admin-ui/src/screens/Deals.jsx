import React, { useMemo, useState } from 'react';
import { useTable, useRow, create, update, archive, table } from '../data.js';
import { Btn, Field, Input, NumInput, Select, Seg, TextArea, Sheet, Section, Empty, KindTag, Pending, Icon, LinkBtn, useToast } from '../ui.jsx';
import { Missing, PersonPicker, NextStep, Timeline, SplitLayout, Photos, ContactActions } from '../components.jsx';
import { DEAL_STAGES } from '@shared/vocab.js';
import { CURRENCIES, formatAmountWords } from '@shared/money.js';
import { personLabel, propertyTitle, fmtDate, price, toDateInput, fromDateInput, ago } from '../fmt.js';
import { href, go, back } from '../router.js';

const STAGES = ['interest', 'contacted', 'viewing', 'negotiation', 'won', 'lost'];

export default function Deals({ route, wide }) {
  const id = route.parts[1];
  if (id === 'new') return <NewDeal preset={route.query} />;
  if (route.query.tab === 'commissions' && !id) return <CommissionsList />;
  return <SplitLayout wide={wide} hasDetail={!!id} list={<Pipeline wide={wide} selected={id} />} detail={id && <DealDetail id={id} />} />;
}

function Pipeline({ wide, selected }) {
  const deals = useTable('deals').filter((d) => !d.archived_at);
  const [showClosed, setShowClosed] = useState(false);
  const stages = showClosed ? STAGES : STAGES.slice(0, 4);
  return <div className="page list-page">
    <div className="page-head"><h1>الفرص والصفقات</h1><div className="row-actions"><LinkBtn small href={href('deals?tab=commissions')}>العمولات</LinkBtn><Btn kind="primary" icon="plus" onClick={() => go('deals/new')}>فرصة</Btn></div></div>
    <label className="inline-check"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> إظهار المنتهية (تمت / توقفت)</label>
    {!deals.length && <Empty title="لا توجد فرص بعد">افتح فرصة من طلب عميل مهتم بعرض، أو من الوارد.</Empty>}
    <div className="pipeline">{stages.map((st) => { const ds = deals.filter((d) => d.stage === st).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); return <div key={st} className={`stage-col st-${st}`}>
      <h3>{DEAL_STAGES[st]} <small>({ds.length})</small></h3>
      <ul>{ds.map((d) => <li key={d.id}><a className={`deal-card${selected === d.id ? ' on' : ''}`} href={href('deals/' + d.id)}><b>{d.title || 'فرصة'}</b><small className="muted block">{personLabel(d.client_person_id)}{d.property_id ? ' · ' + (table('properties').find((p) => p.id === d.property_id)?.ref || '') : ''}</small><small className="muted">{ago(d.updated_at)}</small><Pending row={d} /></a></li>)}</ul>
    </div>; })}</div>
  </div>;
}

function NewDeal({ preset }) {
  const props = useTable('properties').filter((p) => !p.archived_at);
  const reqs = useTable('requests');
  const r = preset.request && reqs.find((x) => x.id === preset.request);
  const [v, setV] = useState({ title: '', client_person_id: r?.person_id || null, property_id: preset.property || null, request_id: preset.request || null, stage: 'interest' });
  const p = v.property_id && props.find((x) => x.id === v.property_id);
  const save = () => {
    const id = create('deals', { ...v, owner_person_id: p?.owner_person_id || null, title: v.title || [personLabel(v.client_person_id), p ? p.ref : ''].filter(Boolean).join(' — ') || 'فرصة' });
    if (r && r.status === 'new') update('requests', r.id, { status: 'active' });
    go('deals/' + id);
  };
  return <div className="page form-page">
    <div className="page-head"><h1>فرصة جديدة</h1></div>
    <PersonPicker value={v.client_person_id} onChange={(x) => setV({ ...v, client_person_id: x })} label="العميل (المشتري/المستأجر)" roles={['buyer']} />
    <Field label="العقار"><Select value={v.property_id} onChange={(x) => setV({ ...v, property_id: x })} placeholder="—" options={props.map((q) => [q.id, `${q.ref} ${propertyTitle(q)}`])} /></Field>
    <Field label="العنوان (اختياري)"><Input value={v.title} onChange={(x) => setV({ ...v, title: x })} /></Field>
    <Field label="المرحلة"><Select value={v.stage} onChange={(x) => setV({ ...v, stage: x })} options={STAGES.slice(0, 4).map((s) => [s, DEAL_STAGES[s]])} /></Field>
    <div className="form-actions sticky"><Btn onClick={() => back('deals')}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ</Btn></div>
  </div>;
}

function DealDetail({ id }) {
  const d = useRow('deals', id);
  const [lost, setLost] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!d) return <Missing title="غير موجود" />;
  const p = d.property_id && table('properties').find((x) => x.id === d.property_id);
  const setStage = (st) => {
    if (st === 'lost') { setLost(true); return; }
    update('deals', id, { stage: st, closed_at: st === 'won' ? new Date().toISOString() : null, lost_reason: st === 'won' ? d.lost_reason : '' });
    if (st === 'won' && p && p.availability !== (p.deal === 'rent' ? 'rented' : 'sold')) {
      // لا نغيّر حالة العقار تلقائياً؛ نقترح فقط
      setEdit('availability');
    }
  };
  return <div className="page detail">
    <div className="detail-head">
      <button className="icon-btn back-btn" onClick={() => back('deals')} aria-label="رجوع"><Icon name="back" /></button>
      <div className="dh-title"><KindTag kind="deal" small /><h1>{d.title || 'فرصة'}</h1><Pending row={d} /></div>
      <div className="dh-actions"><Btn small icon="edit" onClick={() => setEdit('info')}>تعديل</Btn><Btn small kind="ghost" icon="archive" onClick={() => archive('deals', id, !d.archived_at)}>{d.archived_at ? 'استعادة' : 'أرشفة'}</Btn></div>
    </div>
    <ol className="stepper" aria-label="مراحل الفرصة">{STAGES.map((st) => <li key={st} className={`${d.stage === st ? 'on' : ''} st-${st}`}><button onClick={() => setStage(st)} aria-current={d.stage === st ? 'step' : undefined}>{DEAL_STAGES[st]}</button></li>)}</ol>
    {d.stage === 'lost' && <div className="warn-box">توقفت{d.lost_reason ? ': ' + d.lost_reason : ' (السبب غير معروف)'}. <Btn small onClick={() => update('deals', id, { stage: 'negotiation', lost_reason: '' })}>إعادة فتح</Btn></div>}
    {d.stage !== 'won' && d.stage !== 'lost' && <NextStep link={{ deal_id: id }} defaultTitle={'متابعة ' + (d.title || 'الفرصة')} />}
    <div className="detail-grid">
      <div>
        <Section title="الأطراف">
          <dl className="info">
            <div className="info-row"><dt>العميل</dt><dd>{d.client_person_id ? <a href={href('people/' + d.client_person_id)}>{personLabel(d.client_person_id)}</a> : '—'}</dd></div>
            <div className="info-row"><dt>المالك / البائع</dt><dd>{d.owner_person_id ? <a href={href('people/' + d.owner_person_id)}>{personLabel(d.owner_person_id)}</a> : '—'}</dd></div>
            <div className="info-row"><dt>العقار</dt><dd>{p ? <a href={href('properties/' + p.id)}>{p.ref} {propertyTitle(p)}</a> : '—'}</dd></div>
            {d.request_id && <div className="info-row"><dt>الطلب</dt><dd><a href={href('requests/' + d.request_id)}>افتح</a></dd></div>}
            <div className="info-row"><dt>المبلغ المتفق عليه</dt><dd>{d.agreed_amount != null ? price(d.agreed_amount, d.agreed_currency) : d.agreed_raw || '—'}</dd></div>
            {d.closed_at && <div className="info-row"><dt>تاريخ الإتمام</dt><dd>{fmtDate(d.closed_at)}</dd></div>}
          </dl>
          {d.client_person_id && <ContactActions personId={d.client_person_id} link={{ deal_id: id }} />}
          <div className="row-actions"><LinkBtn small icon="calendar" href={href(`appointments/new?deal=${id}&person=${d.client_person_id || ''}&property=${d.property_id || ''}`)}>رتّب معاينة / موعد</LinkBtn></div>
          {d.notes && <p className="private-note">{d.notes}</p>}
        </Section>
        <Section title="الوثائق الخاصة بالصفقة" collapsible defaultOpen={false}><Photos ownerType="deal" ownerId={id} kind="document" /></Section>
        <Section title="سجل التواصل"><Timeline link={{ deal_id: id }} /></Section>
      </div>
      <div><Commissions deal={d} /></div>
    </div>
    {lost && <LostSheet deal={d} onClose={() => setLost(false)} />}
    {edit === 'info' && <DealEditSheet deal={d} onClose={() => setEdit(false)} />}
    {edit === 'availability' && p && <Sheet title="تحديث حالة العقار؟" onClose={() => setEdit(false)} footer={<><Btn onClick={() => setEdit(false)}>لاحقاً</Btn><Btn kind="primary" onClick={() => { update('properties', p.id, { availability: p.deal === 'rent' ? 'rented' : 'sold' }); setEdit(false); }}>نعم، {p.deal === 'rent' ? 'أُجّر' : 'بيع'}</Btn></>}><p>تمت الصفقة. هل تريد تغيير حالة {p.ref} إلى «{p.deal === 'rent' ? 'مؤجر' : 'بيع'}»؟ {p.published ? 'سيُسحب نشره تلقائياً.' : ''}</p></Sheet>}
  </div>;
}

function LostSheet({ deal, onClose }) {
  const [reason, setReason] = useState('');
  const presets = ['السعر مرتفع', 'وجد عقاراً آخر', 'المالك تراجع', 'مشكلة في الوثائق', 'لم يعد يرد', 'غير معروف'];
  return <Sheet title="توقفت الفرصة" onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={() => { update('deals', deal.id, { stage: 'lost', lost_reason: reason === 'غير معروف' ? '' : reason, closed_at: new Date().toISOString() }); onClose(); }}>حفظ</Btn></>}>
    <Field label="السبب (إن عُرف)"><div className="chips">{presets.map((p) => <button key={p} type="button" className={reason === p ? 'chip on' : 'chip'} onClick={() => setReason(p)}>{p}</button>)}</div><Input value={reason} onChange={setReason} /></Field>
    <p className="hint">يمكن إعادة فتحها لاحقاً.</p>
  </Sheet>;
}

function DealEditSheet({ deal, onClose }) {
  const [v, setV] = useState({ ...deal });
  const props = useTable('properties').filter((p) => !p.archived_at);
  const save = () => { const keys = ['title', 'client_person_id', 'owner_person_id', 'property_id', 'agreed_raw', 'agreed_amount', 'agreed_currency', 'notes']; update('deals', deal.id, Object.fromEntries(keys.filter((k) => v[k] !== deal[k]).map((k) => [k, v[k]]))); onClose(); };
  return <Sheet title="تعديل الفرصة" onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ</Btn></>}>
    <Field label="العنوان"><Input value={v.title} onChange={(x) => setV({ ...v, title: x })} /></Field>
    <PersonPicker value={v.client_person_id} onChange={(x) => setV({ ...v, client_person_id: x })} label="العميل" />
    <PersonPicker value={v.owner_person_id} onChange={(x) => setV({ ...v, owner_person_id: x })} label="المالك / البائع" />
    <Field label="العقار"><Select value={v.property_id} onChange={(x) => setV({ ...v, property_id: x })} placeholder="—" options={props.map((q) => [q.id, `${q.ref} ${propertyTitle(q)}`])} /></Field>
    <div className="grid2">
      <Field label="المبلغ المتفق عليه"><NumInput value={v.agreed_amount} onChange={(x) => setV({ ...v, agreed_amount: x })} /></Field>
      <Field label="العملة"><Seg value={v.agreed_currency} onChange={(x) => setV({ ...v, agreed_currency: x })} options={[['MRO', 'قديمة'], ['MRU', 'جديدة'], ['unknown', 'غير مؤكدة']]} /></Field>
    </div>
    <Field label="ملاحظات خاصة"><TextArea value={v.notes} onChange={(x) => setV({ ...v, notes: x })} rows={3} /></Field>
  </Sheet>;
}

// ---------- العمولات ----------
function Commissions({ deal }) {
  const comms = useTable('commissions').filter((c) => c.deal_id === deal.id && !c.archived_at);
  const pays = useTable('commission_payments');
  const [edit, setEdit] = useState(null);
  const [pay, setPay] = useState(null);
  return <Section title="العمولة" actions={<Btn small icon="plus" onClick={() => setEdit({ basis: 'fixed', currency: deal.agreed_currency || 'unknown', base_amount: deal.agreed_amount, shares: [] })}>اتفاق عمولة</Btn>}>
    <p className="hint">سجّل ما اتُّفق عليه فعلاً. لا نفترض نسبة ثابتة، ولا تُعتبر العمولة محصلة إلا بتسجيل الدفعات.</p>
    {!comms.length && <p className="muted small">لا يوجد اتفاق عمولة مسجل.</p>}
    {comms.map((c) => {
      const ps = pays.filter((x) => x.commission_id === c.id && !x.archived_at).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
      const paid = ps.reduce((s, x) => s + Number(x.amount || 0), 0);
      const rem = c.amount != null ? c.amount - paid : null;
      const cur = CURRENCIES[c.currency]?.label || '';
      return <div key={c.id} className="commission">
        <div className="c-head"><b>{c.party_person_id ? 'مع ' + personLabel(c.party_person_id) : 'الطرف غير محدد'}</b> <span className="tag">{c.basis === 'percent' ? `${c.percent ?? '?'}% من ${c.base_amount != null ? formatAmountWords(c.base_amount) : '؟'}` : 'مبلغ ثابت'}</span> <Btn small kind="ghost" icon="edit" onClick={() => setEdit(c)} aria-label="تعديل" /></div>
        {c.agreement && <p className="small">{c.agreement}</p>}
        <div className="money-grid">
          <div><small>المستحق</small><b>{c.amount != null ? `${formatAmountWords(c.amount)} ${cur}` : 'غير محدد'}</b></div>
          <div><small>المدفوع</small><b>{formatAmountWords(paid) || '0'} {cur}</b></div>
          <div className={rem > 0 ? 'due' : ''}><small>المتبقي</small><b>{rem != null ? `${formatAmountWords(rem) || 0} ${cur}` : '—'}</b></div>
        </div>
        {c.due_at && <p className="small">موعد الاستحقاق: {fmtDate(c.due_at)}</p>}
        {(c.shares || []).length > 0 && <div className="small"><b>حصص الشركاء:</b> {(c.shares || []).map((s, i) => <span key={i}>{s.person_id ? personLabel(s.person_id) : s.name} ({s.percent != null ? s.percent + '%' : formatAmountWords(s.amount)}){c.amount != null && s.percent != null ? ` = ${formatAmountWords(c.amount * s.percent / 100)}` : ''}؛ </span>)}</div>}
        <ul className="plain small">{ps.map((x) => <li key={x.id}>✓ {fmtDate(x.paid_at)}: {formatAmountWords(x.amount)} {cur} {x.method && `(${x.method})`} <button className="linklike" onClick={() => archive('commission_payments', x.id)}>حذف</button></li>)}</ul>
        <Btn small icon="plus" onClick={() => setPay(c)}>سجّل دفعة</Btn>
      </div>;
    })}
    {edit && <CommissionSheet deal={deal} c={edit} onClose={() => setEdit(null)} />}
    {pay && <PaySheet c={pay} onClose={() => setPay(null)} />}
  </Section>;
}

function CommissionSheet({ deal, c, onClose }) {
  const [v, setV] = useState({ ...c });
  const computed = v.basis === 'percent' && v.percent != null && v.base_amount != null ? Math.round(v.base_amount * v.percent) / 100 : null;
  const save = () => {
    const body = { party_person_id: v.party_person_id || null, basis: v.basis, percent: v.basis === 'percent' ? v.percent : null, base_amount: v.base_amount ?? null, amount: v.amount ?? computed, currency: v.currency, agreement: v.agreement || '', due_at: v.due_at || null, shares: v.shares || [], notes: v.notes || '' };
    if (c.id) update('commissions', c.id, body); else create('commissions', { ...body, deal_id: deal.id });
    onClose();
  };
  return <Sheet title="اتفاق العمولة" onClose={onClose} footer={<>{c.id && <Btn kind="ghost" onClick={() => { archive('commissions', c.id); onClose(); }}>حذف</Btn>}<Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" onClick={save}>حفظ</Btn></>}>
    <PersonPicker value={v.party_person_id} onChange={(x) => setV({ ...v, party_person_id: x })} label="الطرف المتفق معه" />
    <Field label="الأساس"><Seg value={v.basis} onChange={(x) => setV({ ...v, basis: x })} options={[['fixed', 'مبلغ ثابت'], ['percent', 'نسبة']]} /></Field>
    <Field label="العملة"><Seg value={v.currency} onChange={(x) => setV({ ...v, currency: x })} options={[['MRO', 'أوقية قديمة'], ['MRU', 'أوقية جديدة'], ['unknown', 'غير مؤكدة']]} /></Field>
    {v.basis === 'percent' && <div className="grid2">
      <Field label="النسبة %"><NumInput value={v.percent} onChange={(x) => setV({ ...v, percent: x })} /></Field>
      <Field label="تُحسب من مبلغ" hint={v.base_amount != null ? formatAmountWords(v.base_amount) : ''}><NumInput value={v.base_amount} onChange={(x) => setV({ ...v, base_amount: x })} /></Field>
    </div>}
    <Field label="المبلغ المستحق" hint={computed != null ? `المحسوب: ${formatAmountWords(computed)} — يمكنك تعديله` : ''}><NumInput value={v.amount ?? computed} onChange={(x) => setV({ ...v, amount: x })} /></Field>
    <Field label="نص الاتفاق"><Input value={v.agreement} onChange={(x) => setV({ ...v, agreement: x })} placeholder="مثلاً: على البائع، تُدفع عند التوقيع" /></Field>
    <Field label="موعد الاستحقاق"><input type="date" value={toDateInput(v.due_at)} onChange={(e) => setV({ ...v, due_at: fromDateInput(e.target.value) })} /></Field>
    <Field label="حصص الشركاء (وسطاء آخرون)">
      {(v.shares || []).map((s, i) => <div key={i} className="inline-form"><input value={s.name || personLabel(s.person_id)} onChange={(e) => { const sh = [...v.shares]; sh[i] = { ...s, name: e.target.value }; setV({ ...v, shares: sh }); }} placeholder="الاسم" /><input inputMode="decimal" value={s.percent ?? ''} onChange={(e) => { const sh = [...v.shares]; sh[i] = { ...s, percent: e.target.value === '' ? null : Number(e.target.value) }; setV({ ...v, shares: sh }); }} placeholder="%" style={{ maxWidth: 80 }} /><button type="button" className="linklike" onClick={() => setV({ ...v, shares: v.shares.filter((_, j) => j !== i) })}>حذف</button></div>)}
      <button type="button" className="linklike" onClick={() => setV({ ...v, shares: [...(v.shares || []), { name: '', percent: null }] })}>+ شريك</button>
    </Field>
  </Sheet>;
}

function PaySheet({ c, onClose }) {
  const [amount, setAmount] = useState(null);
  const [date, setDate] = useState(new Date().toISOString());
  const [method, setMethod] = useState('');
  return <Sheet title="دفعة عمولة" onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind="primary" disabled={!amount} onClick={() => { create('commission_payments', { commission_id: c.id, amount, paid_at: date, method }); onClose(); }}>حفظ</Btn></>}>
    <Field label={`المبلغ (${CURRENCIES[c.currency]?.label})`} hint={amount ? formatAmountWords(amount) : ''}><NumInput value={amount} onChange={setAmount} /></Field>
    <Field label="التاريخ"><input type="date" value={toDateInput(date)} onChange={(e) => setDate(fromDateInput(e.target.value))} /></Field>
    <Field label="الوسيلة"><Input value={method} onChange={setMethod} placeholder="نقداً، بنكيلي، تحويل…" /></Field>
  </Sheet>;
}

function CommissionsList() {
  const comms = useTable('commissions').filter((c) => !c.archived_at);
  const pays = useTable('commission_payments').filter((p) => !p.archived_at);
  const deals = useTable('deals');
  const rows = comms.map((c) => { const paid = pays.filter((p) => p.commission_id === c.id).reduce((s, p) => s + Number(p.amount), 0); return { c, paid, rem: c.amount != null ? c.amount - paid : null, d: deals.find((x) => x.id === c.deal_id) }; });
  const totals = {};
  for (const r of rows) if (r.d?.stage === 'won' && r.rem > 0) totals[r.c.currency] = (totals[r.c.currency] || 0) + r.rem;
  return <div className="page">
    <div className="page-head"><h1>العمولات</h1><LinkBtn small href={href('deals')}>الصفقات</LinkBtn></div>
    <div className="kpis">{Object.entries(totals).map(([k, v]) => <div key={k} className="kpi"><b>{formatAmountWords(v)}</b><span>متبقٍ من صفقات تمت ({CURRENCIES[k].label})</span></div>)}{!Object.keys(totals).length && <div className="kpi"><b>0</b><span>لا عمولات مستحقة متبقية</span></div>}</div>
    <table className="table"><thead><tr><th>الصفقة</th><th>المرحلة</th><th>الطرف</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th>الاستحقاق</th></tr></thead>
      <tbody>{rows.map(({ c, paid, rem, d }) => <tr key={c.id}><td><a href={href('deals/' + c.deal_id)}>{d?.title || 'صفقة'}</a></td><td>{DEAL_STAGES[d?.stage]}</td><td>{personLabel(c.party_person_id)}</td><td>{c.amount != null ? formatAmountWords(c.amount) : '—'} {CURRENCIES[c.currency]?.short}</td><td>{formatAmountWords(paid) || 0}</td><td className={rem > 0 ? 'due' : ''}>{rem != null ? formatAmountWords(rem) || 0 : '—'}</td><td>{fmtDate(c.due_at)}</td></tr>)}</tbody></table>
  </div>;
}
