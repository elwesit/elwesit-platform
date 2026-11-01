// طلبات عاجلة تأتي مع الكود: content/urgent-requests.json فيه {"requests": [{"key", "text", "until"}]}.
// عند التشغيل يُضاف كل طلب جديد أو معدّل إلى قائمة «الطلبات العاجلة» في الإعدادات مرة واحدة،
// فينشر Claude طلبات المالك بطلب منه دون كلمة مرور. الطلب الذي يُحذف من الملف يُحذف من الموقع،
// والطلب الذي يحذفه المالك من لوحة الإدارة لا يعود ما لم يتغير نصه أو تاريخه في الملف.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db, getSettings, now } from './db.js';
import { cleanUrgent } from '../shared/urgent.js';

const KEY = /^[a-z0-9-]{1,60}$/;

export function importUrgentRequests(file = path.join(config.root, 'content', 'urgent-requests.json')) {
  if (!fs.existsSync(file)) return { changed: false };
  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('[urgent] ملف غير صالح:', e.message); return { changed: false }; }
  const items = Array.isArray(spec) ? spec : Array.isArray(spec?.requests) ? spec.requests : [];
  const s = getSettings();
  let list = cleanUrgent(s.urgent_requests);
  const seen = { ...(s.urgent_repo_seen || {}) };
  const keys = new Set();
  const added = [];
  let changed = false;
  for (const it of items) {
    const [item] = cleanUrgent([{ ...it, id: 'repo-' + it?.key, src: 'repo' }]);
    if (!item || !KEY.test(String(it.key || '')) || keys.has(it.key)) { if (it?.key || it?.text) console.error('[urgent] طلب غير صالح في الملف:', JSON.stringify(it).slice(0, 120)); continue; }
    keys.add(it.key);
    const hash = crypto.createHash('sha256').update(JSON.stringify([item.text, item.until])).digest('hex').slice(0, 16);
    if (seen[it.key] === hash) continue;
    seen[it.key] = hash;
    changed = true;
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item; else added.push(item);
  }
  for (const k of Object.keys(seen)) {
    if (keys.has(k)) continue;
    delete seen[k];
    list = list.filter((x) => x.id !== 'repo-' + k);
    changed = true;
  }
  if (!changed) return { changed: false };
  list = cleanUrgent([...added, ...list]);
  const up = db().prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
  db().transaction(() => { up.run('urgent_requests', JSON.stringify(list), now()); up.run('urgent_repo_seen', JSON.stringify(seen), now()); })();
  console.log('[urgent] حُدّثت الطلبات العاجلة:', list.length);
  return { changed: true, list };
}
