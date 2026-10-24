import test from 'node:test';
import assert from 'node:assert/strict';
import { toMRU, extractNumbers, formatPrice, currencyReadings } from '../../shared/money.js';
import { normalizePhone, isPlausiblePhone, waLink } from '../../shared/phone.js';
import { parseLocation } from '../../shared/geolink.js';
import { norm, normLot } from '../../shared/text.js';

test('تحويل العملة: القديمة ÷ 10، والمجهولة لا تُحوَّل، والصفر ليس مجهولاً', () => {
  assert.equal(toMRU(1000, 'MRO'), 100);
  assert.equal(toMRU(1000, 'MRU'), 1000);
  assert.equal(toMRU(1000, 'unknown'), null);
  assert.equal(toMRU(null, 'MRU'), null);
  assert.equal(toMRU(0, 'MRU'), 0);
});

test('قراءة الأرقام العربية', () => {
  const v = (s) => extractNumbers(s).numbers.map((n) => n.value);
  assert.deepEqual(v('مليونين ونص'), [2500000]);
  assert.deepEqual(v('١٢٠٠٠٠'), [120000]);
  assert.deepEqual(v('3,5 مليون'), [3500000]);
  assert.deepEqual(v('400 m'), [400], '«m» لا تعني مليوناً');
});

test('قراءات العملة لمبلغ مجهول تعرض الاحتمالين', () => {
  const r = currencyReadings(3000000);
  assert.ok(r.length >= 2);
  assert.ok(formatPrice({ amount: 5000000, currency: 'MRU', basis: 'total' }).includes('مليون'));
});

test('الهاتف الموريتاني', () => {
  assert.equal(normalizePhone('22 33 44 55'), '22222334455');
  assert.equal(normalizePhone('+222 46 12 34 56'), '22246123456');
  assert.equal(normalizePhone('00222-36123456'), '22236123456');
  assert.ok(isPlausiblePhone('46123456'));
  assert.ok(!isPlausiblePhone('123'));
  assert.ok(waLink('22246123456', 'مرحبا').startsWith('https://wa.me/22246123456?text='));
});

test('روابط وإحداثيات الموقع', () => {
  assert.deepEqual(parseLocation('https://www.google.com/maps/place/x/@18.0867,-15.9785,17z'), { lat: 18.0867, lng: -15.9785 });
  const d = parseLocation('18°05\'12"N 15°58\'43"W');
  assert.ok(Math.abs(d.lat - 18.0867) < 1e-3 && Math.abs(d.lng + 15.9786) < 1e-3);
  assert.deepEqual(parseLocation('18.105, -15.951'), { lat: 18.105, lng: -15.951 });
  assert.equal(parseLocation('نص عشوائي'), null);
});

test('تطبيع النص ورقم القطعة', () => {
  assert.equal(norm('أَرْضٌ ١٢'), norm('ارض 12'));
  assert.equal(normLot(' ١٢-B '), normLot('12b'));
});

test('مخطط نواكشوط: المقاطعة من موقع العلامة', async () => {
  const { zoneAt, lotLabel, NKC_ZONES } = await import('../../shared/nouakchottZones.js');
  const { WILAYAS } = await import('../../server/geo/mauritania.js');
  assert.equal(Object.keys(NKC_ZONES).length, 9);
  // مركز كل مقاطعة من مقاطعات نواكشوط يقع داخل حدودها
  for (const w of WILAYAS.filter((x) => x.code.startsWith('NK'))) for (const [code, , , , lat, lng] of w.m) assert.equal(zoneAt(lat, lng), code, code);
  assert.equal(zoneAt(16.5138, -15.805), null); // روصو
  assert.equal(zoneAt(null, null), null);
  assert.equal(lotLabel({ lot_number: '123', sector: 'C', plan: '' }), 'قطعة 123 · قطاع C');
});

test('مخططات التجزئة: قراءة الحزمة والبحث عن القطعة', async () => {
  const { parsePlanPackage, findPlanLots } = await import('../../shared/plans.js');
  assert.throws(() => parsePlanPackage('{}'), /حزمة/);
  assert.throws(() => parsePlanPackage(JSON.stringify({ format: 'wasit-plan/1', image: 'data:image/png;base64,AA', bounds: [2, 0, 1, 1] })), /حدود/);
  const { row } = parsePlanPackage(JSON.stringify({ format: 'wasit-plan/1', lotissement: 'EXT F NORD SECTEUR 9', moughataa_code: 'TVZ', lots: [[1065, 18.1, -15.9, 'libre'], ['bad']], status_legend: { libre: 'غير ممنوحة' } }));
  assert.deepEqual(row.lots, [['1065', 18.1, -15.9, 'libre']]);
  const plans = [{ id: 'a', ...row }, { id: 'b', lotissement: 'MANARA', moughataa_code: 'TVZ', lots: [['1065', 18.2, -15.8]] }, { id: 'c', lotissement: 'X', moughataa_code: 'ARF', lots: [['1065', 18, -15]] }, { id: 'd', lotissement: 'Y', lots: [['1065', 1, 1]], archived_at: 'x' }];
  assert.equal(findPlanLots(plans, '١٠٦٥').length, 3); // أرقام عربية، والمؤرشف مستبعد
  assert.deepEqual(findPlanLots(plans, '1065', { moughataa_code: 'TVZ' }).map((h) => h.plan.id), ['a', 'b']);
  const named = findPlanLots(plans, '1065', { plan: 'ext f nord secteur 9' });
  assert.equal(named.length, 1);
  assert.equal(named[0].status_label, 'غير ممنوحة');
});

test('ملف واحد بعدة مخططات', async () => {
  const { splitPlanFile, parsePlanPackage } = await import('../../shared/plans.js');
  const one = { format: 'wasit-plan/1', lots: [['1', 18, -16]] };
  assert.equal(splitPlanFile(JSON.stringify(one)).length, 1);
  const many = splitPlanFile(JSON.stringify({ plans: [one, one, one] }));
  assert.equal(many.length, 3);
  assert.equal(parsePlanPackage(many[0]).row.lots.length, 1);
});
