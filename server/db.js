import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { WILAYAS } from './geo/mauritania.js';
import { DEFAULT_SETTINGS, DEFAULT_TEMPLATES } from './defaults.js';

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

function migrate(db, dir, prefix, table = '_migrations') {
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const done = new Set(db.prepare(`SELECT name FROM ${table}`).all().map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && f.startsWith(prefix)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO ${table} (name, applied_at) VALUES (?, ?)`).run(f, now());
    })();
  }
}

let main, pubWrite, pubRead;

export function openDatabases() {
  for (const d of [config.dataDir, config.privateDir, config.publicMediaDir, config.backupDir]) fs.mkdirSync(d, { recursive: true });
  const migDir = path.join(config.root, 'server', 'migrations');
  main = new Database(config.mainDb);
  main.pragma('journal_mode = WAL');
  main.pragma('foreign_keys = ON');
  main.pragma('busy_timeout = 5000');
  migrate(main, migDir, '0');
  seed(main);

  pubWrite = new Database(config.publicDb);
  pubWrite.pragma('journal_mode = WAL');
  migrate(pubWrite, migDir, 'public_');
  // اتصال الموقع العام: قراءة فقط، وعلى ملف لا يحتوي إلا المنشور
  pubRead = new Database(config.publicDb, { readonly: true, fileMustExist: true });
  pubRead.pragma('query_only = ON');
  return { main, pubWrite, pubRead };
}

export const db = () => main;
export const publicWriteDb = () => pubWrite;
export const publicReadDb = () => pubRead;

export function closeDatabases() {
  for (const d of [pubRead, pubWrite, main]) try { d?.close(); } catch {}
  main = pubWrite = pubRead = undefined;
}

function seed(d) {
  const t = now();
  const hasGeo = d.prepare('SELECT COUNT(*) c FROM wilayas').get().c;
  if (!hasGeo) {
    const iw = d.prepare('INSERT INTO wilayas (code,name_ar,name_fr,aliases,lat,lng,sort) VALUES (?,?,?,?,?,?,?)');
    const im = d.prepare('INSERT INTO moughataas (code,wilaya_code,name_ar,name_fr,aliases,lat,lng) VALUES (?,?,?,?,?,?,?)');
    d.transaction(() => {
      WILAYAS.forEach((w, i) => {
        iw.run(w.code, w.name_ar, w.name_fr, JSON.stringify(w.aliases), w.lat, w.lng, i);
        for (const [code, ar, fr, aliases, lat, lng] of w.m) im.run(code, w.code, ar, fr, JSON.stringify(aliases), lat, lng);
      });
    })();
  }
  const is = d.prepare('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) is.run(k, JSON.stringify(v), t);
  if (!d.prepare('SELECT COUNT(*) c FROM templates').get().c) {
    const it = d.prepare('INSERT INTO templates (id,kind,title,body,sort,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
    DEFAULT_TEMPLATES.forEach((tp, i) => it.run(uid(), tp.kind, tp.title, tp.body, i, t, t));
  }
}

export function getSettings() {
  const out = {};
  for (const r of main.prepare('SELECT key, value FROM settings').all()) out[r.key] = JSON.parse(r.value);
  return out;
}

export function nextRef(name, prefix) {
  const row = main.prepare('INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value').get(name);
  return `${prefix}${String(row.value).padStart(4, '0')}`;
}

export function audit(userId, action, entity, entityId, detail = '') {
  main.prepare('INSERT INTO audit_log (at,user_id,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?)').run(now(), userId || null, action, entity || null, entityId || null, typeof detail === 'string' ? detail : JSON.stringify(detail));
}
