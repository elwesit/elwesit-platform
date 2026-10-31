// عروض المستودع: تُنشأ وتُنشر مرة واحدة بصورها، ولا تتكرر عند إعادة التشغيل.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasit-repo-'));
process.env.WASIT_DATA_DIR = path.join(dir, 'data');
const { openDatabases, closeDatabases, db, publicReadDb } = await import('../../server/db.js');
const { importRepoListings, listingId } = await import('../../server/repo-listings.js');
const sharp = (await import('sharp')).default;
openDatabases();
after(() => { closeDatabases(); fs.rmSync(dir, { recursive: true, force: true }); });

const src = path.join(dir, 'listings');
fs.mkdirSync(path.join(src, 'iskan1-400'), { recursive: true });
fs.mkdirSync(path.join(src, 'Bad Name'), { recursive: true });
fs.writeFileSync(path.join(src, 'iskan1-400', 'listing.json'), JSON.stringify({ deal: 'sale', type: 'land', wilaya_code: 'NKW', moughataa_code: 'TVZ', area_m2: 400, price_amount: 60000000, price_currency: 'MRO', availability: 'available', pub_title: 'قطعة 400 م²' }));
fs.writeFileSync(path.join(src, 'Bad Name', 'listing.json'), '{}');
for (const n of ['1.jpg', '2.jpg']) await sharp({ create: { width: 64, height: 48, channels: 3, background: '#0e5a4c' } }).jpeg().toFile(path.join(src, 'iskan1-400', n));

test('ينشئ العرض وينشره بصوره، ولا يكرره', async () => {
  const done = await importRepoListings(src);
  assert.equal(done.length, 1);
  const p = db().prepare('SELECT * FROM properties WHERE id = ?').get(listingId('iskan1-400'));
  assert.equal(p.published, 1);
  assert.equal(JSON.parse(p.pub_photo_ids).length, 2);
  const l = publicReadDb().prepare('SELECT * FROM listings WHERE ref = ?').get(p.ref);
  assert.equal(JSON.parse(l.photos).length, 2);
  assert.equal((await importRepoListings(src)).length, 0);
  assert.equal(db().prepare('SELECT COUNT(*) c FROM properties').get().c, 1);
});

test('العرض الذي سحبه المالك لا يُعاد نشره', async () => {
  const id = listingId('iskan1-400');
  db().prepare('UPDATE properties SET published = 0 WHERE id = ?').run(id);
  await importRepoListings(src);
  assert.equal(db().prepare('SELECT published FROM properties WHERE id = ?').get(id).published, 0);
});
