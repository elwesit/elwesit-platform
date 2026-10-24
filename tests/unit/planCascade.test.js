import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCascade, lotsInPlan, lotPrecision, NO_AREA, searchPlanLots } from '../../shared/plans.js';

const moughataas = [{ code: 'TVZ', name_ar: 'تفرغ زينة' }, { code: 'KSR', name_ar: 'لكصر' }, { code: 'ARF', name_ar: 'عرفات' }];
const areas = [
  { id: 'man', name: 'المنارة', moughataa_code: null },
  { id: 'soc', name: 'سوكوجيم', moughataa_code: 'TVZ' },
  { id: 'old', name: 'محذوفة', moughataa_code: 'TVZ', archived_at: 'x' },
];
const lots = (...n) => n.map((x, i) => [String(x), 18.1 + i / 1000, -15.97, '']);
const plans = [
  { id: 'p1', name: 'MANARA', moughataa_code: 'TVZ', area_id: 'man', place_verified: 0, georef: 'geopdf', lots: lots(57, 58) },
  { id: 'p2', name: 'Socogim PS', moughataa_code: 'TVZ', area_id: 'soc', place_verified: 1, georef: 'geopdf', lots: lots(57) },
  { id: 'p3', name: 'قطاع 9', moughataa_code: 'TVZ', area_id: null, georef: 'points', lots: [] },
  { id: 'p4', name: 'Ksar ext', moughataa_code: 'KSR', area_id: 'man', georef: 'geopdf', lots: lots(57) },
  { id: 'p5', name: 'محذوف', moughataa_code: 'ARF', archived_at: 'x', lots: [] },
];
const S = { plans, areas, moughataas };

test('المقاطعات: التي فيها مخططات فقط، بعددها', () => {
  const c = planCascade(S, {});
  assert.deepEqual(c.moughataas.map((x) => [x.code, x.count]), [['TVZ', 3], ['KSR', 1]].sort((a, b) => moughataas.find((m) => m.code === a[0]).name_ar.localeCompare(moughataas.find((m) => m.code === b[0]).name_ar, 'ar')));
  assert.equal(c.plans.length, 0); // لا مخططات قبل اختيار المقاطعة
});

test('اختيار المقاطعة يحصر المناطق والمخططات فيها', () => {
  const c = planCascade(S, { m: 'TVZ' });
  assert.deepEqual(c.areas.map((x) => x.id).sort(), ['-', 'man', 'soc'].sort());
  assert.equal(c.areas.find((x) => x.id === 'man').linked, false); // المنارة لم تُنسب إلى المقاطعة: مرتبطة بمخطط فيها فقط
  assert.deepEqual(c.plans.map((p) => p.id).sort(), ['p1', 'p2', 'p3']);
  assert.ok(!c.plans.some((p) => p.id === 'p4')); // مخطط لكصر لا يظهر مع تفرغ زينة
});

test('اختيار المنطقة يحصر المخططات، و«بلا منطقة» يجمع غير المربوطة', () => {
  assert.deepEqual(planCascade(S, { m: 'TVZ', a: 'man' }).plans.map((p) => p.id), ['p1']);
  assert.deepEqual(planCascade(S, { m: 'KSR', a: 'man' }).plans.map((p) => p.id), ['p4']);
  assert.deepEqual(planCascade(S, { m: 'TVZ', a: NO_AREA }).plans.map((p) => p.id), ['p3']);
});

test('منطقة لا تتبع المقاطعة الجديدة تُلغى', () => {
  const c = planCascade(S, { m: 'KSR', a: 'soc' });
  assert.equal(c.a, null);
  assert.deepEqual(c.plans.map((p) => p.id), ['p4']);
});

test('البحث داخل مخطط واحد ودرجة الثقة', () => {
  const h = lotsInPlan(plans[0], '٥٧');
  assert.equal(h.length, 1); assert.equal(h[0].plan.id, 'p1');
  assert.equal(lotsInPlan(plans[0], '99').length, 0);
  assert.equal(lotPrecision(h[0]).level, 'label'); // بلا حدود: موضع الرقم فقط
  assert.equal(lotPrecision({ ...h[0], shape: { poly: [], sides: [], area: 1 } }).level, 'plan');
  assert.equal(lotPrecision({ plan: plans[2], shape: null }).level, 'approx');
});

test('اسم المنطقة يُقبل في البحث بالنص', () => {
  const r = searchPlanLots(plans, '57 سوكوجيم', { moughataas, areas });
  assert.deepEqual(r.hits.map((h) => h.plan.id), ['p2']);
});
