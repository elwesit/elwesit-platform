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
