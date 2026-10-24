import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGeoViewports, lotLabels, homography, applyH, twoPointGeo } from '../../shared/geopdf.js';
import { hitTag, hitPlanCount } from '../../shared/plans.js';
import { makeGeoPdf } from '../fixtures-geopdf.js';

test('homography maps the four corners exactly', () => {
  const src = [[0, 0], [10, 0], [10, 5], [0, 5]];
  const dst = [[1, 1], [21, 2], [22, 13], [0, 11]];
  const H = homography(src, dst);
  src.forEach((p, i) => applyH(H, ...p).forEach((v, k) => assert.ok(Math.abs(v - dst[i][k]) < 1e-9)));
});

test('findGeoViewports reads /Measure GPTS from a GeoPDF', () => {
  const vps = findGeoViewports(makeGeoPdf().toString('latin1'));
  assert.equal(vps.length, 1);
  assert.deepEqual(vps[0].bbox, [50, 50, 550, 550]);
  const [lat, lng] = vps[0].toGeo(50, 550);
  assert.ok(Math.abs(lat - 18.1145) < 1e-9 && Math.abs(lng + 15.98) < 1e-9);
  const [lat2, lng2] = vps[0].toGeo(300, 300);
  assert.ok(Math.abs(lat2 - 18.11225) < 1e-9 && Math.abs(lng2 + 15.97765) < 1e-9);
  assert.equal(findGeoViewports(makeGeoPdf({ geo: false }).toString('latin1')).length, 0);
});

test('lotLabels picks lot numbers and merges split characters', () => {
  const it = (str, x, y, size = 6, font = 'g1') => ({ str, x, y, w: 3, size, font, h: true });
  const items = [
    // أرقام القطع مقسمة حرفاً حرفاً، ومسافة وهمية من pdf.js
    it('1', 100, 100), it('2', 103.3, 100), it('3', 106.6, 100), it('8 4', 200, 100), it('15A', 300, 100), it('16', 400, 100),
    // مساحات وأبعاد بخط آخر: أرقام مكررة كثيرة
    it('20', 100, 90, 5, 'g2'), it('20', 120, 90, 5, 'g2'), it('20', 140, 90, 5, 'g2'), it('20', 160, 90, 5, 'g2'), it('20', 180, 90, 5, 'g2'), it('20', 190, 90, 5, 'g2'),
    it('Mosquée', 500, 100), it('999', 5000, 5000),
  ];
  const L = lotLabels(items, [0, 0, 1000, 1000]);
  assert.deepEqual(L.map((l) => l.text).sort(), ['123', '15A', '16', '84']);
});

test('hit tags tell repeated numbers in one plan apart', () => {
  const a = { id: 'a' }; const b = { id: 'b' };
  const hits = [{ plan: a }, { plan: a }, { plan: b }];
  assert.equal(hitPlanCount(hits), 2);
  assert.equal(hitTag(hits, 1), ' · موضع 2 من 2');
  assert.equal(hitTag(hits, 2), '');
});

test('twoPointGeo maps both reference points and keeps scale and rotation', () => {
  const A = [100, 200]; const B = [900, 200];
  const gA = [18.1, -15.98]; const gB = [18.1, -15.98 + 400 / (111320 * Math.cos(18.1 * Math.PI / 180))];
  const t = twoPointGeo(A, B, gA, gB);
  t.toGeo(...A).forEach((v, i) => assert.ok(Math.abs(v - gA[i]) < 1e-9));
  t.toGeo(...B).forEach((v, i) => assert.ok(Math.abs(v - gB[i]) < 1e-9));
  assert.ok(Math.abs(t.metersPerPx - 0.5) < 1e-6);
  // 200 بكسل للأسفل في الصورة = 100 م جنوباً
  const [lat] = t.toGeo(100, 400);
  assert.ok(Math.abs((gA[0] - lat) * 111320 - 100) < 1e-6);
  // صورة مدوّرة 90°: B فوق A في الصورة لكنه شرقه على الأرض
  const r = twoPointGeo([0, 1000], [0, 200], gA, gB);
  assert.ok(Math.abs(r.rotationDeg + 90) < 1e-6);
  assert.equal(twoPointGeo([0, 0], [3, 4], gA, gB), null);
});
