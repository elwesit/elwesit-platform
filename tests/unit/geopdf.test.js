import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGeoViewports, lotLabels, homography, applyH, twoPointGeo } from '../../shared/geopdf.js';
import { hitTag, hitPlanCount, parsePlanPackage, flatPoly, lotShape, sidesText } from '../../shared/plans.js';
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

test('lotShapes traces each lot rectangle from the PDF lines with sides in metres', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { strokeSegments, lotShapes } = await import('../../shared/lotShapes.js');
  const buf = makeGeoPdf();
  const vp = findGeoViewports(buf.toString('latin1'))[0];
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const items = tc.items.filter((it) => it.transform).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]), font: it.fontName, h: it.transform[1] === 0 && it.transform[2] === 0 }));
  const labels = lotLabels(items, vp.bbox);
  assert.equal(labels.length, 12);
  const shapes = lotShapes(strokeSegments(await page.getOperatorList(), pdfjs.OPS), labels, vp.bbox, vp.toGeo);
  assert.equal(shapes.filter(Boolean).length, 12);
  // مستطيل 100×80 نقطة؛ الإطار 500 نقطة = 0.0047° طولاً و0.0045° عرضاً
  const wM = 100 / 500 * 0.0047 * 111320 * Math.cos(18.11225 * Math.PI / 180); const hM = 80 / 500 * 0.0045 * 111320;
  for (const s of shapes) {
    assert.equal(s.p.length, 4);
    const sorted = [...s.s].sort((a, b) => a - b);
    assert.ok(Math.abs(sorted[0] - hM) < 1 && Math.abs(sorted[3] - wM) < 1, JSON.stringify(s.s));
    assert.ok(Math.abs(s.a - wM * hM) / (wM * hM) < 0.02, String(s.a));
  }
  await doc.destroy?.();
});

test('lot shapes survive the plan package and read back as sides and area', () => {
  const flat = flatPoly([[18.1, -15.98], [18.1, -15.9798], [18.1002, -15.9798], [18.1002, -15.98]]);
  const { row } = parsePlanPackage({ format: 'wasit-plan/1', lots: [['7', 18.1001, -15.9799, '', flat], ['8', 18.1, -15.97, 'libre'], ['9', 18.1, -15.97, '', [1, 2, 3]]] });
  assert.equal(row.lots[0][4].length, 8);
  assert.equal(row.lots[1].length, 4);
  assert.equal(row.lots[2].length, 3); // حدود غير صالحة تُهمل
  const sh = lotShape(row.lots[0]);
  assert.equal(sh.sides.length, 4);
  assert.ok(Math.abs(sh.area - 21.2 * 22.3) < 15, String(sh.area));
  assert.match(sidesText([19, 27, 19.2, 27.1]), /^19\.1 × 27\.1 م$/);
  assert.equal(sidesText([10, 5, 7]), '10 / 5 / 7 م');
});

test('elevation grid covers Nouakchott only', async () => {
  const { elevationAt } = await import('../../server/geo/elevation.js');
  const e = elevationAt(18.0858, -15.9785);
  assert.ok(e > -5 && e < 30, String(e));
  assert.equal(elevationAt(20, -16), null);
});

test('lot search splits the number from the plan or area name', async () => {
  const { parseLotQuery, searchPlanLots, planNameHit } = await import('../../shared/plans.js');
  assert.deepEqual(parseLotQuery('57 المنارة'), { lot: '57', rest: 'المنارة' });
  assert.deepEqual(parseLotQuery('F9 561'), { lot: '561', rest: 'F9' });
  assert.deepEqual(parseLotQuery('قطعة ١٢٣ تفرغ زينة'), { lot: '123', rest: 'تفرغ زينة' });
  assert.deepEqual(parseLotQuery('قطاع 9 1100'), { lot: '1100', rest: 'قطاع 9' });
  assert.deepEqual(parseLotQuery('N627'), { lot: 'N627', rest: '' });
  assert.equal(parseLotQuery('المنارة').lot, null);
  const mg = [{ code: 'TVZ', name_ar: 'تفرغ زينة', aliases: [] }, { code: 'KSR', name_ar: 'لكصر', aliases: [] }];
  assert.ok(planNameHit({ name: 'EXT F NORD SECT 9' }, 'قطاع 9'));
  assert.ok(!planNameHit({ name: 'EXT F NORD SECT 19' }, 'قطاع 9'));
  assert.ok(planNameHit({ name: 'MANARA', moughataa_code: 'TVZ' }, 'تفرغ زينة', mg));
  assert.ok(planNameHit({ name: 'المنارة' }, 'منارة'));
  const plans = [{ id: 'a', name: 'MANARA', lotissement: 'MANARA', moughataa_code: 'TVZ', lots: [['57', 18.1, -16]] }, { id: 'b', name: 'F9', lotissement: 'F9', moughataa_code: 'KSR', lots: [['57', 18.2, -15.9]] }];
  assert.deepEqual(searchPlanLots(plans, '57 تفرغ زينة', { moughataas: mg }).hits.map((h) => h.plan.id), ['a']);
  assert.deepEqual(searchPlanLots(plans, '57 F9', { moughataas: mg }).hits.map((h) => h.plan.id), ['b']);
  const miss = searchPlanLots(plans, '57 عرفات', { moughataas: mg });
  assert.equal(miss.unmatched, true); assert.equal(miss.hits.length, 2);
});
