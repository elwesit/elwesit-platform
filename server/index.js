import { openDatabases } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { createUser } from './auth.js';

// لاستضافة بلا سطر أوامر (نسخة المعاينة): ينشئ حساب المالك من متغيرات بيئة سرية إن لم يكن موجوداً.
// كلمة المرور لا تُطبع أبداً، ولا تُخزَّن إلا مشفّرة.
// حسابات من أسرار البيئة: المالك دائماً، وحساب اختبار في نسخة المعاينة فقط. كلمة المرور لا تُطبع أبداً.
function bootstrapUser(prefix, name, label) {
  const email = (process.env[`${prefix}_EMAIL`] || '').trim();
  const password = process.env[`${prefix}_PASSWORD`] || '';
  if (!email || !password) return;
  if (password.length < 12) { console.error(`[bootstrap] ${prefix}_PASSWORD أقصر من 12 حرفاً؛ لم يُنشأ الحساب`); return; }
  if (db().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return;
  createUser({ email, name, password, role: 'owner' });
  console.log(`[bootstrap] أُنشئ ${label}`, email);
}

function bootstrapAdmin() {
  bootstrapUser('WASIT_ADMIN', 'المدير', 'حساب المالك');
  if (config.preview) bootstrapUser('WASIT_E2E', 'اختبار آلي', 'حساب الاختبار (معاينة فقط)');
  else removeTestUser();
}

// خارج المعاينة لا يبقى حساب الاختبار الآلي: يُحذف مع جلساته، أو يُعطَّل إن ارتبطت به سجلات
function removeTestUser() {
  const email = (process.env.WASIT_E2E_EMAIL || '').trim();
  const u = email && db().prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!u) return;
  db().prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  try { db().prepare('DELETE FROM users WHERE id = ?').run(u.id); console.log('[bootstrap] حُذف حساب الاختبار', email); }
  catch { db().prepare("UPDATE users SET role = 'none' WHERE id = ?").run(u.id); console.log('[bootstrap] عُطّل حساب الاختبار', email); }
}

openDatabases();
bootstrapAdmin();
const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`الوسيط العقاري يعمل على http://${config.host}:${config.port}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
