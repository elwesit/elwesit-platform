// عروض تأتي مع الكود: مجلد لكل عرض في content/listings/<key>/ فيه listing.json وصوره (jpg/png/webp).
// عند التشغيل يُنشأ كل عرض جديد ويُنشر مرة واحدة، فينشر Claude عروض المالك بطلب منه دون أي كلمة مرور.
// المعرّف مشتق من اسم المجلد، فلا يتكرر العرض. إذا تغيّر محتوى المجلد طُبّق التعديل مرة واحدة على
// الحقول المذكورة فيه وعلى الصور؛ وما عدا ذلك مما يعدّله المالك أو يسحبه من لوحة الإدارة يبقى كما هو.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db, now } from './db.js';
import { createRow, updateRow, getRow } from './entities.js';
import { storeUpload } from './media.js';
import { publishProperty, refreshIfPublished } from './publish.js';

const PHOTO = /\.(jpe?g|png|webp)$/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// UUID ثابت من اسم المجلد
export function listingId(key) {
  const h = crypto.createHash('sha256').update('repo-listing:' + key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function importRepoListings(dir = path.join(config.root, 'content', 'listings')) {
  if (!fs.existsSync(dir)) return [];
  const done = [];
  for (const key of fs.readdirSync(dir).sort()) {
    const folder = path.join(dir, key);
    const spec = path.join(folder, 'listing.json');
    if (!/^[a-z0-9-]{1,60}$/.test(key) || !fs.existsSync(spec)) continue;
    try {
      const id = listingId(key);
      const fields = JSON.parse(fs.readFileSync(spec, 'utf8'));
      const photoFiles = fs.readdirSync(folder).filter((f) => PHOTO.test(f)).sort();
      const h = crypto.createHash('sha256');
      for (const f of ['listing.json', ...photoFiles]) h.update(f).update(fs.readFileSync(path.join(folder, f)));
      const hash = h.digest('hex');
      const seen = db().prepare('SELECT hash FROM repo_listings WHERE key = ?').get(key);
      if (seen?.hash === hash) continue;
      const out = createRow('properties', { ...fields, id }, null);
      const remember = () => db().prepare('INSERT INTO repo_listings (key, hash, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at').run(key, hash, now());
      const photos = [];
      for (const [i, f] of photoFiles.entries()) {
        const ext = f.split('.').pop().toLowerCase();
        const file = await storeUpload({ buffer: fs.readFileSync(path.join(folder, f)), mimetype: MIME[ext], originalname: f, kind: 'photo', owner_type: 'property', owner_id: id, id: listingId(`${key}/${hash.slice(0, 12)}/${i}`) }, null);
        photos.push(file.id);
      }
      if (out.existed) {
        const cur = getRow('properties', id);
        updateRow('properties', id, { ...fields, ...(photos.length ? { pub_photo_ids: photos } : {}) }, cur.version, null, { force: true });
        await refreshIfPublished(id, null);
        remember();
        console.log('[repo-listings] عُدّل', key, cur.ref);
        done.push({ key, id, ref: cur.ref, updated: true });
        continue;
      }
      if (photos.length) updateRow('properties', id, { pub_photo_ids: photos }, out.row.version, null);
      const pub = await publishProperty(id, null);
      if (pub.problems) { console.error('[repo-listings]', key, pub.problems.join('، ')); continue; }
      remember();
      console.log('[repo-listings] نُشر', key, out.row.ref);
      done.push({ key, id, ref: out.row.ref });
    } catch (e) {
      console.error('[repo-listings]', key, e.message);
    }
  }
  return done;
}
