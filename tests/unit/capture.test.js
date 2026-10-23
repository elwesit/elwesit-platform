import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture, buildGazetteer, parseWhen } from '../../shared/capture.js';
import { WILAYAS } from '../../server/geo/mauritania.js';

const gaz = buildGazetteer({
  wilayas: WILAYAS,
  moughataas: WILAYAS.flatMap((w) => w.m.map(([code, name_ar, name_fr, aliases]) => ({ code, wilaya_code: w.code, name_ar, name_fr, aliases }))),
  areas: [{ id: 'a1', name: 'سوكوجيم', aliases: [], moughataa_code: 'TVZ', wilaya_code: 'NKW' }],
});
const now = new Date('2026-10-23T10:00:00Z'); // نواكشوط = UTC+0
const parse = (t) => parseCapture(t, { gazetteer: gaz, now });
const kinds = (r) => r.issues.map((i) => i.kind || i.field);

test('طلب إيجار بعملة جديدة وشهري', () => {
  const r = parse('محمد 22334455 يبحث عن دار للإيجار في تفرغ زينة الميزانية 150 ألف أوقية جديدة شهريا');
  assert.equal(r.intent, 'request');
  assert.equal(r.intent_sure, true, '«للإيجار» داخل طلب لا تجعله ملتبساً');
  assert.equal(r.deal, 'rent');
  assert.deepEqual(r.types, ['house']);
  assert.equal(r.locations[0].moughataa_code, 'TVZ');
  assert.equal(r.person.phone, '22334455');
  assert.equal(r.price.amount, 150000);
  assert.equal(r.price.currency, 'MRU');
  assert.equal(r.price.basis, 'monthly');
  assert.deepEqual(kinds(r), []);
});

test('عرض أرض بنمرة ومخطط وقطاع: لا تُخلط النمرة بالمساحة، والعملة مجهولة تُسأل', () => {
  const r = parse('عندي قطعة أرض نمرة 245 مخطط 3 قطاع 7 في توجنين مساحتها 300 متر بـ 3 مليون');
  assert.equal(r.intent, 'offer');
  assert.deepEqual(r.types, ['land']);
  assert.equal(r.lot_number, '245');
  assert.equal(r.plan, '3');
  assert.equal(r.sector, '7');
  assert.equal(r.area_m2, 300);
  assert.equal(r.price.amount, 3000000);
  assert.equal(r.price.currency, 'unknown');
  assert.ok(kinds(r).includes('currency'));
});

test('تذكير بساعة ملتبسة صباحاً/مساءً يُسأل عنه', () => {
  const r = parse('اتصل بأحمد غدا الساعة 5');
  assert.equal(r.intent, 'reminder');
  assert.equal(r.person.name, 'أحمد');
  assert.ok(r.due.iso.startsWith('2026-10-24'));
  assert.ok(kinds(r).includes('time_period'));
});

test('مصطلحات محلية: بوتيك، كارفور، أوقية قديمة', () => {
  const r = parse('بوتيك للبيع قرب كارفور 25 مليون قديمة');
  assert.equal(r.intent, 'offer');
  assert.deepEqual(r.types, ['shop']);
  assert.equal(r.landmark, 'كارفور');
  assert.equal(r.price.currency, 'MRO');
});

test('20 في 30 مساحة، و«غرف»', () => {
  const r = parse('عندي دار 20 في 30 فيها 4 غرف في عرفات للبيع');
  assert.equal(r.area_m2, 600);
  assert.equal(r.bedrooms, 4);
  assert.equal(r.deal, 'sale');
});

test('نص بلا نوع واضح يطلب التحديد ولا يُفترض', () => {
  const r = parse('مرحبا كيف الحال');
  assert.equal(r.intent, 'note');
  assert.ok(r.issues.some((i) => i.field === 'intent'));
});

test('parseWhen: أرقام عربية-هندية ووقت صريح مساءً', () => {
  const w = parseWhen('بعد غد الساعة ٨ مساء', now);
  assert.equal(w.iso, '2026-10-25T20:00:00.000Z');
  assert.equal(w.issues.length, 0);
});

test('نمرة بحروف لا تُقرأ كمساحة', () => {
  const r = parse('عندي قطعة أرض نمرة 552m مخطط 3 قطاع 7 مساحتها 300 متر بـ 3 مليون');
  assert.equal(r.lot_number, '552m');
  assert.equal(r.area_m2, 300);
});
