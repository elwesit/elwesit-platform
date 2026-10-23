// النسخ الاحتياطي: لقطة متسقة من قاعدتي البيانات (SQLite online backup) + الملفات، في أرشيف tar.gz واحد.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as tar from 'tar';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { db, publicWriteDb } from './db.js';

export async function createBackup(outFile) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wasit-bk-'));
  try {
    await db().backup(path.join(tmp, 'main.db'));
    await publicWriteDb().backup(path.join(tmp, 'public.db'));
    fs.writeFileSync(path.join(tmp, 'BACKUP.json'), JSON.stringify({ app: 'wasit', created_at: new Date().toISOString(), format: 1 }, null, 2));
    const target = outFile || path.join(config.backupDir, `wasit-${stamp}.tar.gz`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const entries = ['main.db', 'public.db', 'BACKUP.json'];
    for (const d of ['private', 'public-media']) {
      if (fs.existsSync(path.join(config.dataDir, d))) { fs.cpSync(path.join(config.dataDir, d), path.join(tmp, d), { recursive: true }); entries.push(d); }
    }
    await tar.c({ gzip: true, file: target, cwd: tmp, portable: true }, entries);
    return target;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// الاستعادة تتم والخادم متوقف (من سطر الأوامر). تحفظ نسخة من البيانات الحالية قبل الاستبدال.
export async function restoreBackup(file) {
  if (!fs.existsSync(file)) throw new Error('الملف غير موجود: ' + file);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wasit-rs-'));
  await tar.x({ file, cwd: tmp, strict: true, filter: (p) => !p.includes('..') && !path.isAbsolute(p) });
  const meta = JSON.parse(fs.readFileSync(path.join(tmp, 'BACKUP.json'), 'utf8'));
  if (meta.app !== 'wasit') throw new Error('ليس ملف نسخة احتياطية للوسيط');
  const check = new Database(path.join(tmp, 'main.db'), { readonly: true });
  const ok = check.pragma('integrity_check', { simple: true });
  check.close();
  if (ok !== 'ok') throw new Error('ملف القاعدة في النسخة تالف: ' + ok);
  if (fs.existsSync(config.dataDir)) {
    const keep = config.dataDir.replace(/\/$/, '') + '.before-restore-' + Date.now();
    fs.renameSync(config.dataDir, keep);
    console.log('البيانات السابقة محفوظة في:', keep);
  }
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const f of ['main.db', 'public.db']) fs.copyFileSync(path.join(tmp, f), path.join(config.dataDir, f));
  // الجلسات لا تُستعاد: جلسة أُلغيت بعد تاريخ النسخة يجب ألا تعود صالحة
  const restored = new Database(path.join(config.dataDir, 'main.db'));
  restored.prepare('DELETE FROM sessions').run();
  restored.close();
  for (const d of ['private', 'public-media']) if (fs.existsSync(path.join(tmp, d))) fs.cpSync(path.join(tmp, d), path.join(config.dataDir, d), { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  return meta;
}
