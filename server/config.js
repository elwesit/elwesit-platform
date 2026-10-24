import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.WASIT_DATA_DIR || path.join(root, 'data'));

export const config = {
  root,
  dataDir,
  mainDb: path.join(dataDir, 'main.db'),
  publicDb: path.join(dataDir, 'public.db'),
  // الملفات الخاصة (صور أصلية، وثائق، تسجيلات) — لا تُخدم أبداً كملفات ثابتة
  privateDir: path.join(dataDir, 'private'),
  // نسخ الصور المنشورة فقط — تُحذف عند سحب النشر
  publicMediaDir: path.join(dataDir, 'public-media'),
  backupDir: path.join(dataDir, 'backups'),
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  // الرابط العام (لروابط المشاركة ومعاينات واتساب). يُضبط في الإنتاج.
  baseUrl: (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''),
  // نسخة تجريبية: شريط تنبيه ظاهر، ومنع الفهرسة، وتنبيه بأن البيانات قد تُمسح
  preview: process.env.WASIT_PREVIEW === '1',
  // مجلد بيانات تحت /tmp يعني أنها تُمسح عند إعادة التشغيل (مثل خطة Render المجانية)
  ephemeralData: dataDir.startsWith('/tmp/') || dataDir.startsWith(os.tmpdir() + path.sep),
  // خلف وكيل HTTPS (Caddy/Nginx) اجعلها 1 ليُفعّل Secure على الكعكات
  trustProxy: process.env.TRUST_PROXY === '1' || !!process.env.RENDER,
  secureCookies: process.env.SECURE_COOKIES ? process.env.SECURE_COOKIES === '1' : process.env.NODE_ENV === 'production',
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  maxUploadMB: Number(process.env.MAX_UPLOAD_MB || 25),
  // WhatsApp Cloud API — اختياري؛ الأسرار عبر متغيرات البيئة فقط
  whatsapp: {
    token: process.env.WA_TOKEN || '',
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID || '',
    wabaId: process.env.WA_WABA_ID || '',
    appSecret: process.env.WA_APP_SECRET || '',
    verifyToken: process.env.WA_VERIFY_TOKEN || '',
    graphVersion: process.env.WA_GRAPH_VERSION || 'v23.0',
  },
  isProd: process.env.NODE_ENV === 'production',
};
