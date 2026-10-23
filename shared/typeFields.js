// الخانات المناسبة لكل نوع عقار وعملية: تُظهر الواجهة ما يناسب الاختيار فقط،
// وتُفرَّغ القيم التي لم تعد مناسبة عند تغيير النوع أو العملية.

const ALL_FEATURES = ['corner', 'paved', 'water', 'electricity', 'fence', 'title', 'furnished', 'garage', 'ac', 'yard', 'floor_ground', 'sea_view'];

// lot: رقم القطعة/المخطط/القطاع — 'sale' تعني عند البيع فقط
const PROFILES = {
  land: { lot: true, frontage: true, rooms: false, baths: false, floors: false, features: ['corner', 'paved', 'fence', 'water', 'electricity', 'title'] },
  farm: { lot: false, frontage: false, rooms: false, baths: false, floors: false, features: ['water', 'electricity', 'fence', 'paved', 'title'] },
  house: { lot: 'sale', frontage: false, rooms: true, baths: true, floors: true, features: ['furnished', 'garage', 'ac', 'yard', 'corner', 'paved', 'water', 'electricity', 'title'] },
  villa: { lot: 'sale', frontage: false, rooms: true, baths: true, floors: true, features: ['furnished', 'garage', 'ac', 'yard', 'corner', 'paved', 'sea_view', 'title'] },
  apartment: { lot: false, frontage: false, rooms: true, baths: true, floors: false, features: ['furnished', 'ac', 'floor_ground', 'garage', 'sea_view'] },
  building: { lot: 'sale', frontage: true, rooms: false, baths: false, floors: true, features: ['corner', 'paved', 'garage', 'water', 'electricity', 'title'] },
  shop: { lot: false, frontage: true, rooms: false, baths: false, floors: false, features: ['corner', 'paved', 'ac', 'floor_ground', 'electricity'] },
  office: { lot: false, frontage: false, rooms: false, baths: false, floors: false, features: ['furnished', 'ac', 'garage', 'floor_ground'] },
  warehouse: { lot: false, frontage: true, rooms: false, baths: false, floors: false, features: ['paved', 'electricity', 'water', 'fence'] },
  other: { lot: true, frontage: true, rooms: true, baths: true, floors: true, features: ALL_FEATURES },
};
// قبل اختيار النوع: الخانات العامة فقط
const NONE = { lot: false, frontage: false, rooms: false, baths: false, floors: false, features: [] };

export function fieldsFor(type, deal) {
  const p = PROFILES[type] || NONE;
  const lot = p.lot === 'sale' ? deal !== 'rent' : !!p.lot;
  // «سند ملكية» لا يعني شيئاً في الإيجار
  const features = deal === 'rent' ? p.features.filter((f) => f !== 'title') : p.features;
  return { lot, frontage: p.frontage, rooms: p.rooms, baths: p.baths, floors: p.floors, features };
}

// القيم التي أصبحت غير مناسبة بعد تغيير النوع/العملية تُفرَّغ
export function cleanupFor(v) {
  const f = fieldsFor(v.type, v.deal);
  const patch = {};
  // بلا نوع محدد لا نحكم على شيء بأنه غير مناسب
  if (v.type) {
    if (!f.lot) for (const k of ['lot_number', 'plan', 'sector']) if (v[k]) patch[k] = '';
    if (!f.frontage && v.frontage) patch.frontage = '';
    if (!f.rooms && v.bedrooms != null) patch.bedrooms = null;
    if (!f.baths && v.bathrooms != null) patch.bathrooms = null;
    if (!f.floors && v.floors != null) patch.floors = null;
    const feats = (v.features || []).filter((x) => f.features.includes(x));
    if (feats.length !== (v.features || []).length) patch.features = feats;
  }
  // أساس السعر الافتراضي يتبع العملية
  if (v.deal === 'rent' && (!v.price_basis || v.price_basis === 'total')) patch.price_basis = 'monthly';
  if (v.deal === 'sale' && ['monthly', 'yearly', 'daily'].includes(v.price_basis)) patch.price_basis = 'total';
  return patch;
}

// للطلب: الغرف تُسأل فقط إن كان أحد الأنواع المطلوبة سكنياً
export function requestWantsRooms(types) {
  if (!types || !types.length) return false;
  return types.some((t) => PROFILES[t]?.rooms);
}
