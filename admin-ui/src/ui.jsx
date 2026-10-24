import React, { useEffect, useRef, useState, createContext, useContext } from 'react';

// أيقونات بسيطة (SVG داخلي، بلا مكتبات)
const P = {
  today: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v10H5zm2 2v3h3v-3z',
  inbox: 'M3 4h18v12h-5l-2 3h-4l-2-3H3zm2 2v8h4.2l2 3h1.6l2-3H19V6z',
  home: 'M12 3 2 11h3v9h6v-6h2v6h6v-9h3z',
  request: 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-7 2-7 4.5V20h14v-2.5C16 15 13 13 9 13zm8-1.9a3.5 3.5 0 1 0-1-6.8 5.9 5.9 0 0 1 0 6.4c.3.2.7.4 1 .4zm1.7 2.1A5.6 5.6 0 0 1 18 17.5V20h4v-2.5c0-1.8-1.3-3.2-3.3-4.3z',
  calendar: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM5 9h14v11H5z',
  deal: 'M12 2 3 7v2h18V7zM5 11v7H3v2h18v-2h-2v-7h-2v7h-3v-7h-2v7H8v-7z',
  settings: 'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  search: 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
  phone: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z',
  wa: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.47-.72-1.7-.8s-.39-.13-.56.12-.64.8-.78.97-.29.19-.54.06a6.7 6.7 0 0 1-3.3-2.9c-.25-.43.25-.4.71-1.33a.45.45 0 0 0-.02-.42c-.06-.12-.56-1.34-.76-1.84s-.4-.42-.56-.43h-.48a.92.92 0 0 0-.67.31 2.8 2.8 0 0 0-.87 2.08 4.9 4.9 0 0 0 1.02 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.23.75 3.03.63a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .15-1.2c-.06-.1-.23-.17-.48-.29z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5h-2v6l5 3 1-1.7-4-2.3z',
  task: 'M19 3h-4.2A3 3 0 0 0 12 1a3 3 0 0 0-2.8 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-9 14-4-4 1.4-1.4 2.6 2.6 6.6-6.6L18 9z',
  match: 'M17 7h-4v2h4a3 3 0 0 1 0 6h-4v2h4a5 5 0 0 0 0-10zm-6 8H7a3 3 0 0 1 0-6h4V7H7a5 5 0 0 0 0 10h4zm-3-4h8v2H8z',
  alert: 'M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z',
  money: 'M3 6h18v12H3zm2 2v8h14V8zm7 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
  mic: 'M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1a7 7 0 0 0 6-6.9z',
  stop: 'M6 6h12v12H6z',
  paste: 'M19 3h-4.2A3 3 0 0 0 12 1a3 3 0 0 0-2.8 2H5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm7 17H5V5h2v3h10V5h2z',
  photo: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5z',
  back: 'M4 11h12.2l-5.6-5.6L12 4l8 8-8 8-1.4-1.4 5.6-5.6H4z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  more: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  edit: 'M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8L19 8.8z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4a14 14 0 0 1 1.9 4h-3.8A14 14 0 0 1 12 4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4zm.8 2h3a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.3-3.6A15.7 15.7 0 0 0 8.1 8zM12 20a14 14 0 0 1-1.9-4h3.8A14 14 0 0 1 12 20zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6a15.7 15.7 0 0 0 1.4-3.6h3a8 8 0 0 1-4.4 3.6zm1.7-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4z',
  sync: 'M12 4V1L8 5l4 4V6a6 6 0 0 1 5.7 7.9l1.5 1.5A8 8 0 0 0 12 4zm0 14a6 6 0 0 1-5.7-7.9L4.8 8.6A8 8 0 0 0 12 20v3l4-4-4-4z',
  archive: 'M20.5 5.2 19.1 3.5A1.5 1.5 0 0 0 18 3H6a1.5 1.5 0 0 0-1.2.5L3.5 5.2A2 2 0 0 0 3 6.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5a2 2 0 0 0-.5-1.3zM12 17.5 6.5 12H10v-2h4v2h3.5zM5.1 5l.8-1h12l.9 1z',
  star: 'M12 17.3 18.2 21l-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2 7.4 14l-1.6 7z',
  location: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2a7 7 0 0 0-6-6V3h-2v2a7 7 0 0 0-6 6H3v2h2a7 7 0 0 0 6 6v2h2v-2a7 7 0 0 0 6-6h2zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10z',
  link: 'M3.9 12A3.1 3.1 0 0 1 7 8.9h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z',
  share: 'M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z',
  download: 'M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z',
  eye: 'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};
export function Icon({ name, size = 20, ...rest }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" {...rest}><path d={P[name] || P.more} fill="currentColor" /></svg>;
}

// أنواع العناصر: نص + أيقونة + لون (لا نعتمد على اللون وحده)
export const KIND = {
  request: { label: 'طلب', icon: 'request', cls: 'k-request' },
  offer: { label: 'عرض', icon: 'home', cls: 'k-offer' },
  property: { label: 'عرض', icon: 'home', cls: 'k-offer' },
  planlot: { label: 'قطعة', icon: 'pin', cls: 'k-match' },
  appointment: { label: 'موعد', icon: 'calendar', cls: 'k-appt' },
  task: { label: 'مهمة', icon: 'task', cls: 'k-task' },
  inbox: { label: 'وارد', icon: 'inbox', cls: 'k-inbox' },
  match: { label: 'مطابقة', icon: 'match', cls: 'k-match' },
  stale: { label: 'تحقق', icon: 'alert', cls: 'k-stale' },
  commission: { label: 'عمولة', icon: 'money', cls: 'k-money' },
  deal: { label: 'فرصة', icon: 'deal', cls: 'k-deal' },
  person: { label: 'شخص', icon: 'people', cls: 'k-person' },
  activity: { label: 'ملاحظة', icon: 'doc', cls: 'k-task' },
  geometry: { label: 'قطعة', icon: 'pin', cls: 'k-offer' },
};
export function KindTag({ kind, small }) {
  const k = KIND[kind] || KIND.task;
  return <span className={`kind ${k.cls}${small ? ' small' : ''}`}><Icon name={k.icon} size={small ? 14 : 16} /><span>{k.label}</span></span>;
}

export function Btn({ children, kind = 'default', icon, small, block, ...rest }) {
  return <button type="button" className={`btn btn-${kind}${small ? ' btn-sm' : ''}${block ? ' btn-block' : ''}`} {...rest}>{icon && <Icon name={icon} size={small ? 16 : 18} />}{children != null && <span>{children}</span>}</button>;
}
export function LinkBtn({ children, kind = 'default', icon, small, href, ...rest }) {
  return <a className={`btn btn-${kind}${small ? ' btn-sm' : ''}`} href={href} {...rest}>{icon && <Icon name={icon} size={small ? 16 : 18} />}{children != null && <span>{children}</span>}</a>;
}

export function Field({ label, hint, error, children, wide, required }) {
  // لا يُلفّ بـ<label> إلا حقل إدخال واحد؛ مجموعات الأزرار تُلف بـ<div> (وإلا يختار النقرُ على العنوان أولَ زر)
  const group = !(children && ['input', 'select', 'textarea', Input, NumInput, TextArea, Select].includes(children.type));
  const Tag = group ? 'div' : 'label';
  return <Tag className={`field${wide ? ' wide' : ''}${error ? ' has-error' : ''}`} {...(group ? { role: 'group', 'aria-label': typeof label === 'string' ? label : undefined } : {})}><span className="field-label">{label}{required && <b className="req"> *</b>}</span>{children}{hint && <small className="hint">{hint}</small>}{error && <small className="error">{error}</small>}</Tag>;
}
export function Input({ value, onChange, ...rest }) {
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function NumInput({ value, onChange, ...rest }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => { if (value == null ? txt !== '' : Number(toLatin(txt)) !== value) setTxt(value == null ? '' : String(value)); }, [value]); // eslint-disable-line
  return <input inputMode="decimal" value={txt} onChange={(e) => { setTxt(e.target.value); const t = toLatin(e.target.value).replace(/[^\d.]/g, ''); onChange(t === '' ? null : Number(t)); }} {...rest} />;
}
const toLatin = (s) => String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g, '').replace('٫', '.');
export function TextArea({ value, onChange, ...rest }) {
  return <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function Select({ value, onChange, options, placeholder, ...rest }) {
  return <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...rest}>{placeholder !== undefined && <option value="">{placeholder}</option>}{options.map((o) => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <optgroup key={o.label} label={o.label}>{o.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}</select>;
}
export function Seg({ value, onChange, options, allowNone }) {
  return <div className="seg" role="radiogroup">{options.map(([v, l]) => <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(allowNone && value === v ? null : v)}>{l}</button>)}</div>;
}
export function Chips({ value = [], onChange, options }) {
  const set = new Set(value || []);
  return <div className="chips">{options.map(([v, l]) => <button type="button" key={v} aria-pressed={set.has(v)} className={set.has(v) ? 'chip on' : 'chip'} onClick={() => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); onChange([...n]); }}>{l}</button>)}</div>;
}
export function Toggle({ checked, onChange, label, hint }) {
  return <label className="toggle"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><span className="track" aria-hidden="true" /><span><span>{label}</span>{hint && <small className="hint">{hint}</small>}</span></label>;
}

