import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldsFor, cleanupFor, requestWantsRooms } from '../../shared/typeFields.js';

test('الأرض بلا غرف، والدار بغرف', () => {
  assert.equal(fieldsFor('land', 'sale').rooms, false);
  assert.equal(fieldsFor('land', 'sale').lot, true);
  assert.equal(fieldsFor('house', 'sale').rooms, true);
  assert.equal(fieldsFor(null, null).rooms, false);
});

test('النمرة للدار عند البيع فقط، و«سند الملكية» لا يظهر في الإيجار', () => {
  assert.equal(fieldsFor('house', 'sale').lot, true);
  assert.equal(fieldsFor('house', 'rent').lot, false);
  assert.ok(!fieldsFor('house', 'rent').features.includes('title'));
});

test('تغيير النوع يفرغ غير المناسب ويضبط أساس السعر', () => {
  const patch = cleanupFor({ type: 'land', deal: 'rent', bedrooms: 3, bathrooms: 2, features: ['furnished', 'corner'], price_basis: 'total', lot_number: '5' });
  assert.equal(patch.bedrooms, null);
  assert.equal(patch.bathrooms, null);
  assert.deepEqual(patch.features, ['corner']);
  assert.equal(patch.price_basis, 'monthly');
  assert.equal(patch.lot_number, undefined); // الأرض تحتفظ بالنمرة
  assert.deepEqual(cleanupFor({ type: null, bedrooms: 3 }), {});
  assert.equal(cleanupFor({ type: 'house', deal: 'sale', price_basis: 'monthly' }).price_basis, 'total');
});

test('الطلب يسأل عن الغرف للأنواع السكنية فقط', () => {
  assert.equal(requestWantsRooms(['land']), false);
  assert.equal(requestWantsRooms(['land', 'house']), true);
  assert.equal(requestWantsRooms([]), false);
});
