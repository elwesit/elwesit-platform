import { openDatabases } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { createUser } from './auth.js';

// لاستضافة بلا سطر أوامر (نسخة المعاينة): ينشئ حساب المالك من متغيرات بيئة سرية إن لم يكن موجوداً.
// كلمة المرور لا تُطبع أبداً، ولا تُخزَّن إلا مشفّرة.
function bootstrapAdmin() {
  const email = (process.env.WASIT_ADMIN_EMAIL || '').trim();
  const password = process.env.WASIT_ADMIN_PASSWORD || '';
  if (!email || !password) return;
  if (password.length < 12) { console.error('[bootstrap] WASIT_ADMIN_PASSWORD أقصر من 12 حرفاً؛ لم يُنشأ الحساب'); return; }
  if (db().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return;
  createUser({ email, name: 'المدير', password, role: 'owner' });
  console.log('[bootstrap] أُنشئ حساب المالك', email);
}

openDatabases();
bootstrapAdmin();
const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`الوسيط العقاري يعمل على http://${config.host}:${config.port}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