export function Sheet({ title, onClose, children, footer, wide }) {
  const ref = useRef();
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', k);
    const prev = document.activeElement;
    ref.current?.querySelector('input,textarea,select,button')?.focus?.();
    document.body.classList.add('noscroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noscroll'); prev?.focus?.(); };
  }, []); // eslint-disable-line
  return <div className="sheet-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <div className="sheet-head"><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق"><Icon name="close" /></button></div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </div>
  </div>;
}

const ToastCtx = createContext(() => {});
export function ToastHost({ children }) {
  const [list, setList] = useState([]);
  const push = (msg, kind = 'info') => { const id = Math.random(); setList((l) => [...l, { id, msg, kind }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 3500); };
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" role="status" aria-live="polite">{list.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

export function Empty({ title, children, action }) {
  return <div className="empty"><p className="empty-title">{title}</p>{children && <p className="muted">{children}</p>}{action}</div>;
}

export function Section({ title, actions, children, collapsible, defaultOpen = true, count }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className="section">
    <div className="section-head">
      {collapsible ? <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><h3>{title}{count != null && <small> ({count})</small>}</h3><span aria-hidden="true">{open ? '▾' : '◂'}</span></button> : <h3>{title}{count != null && <small> ({count})</small>}</h3>}
      {actions && <div className="section-actions">{actions}</div>}
    </div>
    {(!collapsible || open) && children}
  </section>;
}

export function Confirm({ title, message, confirmLabel = 'تأكيد', danger, onConfirm, onClose }) {
  return <Sheet title={title} onClose={onClose} footer={<><Btn onClick={onClose}>إلغاء</Btn><Btn kind={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Btn></>}><p>{message}</p></Sheet>;
}

export function Pending({ row }) {
  if (!row?._pending) return null;
  return <span className="pending-dot" title="بانتظار الإرسال إلى الخادم">بانتظار الإرسال</span>;
}

export function useIsWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setWide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return wide;
}
