import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from './config.js';
import { db, now, uid, audit } from './db.js';
import { HttpError } from './entities.js';

export function privatePath(key) {
  // المفتاح يُولَّد داخلياً فقط؛ نتحقق من الشكل لمنع الخروج من المجلد
  if (!/^[0-9]{4}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(key)) throw new HttpError(400, 'مفتاح غير صالح');
  return path.join(config.privateDir, key);
}

const DOC_TYPES = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'text/plain': 'txt',
};
const AUDIO_TYPES = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/wav': 'wav', 'video/webm': 'webm', 'video/mp4': 'm4a' };
const OWNER_TYPES = new Set(['property', 'person', 'deal', 'request', 'capture', 'inbox', 'appointment', 'plan']);

function newKey(ext) {
  return `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${ext}`;
}

function writePrivate(key, buf) {
  const p = privatePath(key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf, { mode: 0o600 });
}

export async function storeUpload({ buffer, mimetype, originalname, kind, owner_type, owner_id, id }, user) {
  if (!OWNER_TYPES.has(owner_type) || !owner_id) throw new HttpError(400, 'يلزم تحديد السجل المرتبط');
  if (id) {
    const ex = db().prepare('SELECT * FROM files WHERE id = ?').get(id);
    if (ex) { const { storage_key, ...f } = ex; return f; } // إعادة رفع نفس الملف بعد انقطاع
  }
  const fid = id && /^[0-9a-f-]{36}$/i.test(id) ? id : uid();
  let key, mime, size, width = null, height = null;
  const name = String(originalname || '').replace(/[\\/\0<>:"|?*\u0000-\u001f]/g, '_').slice(0, 150);
  if (kind === 'photo') {
    let img;
    try {
      img = sharp(buffer, { failOn: 'error' }).rotate();
      const meta = await sharp(buffer).metadata();
      if (!meta.width) throw new Error('no dims');
    } catch {
      const heic = /heic|heif/i.test(mimetype + name);
      throw new HttpError(415, heic
        ? 'تعذر قراءة صورة HEIC على الخادم. على iPhone: الإعدادات ← الكاميرا ← التنسيقات ← «الأكثر توافقاً»، أو أرسل الصورة من الألبوم كـ JPEG.'
        : 'تعذر قراءة الصورة. الصيغ المدعومة: JPEG وPNG وWebP وHEIC (حسب الجهاز).');
    }
    // تخزين نسخة مضغوطة بلا بيانات وصفية (تُزال إحداثيات GPS المضمنة)
    const out = await img.resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    key = newKey('webp'); mime = 'image/webp'; size = out.info.size; width = out.info.width; height = out.info.height;
    writePrivate(key, out.data);
  } else if (kind === 'document') {
    const ext = DOC_TYPES[mimetype];
    if (!ext) throw new HttpError(415, 'نوع الملف غير مدعوم. المدعوم: PDF، صور، Word، Excel، نص.');
    key = newKey(ext); mime = mimetype; size = buffer.length;
    writePrivate(key, buffer);
  } else if (kind === 'audio') {
    const base = String(mimetype || '').split(';')[0];
    const ext = AUDIO_TYPES[base];
    if (!ext) throw new HttpError(415, 'صيغة التسجيل غير مدعومة');
    key = newKey(ext); mime = base; size = buffer.length;
    writePrivate(key, buffer);
  } else throw new HttpError(400, 'نوع غير معروف');

  const t = now();
  const sort = db().prepare('SELECT COALESCE(MAX(sort), -1) + 1 s FROM files WHERE owner_type = ? AND owner_id = ?').get(owner_type, owner_id).s;
  const isCover = kind === 'photo' && !db().prepare("SELECT 1 FROM files WHERE owner_type = ? AND owner_id = ? AND kind = 'photo' AND is_cover = 1 AND archived_at IS NULL").get(owner_type, owner_id) ? 1 : 0;
  db().prepare('INSERT INTO files (id,kind,owner_type,owner_id,name,mime,size,width,height,storage_key,sort,is_cover,created_at,updated_at,fv) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(fid, kind, owner_type, owner_id, name, mime, size, width, height, key, sort, isCover, t, t, '{}');
  audit(user?.id, 'upload', 'files', fid, kind);
  const { storage_key, ...f } = db().prepare('SELECT * FROM files WHERE id = ?').get(fid);
  return f;
}

export function sendPrivateFile(res, id, { thumb = false } = {}) {
  const f = db().prepare('SELECT * FROM files WHERE id = ?').get(id);
  if (!f) throw new HttpError(404, 'غير موجود');
  const p = privatePath(f.storage_key);
  if (!fs.existsSync(p)) throw new HttpError(404, 'الملف غير موجود في التخزين');
  res.set('Cache-Control', 'private, max-age=3600');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'");
  if (thumb && f.kind === 'photo') {
    res.type('image/webp');
    return sharp(p).resize({ width: 480, height: 360, fit: 'cover' }).webp({ quality: 65 }).pipe(res);
  }
  const inline = f.kind === 'photo' || f.kind === 'audio' || f.mime === 'application/pdf';
  res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name || f.id)}`);
  res.type(f.mime);
  fs.createReadStream(p).pipe(res);
}
