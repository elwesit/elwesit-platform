// طبقة البيانات على الجهاز: نسخة من بيانات الخادم في IndexedDB + طابور عمليات (outbox).
// - كل تعديل يظهر فوراً، ويُرسل مرة واحدة بمعرّف عملية (لا تكرار عند إعادة المحاولة).
// - بلا شبكة: يبقى في الطابور ويُرسل عند عودة الاتصال، والواجهة توضح ما ينتظر.
// - إذا عدّل جهاز آخر الحقل نفسه: لا كتابة صامتة؛ يظهر «تضارب» لتختار.
import { useSyncExternalStore, useMemo, useEffect } from 'react';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
export { uuid };

// ---------- IndexedDB ----------
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open('wasit', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('blobs'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
async function idbOp(store, mode, fn) {
  try {
    const d = await idb();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { console.warn('idb', e); return undefined; }
}
const kvGet = (k) => idbOp('kv', 'readonly', (s) => s.get(k));
const kvSet = (k, v) => idbOp('kv', 'readwrite', (s) => s.put(v, k));
export const blobPut = (k, v) => idbOp('blobs', 'readwrite', (s) => s.put(v, k));
export const blobGet = (k) => idbOp('blobs', 'readonly', (s) => s.get(k));
const blobDel = (k) => idbOp('blobs', 'readwrite', (s) => s.delete(k));
async function idbClear() { await idbOp('kv', 'readwrite', (s) => s.clear()); await idbOp('blobs', 'readwrite', (s) => s.clear()); }

// ---------- الحالة ----------
const TABLES = ['areas', 'people', 'phones', 'properties', 'property_sources', 'geometries', 'requests', 'sent_offers', 'activities', 'tasks', 'appointments', 'deals', 'commissions', 'commission_payments', 'files', 'inbox', 'captures', 'templates', 'dismissals', 'wilayas', 'moughataas'];

let state = {
  ready: false, auth: 'unknown', user: null,
  server: Object.fromEntries(TABLES.map((t) => [t, {}])),
  outbox: [], failed: [], conflicts: [],
  lastSync: null, online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false, syncError: null,
  settings: null, inFlight: null,
};
const listeners = new Set();
function set(patch) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
  schedulePersist();
}
export const getState = () => state;
export function useStore() { return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state); }

let persistTimer = null;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (state.auth !== 'in') return;
    kvSet('snapshot', { server: state.server, outbox: state.outbox, failed: state.failed, conflicts: state.conflicts, lastSync: state.lastSync, settings: state.settings, user: state.user });
  }, 400);
}

// ---------- العرض المشتق: بيانات الخادم + العمليات المنتظرة ----------
const viewCache = new Map();
export function table(name, s = state) {
  const key = name;
  const c = viewCache.get(key);
  if (c && c.server === s.server[name] && c.outbox === s.outbox) return c.rows;
  const map = new Map(Object.entries(s.server[name] || {}));
  for (const op of s.outbox) {
    if (op.entity !== name) continue;
    if (op.type === 'create') map.set(op.id, { ...op.body, id: op.id, version: 0, created_at: op.at, updated_at: op.at, ref: op.body.ref || '…', _pending: true });
    else if (op.type === 'update' && map.has(op.id)) {
      const cur = map.get(op.id);
      const p = { ...op.patch };
      if ('archived' in p) { p.archived_at = p.archived ? op.at : null; delete p.archived; }
      map.set(op.id, { ...cur, ...p, _pending: true });
    } else if (op.type === 'upload') map.set(op.id, { id: op.id, ...op.meta, created_at: op.at, updated_at: op.at, _pending: true, _blobKey: op.blobKey, archived_at: null, sort: 999, is_cover: 0 });
  }
  const rows = [...map.values()];
  viewCache.set(key, { server: s.server[name], outbox: s.outbox, rows });
  return rows;
}
export function useTable(name) {
  const s = useStore();
  return useMemo(() => table(name, s), [s.server[name], s.outbox]); // eslint-disable-line
}
export function getRow(name, id) { return id ? table(name).find((r) => r.id === id) : undefined; }
// سجل غير موجود محلياً (رابط لسجل أُنشئ على جهاز آخر): نزامن مرة واحدة قبل الحكم بأنه غير موجود
const missingAsked = new Set();
export function useRow(name, id) {
  const rows = useTable(name);
  const row = useMemo(() => rows.find((r) => r.id === id), [rows, id]);
  useEffect(() => {
    if (!row && id && state.auth === 'in' && state.online && !missingAsked.has(name + id)) { missingAsked.add(name + id); syncNow(); }
  }, [row, id, name]);
  return row;
}
export function storeSnapshot() { return Object.fromEntries(TABLES.map((t) => [t, table(t)])); }

