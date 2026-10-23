import React, { useState } from 'react';
import { login, recover } from '../data.js';
import { Btn, Field, Input } from '../ui.jsx';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === 'login') {
      const r = await login(email, password);
      if (r.error) setMsg({ err: true, text: r.error });
    } else {
      const r = await recover(email, code, password);
      if (r.error) setMsg({ err: true, text: r.error });
      else { setMsg({ text: `تم تغيير كلمة المرور. بقي ${r.codesLeft} رموز استعادة. سجّل الدخول الآن.` }); setMode('login'); setPassword(''); setCode(''); }
    }
    setBusy(false);
  };
  return <div className="login">
    <form className="login-card" onSubmit={submit}>
      <img src="/static/icon.svg" alt="" width="52" />
      <h1>{mode === 'login' ? 'مساحة العمل' : 'استعادة الوصول'}</h1>
      <p className="muted">{mode === 'login' ? 'هذه الصفحة خاصة بإدارة الوسيط. الزوار يمكنهم تصفح العقارات من الموقع العام.' : 'أدخل بريدك وأحد رموز الاستعادة التي حصلت عليها عند إنشاء الحساب، ثم اختر كلمة مرور جديدة.'}</p>
      <Field label="البريد الإلكتروني"><Input type="email" value={email} onChange={setEmail} autoComplete="username" required dir="ltr" /></Field>
      {mode === 'recover' && <Field label="رمز الاستعادة"><Input value={code} onChange={setCode} required dir="ltr" placeholder="XXXXX-XXXXX" /></Field>}
      <Field label={mode === 'login' ? 'كلمة المرور' : 'كلمة المرور الجديدة'} hint={mode === 'recover' ? '10 أحرف على الأقل' : null}><Input type="password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></Field>
      {msg && <p className={msg.err ? 'form-msg err' : 'form-msg ok'} role="alert">{msg.text}</p>}
      <Btn kind="primary" block type="submit" disabled={busy}>{busy ? 'جارٍ…' : mode === 'login' ? 'دخول' : 'تغيير كلمة المرور'}</Btn>
      <button type="button" className="linklike" onClick={() => { setMode(mode === 'login' ? 'recover' : 'login'); setMsg(null); }}>{mode === 'login' ? 'نسيت كلمة المرور؟' : 'رجوع إلى الدخول'}</button>
      <a className="linklike" href="/">الذهاب إلى الموقع العام</a>
    </form>
  </div>;
}
