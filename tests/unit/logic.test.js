import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRequestProperty } from '../../shared/matching.js';
import { computeToday } from '../../shared/today.js';
import { personDuplicates, propertyDuplicates, searchStore } from '../../shared/search.js';
import { safeCell } from '../../server/export.js';

const now = new Date('2026-10-23T10:00:00Z');
const req = { deal: 'sale', types: ['land'], locations: [{ wilaya_code: 'NKN', moughataa_code: 'TJN', text: 'توجنين' }], budget_max: 4000000, budget_currency: 'MRU', budget_basis: 'total' };
const prop = { deal: 'sale', type: 'land', wilaya_code: 'NKN', moughataa_code: 'TJN', price_amount: 3500000, price_currency: 'MRU', price_basis: 'total', availability: 'available', verified_at: '2026-10-20T00:00:00Z' };

test('مطابقة قوية فقط عندما يتأكد الموقع والسعر', () => {
  assert.equal(matchRequestProperty(req, prop, { now }).level, 'strong');
});

test('عملة السعر غير مؤكدة: لا مطابقة قوية، والنقص مذكور', () => {
  const m = matchRequestProperty(req, { ...prop, price_currency: 'unknown' }, { now });
  assert.notEqual(m.level, 'strong');
  assert.ok(m.missing.some((x) => x.includes('عملة')));
});

test('أقل من 20% فوق الميزانية = فرق مذكور؛ أكثر = استبعاد', () => {
  const m = matchRequestProperty(req, { ...prop, price_amount: 4500000 }, { now });
  assert.ok(m.diffs.some((x) => x.includes('أعلى')));
  assert.equal(matchRequestProperty(req, { ...prop, price_amount: 6000000 }, { now }), null);
});

test('القديمة تُقارن بعد التحويل', () => {
  const m = matchRequestProperty(req, { ...prop, price_amount: 35000000, price_currency: 'MRO' }, { now });
  assert.equal(m.level, 'strong');
});

test('عملية أو نوع مختلف أو عرض مُباع = استبعاد', () => {
  assert.equal(matchRequestProperty(req, { ...prop, deal: 'rent' }, { now }), null);
  assert.equal(matchRequestProperty(req, { ...prop, type: 'house' }, { now }), null);
  assert.equal(matchRequestProperty(req, { ...prop, availability: 'sold' }, { now }), null);
});

test('عرض قديم التحقق يظهر كفرق', () => {
  const m = matchRequestProperty(req, { ...prop, verified_at: '2026-08-01T00:00:00Z' }, { now, staleDays: 30 });
  assert.ok(m.diffs.some((x) => x.includes('آخر تحقق')));
  assert.notEqual(m.level, 'strong');
});

test('اليوم: متأخر، واليوم، والمؤجَّل لا يظهر، ولا تكرار', () => {
  const store = {
    tasks: [
      { id: 't1', title: 'متابعة', due_at: '2026-10-22T09:00:00Z', due_has_time: 1 },
      { id: 't2', title: 'اليوم', due_at: '2026-10-23T15:00:00Z', due_has_time: 1 },
      { id: 't3', title: 'مؤجلة', due_at: '2026-10-23T08:00:00Z', due_has_time: 1 },
      { id: 't4', title: 'غداً', due_at: '2026-10-24T08:00:00Z', due_has_time: 1 },
    ],
    appointments: [{ id: 'a1', status: 'planned', starts_at: '2026-10-23T16:00:00Z' }],
    dismissals: [{ id: 'd', item_key: 'task:t3', until_at: '2026-10-24T00:00:00Z' }],
    inbox: [{ id: 'i1', status: 'new', kind: 'search', created_at: '2026-10-23T07:00:00Z' }],
  };
  const { items } = computeToday(store, { now });
  const keys = items.map((i) => i.key);
  assert.ok(keys.includes('task:t1') && keys.includes('task:t2') && keys.includes('appt:a1'));
  assert.ok(!keys.includes('task:t3') && !keys.includes('task:t4'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(items.find((i) => i.key === 'task:t1').overdue, true);
  for (const i of items) assert.ok(i.why, 'كل عنصر يذكر السبب');
});

test('تكرار الأشخاص بالرقم أو الاسم، دون دمج', () => {
  const store = { people: [{ id: 'p1', name: 'محمد سالم' }], phones: [{ person_id: 'p1', normalized: '22246123456' }] };
  assert.equal(personDuplicates(store, { phone: '46 12 34 56' })[0].strong, true);
  assert.equal(personDuplicates(store, { name: 'محمد  سالم' })[0].strong, false);
  assert.equal(personDuplicates(store, { name: 'أحمد' }).length, 0);
});

test('تكرار القطع برقم القطعة والمخطط', () => {
  const store = { properties: [{ id: 'x', ref: 'W0001', lot_norm: '245', plan: '3', moughataa_code: 'TJN' }] };
  const d = propertyDuplicates(store, { lot_number: '٢٤٥', plan: '3' });
  assert.equal(d.length, 1);
  assert.equal(d[0].strong, true);
});

test('البحث الموحد يجد القطعة برقمها', () => {
  const store = { properties: [{ id: 'x', ref: 'W0001', lot_number: '245', lot_norm: '245', title: 'أرض' }], people: [], requests: [], phones: [] };
  const r = searchStore(store, '245');
  assert.ok(r.some((x) => x.id === 'x'));
});

test('تحييد الصيغ في Excel', () => {
  for (const s of ['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)', '\tx', '%x', '|x']) assert.equal(safeCell(s)[0], "'");
  assert.equal(safeCell('محمد'), 'محمد');
  assert.equal(safeCell(-5), -5);
  assert.equal(safeCell(null), '');
});