// ---------- الواجهة البرمجية ----------
export async function api(method, path, body, { opId, form, base = '/api/admin' } = {}) {
  const headers = { 'x-wasit': '1' };
  if (opId) headers['x-op-id'] = opId;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + path, { method, headers, body: payload, credentials: 'same-origin' });
  let data = null;
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('json')) data = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, data };
}

// ---------- العمليات ----------
function enqueue(op) {
  op.op_id ||= uuid().replace(/-/g, '');
  op.at ||= new Date().toISOString();
  const outbox = [...state.outbox];
  if (op.type === 'update') {
    // دمج التعديلات المتتالية على السجل نفسه ما دامت لم تُرسل بعد
    for (let i = outbox.length - 1; i >= 0; i--) {
      const o = outbox[i];
      if (o === state.inFlight) break;
      if (o.entity === op.entity && o.id === op.id && (o.type === 'update' || o.type === 'create')) {
        if (o.type === 'create') outbox[i] = { ...o, body: { ...o.body, ...op.patch } };
        else outbox[i] = { ...o, patch: { ...o.patch, ...op.patch } };
        set({ outbox });
        kick();
        return outbox[i];
      }
    }
  }
  outbox.push(op);
  set({ outbox });
  kick();
  return op;
}

export function create(entity, body) {
  const id = body.id || uuid();
  enqueue({ type: 'create', entity, id, body: { ...body, id } });
  return id;
}
export function update(entity, id, patch) {
  const srv = state.server[entity]?.[id];
  enqueue({ type: 'update', entity, id, base_version: srv ? srv.version : 0, patch });
}
export function archive(entity, id, archived = true) { update(entity, id, { archived }); }

// عملية مركبة على الخادم (التقاط سريع، تحويل وارد، نشر...) — تُرسل مرة واحدة وتُتبع بمزامنة
export function call(method, path, body, label) {
  return new Promise((resolve) => {
    const op = enqueue({ type: 'call', method, path, body, label, entity: null, id: uuid() });
    callbacks.set(op.op_id, resolve);
  });
}
const callbacks = new Map();

export async function uploadFile(file, meta) {
  const id = uuid();
  const blobKey = 'up:' + id;
  await blobPut(blobKey, file);
  enqueue({ type: 'upload', entity: 'files', id, blobKey, meta: { kind: meta.kind, owner_type: meta.owner_type, owner_id: meta.owner_id, name: file.name || meta.name || 'file', mime: file.type, size: file.size } });
  return id;
}

let kickTimer = null, backoff = 2000;
function kick(delay = 30) { clearTimeout(kickTimer); kickTimer = setTimeout(flush, delay); }

