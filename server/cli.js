// أوامر الإدارة على الخادم: إنشاء حساب المدير، إعادة كلمة المرور، النسخ الاحتياطي والاستعادة.
// كلمة المرور تُقرأ من الطرفية (مخفية) أو من متغير WASIT_PASSWORD، ولا تُكتب في أي ملف.
import readline from 'node:readline';
import { openDatabases, db, closeDatabases, now } from './db.js';
import { createUser, hashPassword, passwordProblems, generateRecoveryCodes, destroyAllSessions } from './auth.js';
import { createBackup, restoreBackup } from './backup.js';

function ask(q, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); else process.stdout.write('*'); };
    }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

async function getPassword() {
  if (process.env.WASIT_PASSWORD) return process.env.WASIT_PASSWORD;
  const a = await ask('كلمة المرور (10 أحرف على الأقل): ', { hidden: true });
  const b = await ask('أعد كتابة كلمة المرور: ', { hidden: true });
  if (a !== b) throw new Error('كلمتا المرور غير متطابقتين');
  return a;
}

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => { const i = args.indexOf('--' + name); return i > 0 ? args[i + 1] : undefined; };

try {
  if (cmd === 'create-admin') {
    openDatabases();
    const email = opt('email') || await ask('البريد الإلكتروني: ');
    const name = opt('name') || (process.env.WASIT_PASSWORD ? '' : await ask('الاسم: '));
    const pw = await getPassword();
    const prob = passwordProblems(pw); if (prob) throw new Error(prob);
    if (db().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new Error('يوجد حساب بهذا البريد');
    const id = createUser({ email, name, password: pw, role: 'owner' });
    const codes = generateRecoveryCodes(id);
    console.log('\nتم إنشاء حساب المدير.');
    console.log('رموز استعادة الوصول (احفظها في مكان آمن، كل رمز يُستخدم مرة واحدة):');
    for (const c of codes) console.log('  ' + c);
  } else if (cmd === 'reset-password') {
    openDatabases();
    const email = opt('email') || await ask('البريد الإلكتروني: ');
    const u = db().prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!u) throw new Error('لا يوجد حساب بهذا البريد');
    const pw = await getPassword();
    const prob = passwordProblems(pw); if (prob) throw new Error(prob);
    db().prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(hashPassword(pw), now(), u.id);
    destroyAllSessions(u.id);
    const codes = generateRecoveryCodes(u.id);
    console.log('تم تغيير كلمة المرور وإنهاء كل الجلسات. رموز استعادة جديدة:');
    for (const c of codes) console.log('  ' + c);
  } else if (cmd === 'set-role') {
    openDatabases();
    const email = opt('email'), role = opt('role');
    if (!['none', 'owner', 'admin'].includes(role)) throw new Error('الدور: none أو owner أو admin');
    const r = db().prepare('UPDATE users SET role = ?, updated_at = ? WHERE email = ?').run(role, now(), email);
    if (!r.changes) throw new Error('لا يوجد حساب بهذا البريد');
    console.log('تم.');
  } else if (cmd === 'backup') {
    openDatabases();
    const f = await createBackup(opt('out'));
    console.log('تم إنشاء النسخة الاحتياطية:', f);
  } else if (cmd === 'restore') {
    const file = args[1];
    if (!file) throw new Error('حدد ملف النسخة: npm run restore -- path/to/file.tar.gz');
    const meta = await restoreBackup(file);
    console.log('تمت الاستعادة من نسخة بتاريخ', meta.created_at, '— أعد تشغيل الخادم.');
  } else {
    console.log('الأوامر: create-admin | reset-password | set-role --email E --role R | backup [--out F] | restore FILE');
  }
} catch (e) {
  console.error('خطأ:', e.message);
  process.exitCode = 1;
} finally {
  closeDatabases();
}
