import React, { useEffect, useRef, useState } from 'react';
import { Sheet, Btn, Field, Input, Seg, useToast } from './ui.jsx';
import { loadLeaflet, tileLayer, pinIcon, useSettings } from './components.jsx';
import { parseLocation } from '@shared/geolink.js';
import { api, getState } from './data.js';
import { table } from './data.js';

// تحديد الموقع: علامة على الخريطة، موقعي (بعد الإذن)، إحداثيات، أو رابط خرائط.
export default function MapPicker({ value, onSave, onClose }) {
  const settings = useSettings();
  const el = useRef();
  const mapRef = useRef();
  const markerRef = useRef();
  const [pos, setPos] = useState(value.lat != null ? { lat: value.lat, lng: value.lng } : null);
  const [method, setMethod] = useState(value.location_method || 'pin');
  const [precision, setPrecision] = useState(value.location_precision && value.location_precision !== 'none' ? value.location_precision : 'exact');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const center = () => {
    if (pos) return [pos.lat, pos.lng];
    const m = value.moughataa_code && table('moughataas').find((x) => x.code === value.moughataa_code);
    if (m?.lat) return [m.lat, m.lng];
    const w = value.wilaya_code && table('wilayas').find((x) => x.code === value.wilaya_code);
    if (w?.lat) return [w.lat, w.lng];
    return settings.map_center || [18.0858, -15.9785];
  };

  useEffect(() => {
    let map;
    loadLeaflet().then((L) => {
      setLoading(false);
      map = L.map(el.current).setView(center(), pos ? 17 : 13);
      tileLayer(L, settings).addTo(map);
      map.attributionControl.setPrefix(false);
      mapRef.current = { map, L };
      if (pos) markerRef.current = L.marker([pos.lat, pos.lng], { icon: pinIcon(L), draggable: true }).addTo(map).on('dragend', (e) => { const p = e.target.getLatLng(); setPos({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); setMethod('pin'); });
      map.on('click', (e) => { place(e.latlng.lat, e.latlng.lng, 'pin', false); });
      setTimeout(() => map.invalidateSize(), 200);
    }).catch(() => { setLoading(false); setMsg('تعذر تحميل الخريطة. يمكنك إدخال الإحداثيات أو الرابط.'); });
    return () => map?.remove();
  }, []); // eslint-disable-line

  function place(lat, lng, how, fly = true) {
    const p = { lat: +(+lat).toFixed(6), lng: +(+lng).toFixed(6) };
    setPos(p); setMethod(how);
    const m = mapRef.current;
    if (!m) return;
    if (markerRef.current) markerRef.current.setLatLng([p.lat, p.lng]);
    else markerRef.current = m.L.marker([p.lat, p.lng], { icon: pinIcon(m.L), draggable: true }).addTo(m.map).on('dragend', (e) => { const q = e.target.getLatLng(); setPos({ lat: +q.lat.toFixed(6), lng: +q.lng.toFixed(6) }); setMethod('pin'); });
    if (fly) m.map.setView([p.lat, p.lng], 17);
  }

  const useMine = () => {
    if (!navigator.geolocation) { setMsg('هذا الجهاز لا يدعم تحديد الموقع.'); return; }
    setMsg('جارٍ تحديد موقعك… (سيطلب المتصفح إذنك)');
    navigator.geolocation.getCurrentPosition(
      (g) => { place(g.coords.latitude, g.coords.longitude, 'gps'); setMsg(`تم. الدقة حوالي ${Math.round(g.coords.accuracy)} م.${g.coords.accuracy > 50 ? ' الدقة ضعيفة؛ يمكنك سحب العلامة لتصحيحها.' : ''}`); },
      (err) => setMsg(err.code === 1 ? 'رُفض إذن الموقع. يمكنك السماح به من إعدادات المتصفح، أو وضع العلامة يدوياً.' : 'تعذر تحديد الموقع الآن.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const fromText = async () => {
    const t = text.trim(); if (!t) return;
    const p = parseLocation(t);
    if (p) { place(p.lat, p.lng, /^https?:/.test(t) ? 'link' : 'coords'); setMsg('تم قراءة الموقع.'); return; }
    if (/^https?:\/\//.test(t)) {
      if (!getState().online) { setMsg('معالجة الروابط المختصرة تحتاج اتصالاً. الصق الإحداثيات بدلاً منها.'); return; }
      setMsg('جارٍ قراءة الرابط…');
      const r = await api('POST', '/location/resolve', { url: t }).catch(() => null);
      if (r?.ok && r.data.ok) { place(r.data.lat, r.data.lng, 'link'); setMsg('تم قراءة الموقع من الرابط.'); }
      else setMsg(r?.data?.message || 'تعذر قراءة الرابط.');
      return;
    }
    setMsg('لم نجد إحداثيات. مثال صحيح: 18.0858, -15.9785');
  };

  return <Sheet title="الموقع على الخريطة" wide onClose={onClose} footer={<>
    {value.lat != null && <Btn kind="ghost" onClick={() => { onSave({ lat: null, lng: null, location_method: null, location_precision: 'none' }); onClose(); }}>إزالة الموقع</Btn>}
    <Btn onClick={onClose}>إلغاء</Btn>
    <Btn kind="primary" disabled={!pos} onClick={() => { onSave({ lat: pos.lat, lng: pos.lng, location_method: method, location_precision: precision }); onClose(); toast('حُفظ الموقع'); }}>حفظ الموقع</Btn>
  </>}>
    <div className="map-tools">
      <Btn small icon="location" onClick={useMine}>موقعي الحالي</Btn>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); fromText(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="الصق رابط خرائط أو إحداثيات" dir="ltr" />
        <Btn small type="submit">قراءة</Btn>
      </form>
    </div>
    <div ref={el} className="map map-pick">{loading && <p className="muted pad">جارٍ تحميل الخريطة…</p>}</div>
    <p className="hint">اضغط على الخريطة لوضع العلامة، واسحبها للتصحيح. {pos && <span dir="ltr">({pos.lat}, {pos.lng})</span>}</p>
    {msg && <p className="form-msg">{msg}</p>}
    <Field label="دقة هذا الموقع">
      <Seg value={precision} onChange={setPrecision} options={[['exact', 'دقيق (عند العقار)'], ['approximate', 'تقريبي (المنطقة)']]} />
    </Field>
    <p className="hint">ما يظهر للجمهور يُحدد لاحقاً في إعدادات النشر (دقيق، تقريبي، أو مخفي). هذا الموقع أدخلته بنفسك ولا يمثل حدوداً موثقة.</p>
  </Sheet>;
}