let flushing = false;
export async function flush() {
  if (flushing || state.auth !== 'in') return;
  flushing = true;
  try {
    while (state.outbox.length) {
      const op = state.outbox[0];
      set({ inFlight: op });
      let res;
      try { res = await send(op); }
      catch (e) {
        // انقطاع شبكة: نتوقف ونعيد المحاولة لاحقاً
        set({ inFlight: null, online: false, syncError: 'لا يوجد اتصال' });
        kick(backoff); backoff = Math.min(backoff * 2, 60000);
        return;
      }
      backoff = 2000;
      if (res.status === 401) { set({ inFlight: null, auth: 'out' }); return; }
      if (res.status >= 500 || res.status === 0) { set({ inFlight: null, syncError: res.data?.message || 'خطأ في الخادم' }); kick(backoff); backoff = Math.min(backoff * 2, 60000); return; }
      const rest = state.outbox.slice(1);
      const server = { ...state.server };
      if (res.status === 409 && res.data?.error === 'conflict') {
        server[op.entity] = { ...server[op.entity], [op.id]: res.data.current };
        set({ server, outbox: rest, inFlight: null, conflicts: [...state.conflicts, { op, fields: res.data.fields, current: res.data.current, at: new Date().toISOString() }] });
        continue;
      }
      if (!res.ok) {
        set({ outbox: rest, inFlight: null, failed: [...state.failed, { op, status: res.status, message: res.data?.message || 'تعذر الحفظ', problems: res.data?.problems }] });
        if (op.type === 'upload') blobDel(op.blobKey);
        callbacks.get(op.op_id)?.({ ok: false, status: res.status, data: res.data }); callbacks.delete(op.op_id);
        continue;
      }
      // نجاح
      const row = res.data?.row;
      let adjusted = rest;
      if (row && op.entity) {
        server[op.entity] = { ...server[op.entity], [row.id]: row };
        // العمليات التالية على السجل نفسه بُنيت على ما رآه المستخدم بعد عمليته هذه
        const prevBase = op.type === 'create' ? 0 : op.base_version;
        if (op.type === 'create' || row.version === prevBase + 1) adjusted = rest.map((o) => (o.type === 'update' && o.entity === op.entity && o.id === op.id && o.base_version === prevBase ? { ...o, base_version: row.version } : o));
      }
      if (op.type === 'upload') blobDel(op.blobKey);
      set({ server, outbox: adjusted, inFlight: null, online: true, syncError: null });
      callbacks.get(op.op_id)?.({ ok: true, data: res.data }); callbacks.delete(op.op_id);
      if (op.type === 'call') needPull = true;
    }
    if (needPull) { needPull = false; await pull(); }
  } finally { flushing = false; }
}
let needPull = false;

async function send(op) {
  if (op.type === 'create') return api('POST', `/e/${op.entity}`, op.body, { opId: op.op_id });
  if (op.type === 'update') return api('PATCH', `/e/${op.entity}/${op.id}`, { base_version: op.base_version, patch: op.patch, force: op.force }, { opId: op.op_id });
  if (op.type === 'call') return api(op.method, op.path, op.body, { opId: op.op_id });
  if (op.type === 'upload') {
    const blob = await blobGet(op.blobKey);
    if (!blob) return { status: 410, ok: false, data: { message: 'الملف لم يعد موجوداً على الجهاز' } };
    const fd = new FormData();
    fd.append('id', op.id); fd.append('kind', op.meta.kind); fd.append('owner_type', op.meta.owner_type); fd.append('owner_id', op.meta.owner_id);
    fd.append('file', blob, op.meta.name);
    return api('POST', '/files', undefined, { opId: op.op_id, form: fd });
  }
}

export async function pull() {
  if (state.auth !== 'in' || state.syncing) return;
  set({ syncing: true });
  try {
    const since = state.lastSync ? new Date(Date.parse(state.lastSync) - 5000).toISOString() : '';
    const r = await api('GET', '/sync?since=' + encodeURIComponent(since));
    if (r.status === 401) { set({ auth: 'out', syncing: false }); return; }
    if (!r.ok) throw new Error(r.data?.message || 'تعذر المزامنة');
    const server = { ...state.server };
    for (const [t, rows] of Object.entries(r.data.data)) {
      const cur = { ...(server[t] || {}) };
      const key = t === 'wilayas' || t === 'moughataas' ? 'code' : 'id';
      for (const row of rows) { const ex = cur[row[key]]; if (!ex || ex.version == null || row.version == null || row.version >= ex.version) cur[row[key]] = row; }
      server[t] = cur;
    }
    set({ server, lastSync: r.data.server_time, syncing: false, online: true, syncError: null });
  } catch (e) {
    set({ syncing: false, online: navigator.onLine ? state.online : false, syncError: e.message === 'Failed to fetch' ? 'لا يوجد اتصال' : e.message });
  }
}

export async function syncNow() { await flush(); await pull(); }

