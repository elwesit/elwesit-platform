// خادم اختبار: بيانات مؤقتة جديدة + حساب مدير، ثم تشغيل التطبيق
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasit-e2e-'));
process.env.WASIT_DATA_DIR = dir;
const { openDatabases } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser } = await import('../../server/auth.js');
openDatabases();
createUser({ email: 'admin@e2e.test', name: 'المدير', password: 'E2e-pass-123456', role: 'owner' });
const port = Number(process.env.PORT || 8093);
createApp().listen(port, '127.0.0.1', () => console.log('e2e server on', port, dir));