export async function loadSettings() {
  const r = await api('GET', '/settings').catch(() => null);
  if (r?.ok) set({ settings: r.data.settings, waConfigured: r.data.whatsapp_configured });
}

export async function saveSettings(patch) {
  const r = await api('PUT', '/settings', patch);
  if (r.ok) set({ settings: r.data.settings });
  return r;
}

// ---------- التضارب والفشل ----------
export function resolveConflict(index, choice) {
  // choice: {field: 'mine'|'theirs'}
  const c = state.conflicts[index];
  const patch = {};
  for (const [k, v] of Object.entries(c.op.patch)) {
    const f = k === 'archived' ? 'archived_at' : k;
    if (!c.fields.includes(f) || choice[f] === 'mine') patch[k] = v;
  }
  set({ conflicts: state.conflicts.filter((_, i) => i !== index) });
  if (Object.keys(patch).length) enqueue({ type: 'update', entity: c.op.entity, id: c.op.id, base_version: c.current.version, patch });
}
export function dismissFailed(index) { set({ failed: state.failed.filter((_, i) => i !== index) }); }
export function retryFailed(index) { const f = state.failed[index]; set({ failed: state.failed.filter((_, i) => i !== index) }); enqueue({ ...f.op, op_id: undefined }); }

// ---------- الدخول ----------
export async function boot() {
  const snap = await kvGet('snapshot');
  if (snap) {
    const server = { ...state.server, ...snap.server };
    set({ server, outbox: snap.outbox || [], failed: snap.failed || [], conflicts: snap.conflicts || [], lastSync: snap.lastSync, settings: snap.settings, user: snap.user });
  }
  let me = null;
  try { const r = await api('GET', '/me', undefined, { base: '/api/auth' }); me = r.data; set({ online: true }); }
  catch { set({ online: false }); }
  if (me) {
    if (me.staff) { set({ auth: 'in', user: me.user, ready: true }); afterLogin(); }
    else set({ auth: 'out', ready: true });
  } else {
    // بلا شبكة: نعرض النسخة المحفوظة إن كان المستخدم قد سجل الدخول سابقاً على هذا الجهاز؛
    // أي إرسال لاحق يتطلب جلسة صالحة على الخادم.
    set({ auth: snap?.user ? 'in' : 'out', ready: true, offlineBoot: !!snap?.user });
  }
  window.addEventListener('online', () => { set({ online: true }); syncNow(); });
  window.addEventListener('offline', () => set({ online: false }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible' && state.auth === 'in') syncNow(); }, 25000);
}

async function afterLogin() {
  await flush();
  await pull();
  loadSettings();
}

export async function login(email, password) {
  const r = await api('POST', '/login', { email, password }, { base: '/api/auth' }).catch(() => null);
  if (!r) return { error: 'لا يوجد اتصال بالخادم' };
  if (!r.ok) return { error: r.data?.message || 'تعذر الدخول' };
  // حساب مختلف عن المحفوظ على هذا الجهاز: لا نخلط البيانات
  if (state.user && state.user.id !== r.data.user.id) { await idbClear(); set({ server: Object.fromEntries(TABLES.map((t) => [t, {}])), outbox: [], failed: [], conflicts: [], lastSync: null }); }
  set({ auth: 'in', user: r.data.user, offlineBoot: false });
  afterLogin();
  return { ok: true };
}

export async function recover(email, code, password) {
  const r = await api('POST', '/recover', { email, code, password }, { base: '/api/auth' }).catch(() => null);
  if (!r) return { error: 'لا يوجد اتصال بالخادم' };
  if (!r.ok) return { error: r.data?.message || 'تعذر الاستعادة' };
  return { ok: true, codesLeft: r.data.codesLeft };
}

export async function logout({ all = false } = {}) {
  await api('POST', all ? '/logout-all' : '/logout', {}, { base: '/api/auth' }).catch(() => null);
  await idbClear();
  set({ auth: 'out', user: null, server: Object.fromEntries(TABLES.map((t) => [t, {}])), outbox: [], failed: [], conflicts: [], lastSync: null, settings: null });
}

export const fileUrl = (f, thumb) => `/api/admin/files/${f.id}${thumb ? '?thumb=1' : ''}`;
