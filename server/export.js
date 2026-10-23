// تصدير Excel بعناوين عربية واتجاه من اليمين لليسار، مع تحييد الصيغ (منع حقن الصيغ في الجداول).
import ExcelJS from 'exceljs';
import { db } from './db.js';
import { TYPES, DEALS, AVAILABILITY, REQUEST_STATUS, DEAL_STAGES, APPT_STATUS, APPT_KINDS, ROLES, PRIORITY } from '../shared/vocab.js';
import { CURRENCIES, PRICE_BASIS, toMRU } from '../shared/money.js';

// أي خلية نصية تبدأ بـ = + - @ أو محارف تحكم تُسبق بفاصلة عليا فلا تُفسَّر كصيغة
export function safeCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return v;
  const s = String(v);
  return /^[=+\-@\t\r|%]/.test(s) ? "'" + s : s;
}

const fmtDate = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) : '');
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

export async function buildWorkbook(sheets = ['people', 'requests', 'properties', 'appointments', 'deals', 'commissions', 'tasks']) {
  const d = db();
  const geo = new Map([...d.prepare('SELECT code, name_ar FROM wilayas').all(), ...d.prepare('SELECT code, name_ar FROM moughataas').all()].map((r) => [r.code, r.name_ar]));
  const people = new Map(d.prepare('SELECT id, name FROM people').all().map((r) => [r.id, r.name]));
  const props = new Map(d.prepare('SELECT id, ref, title FROM properties').all().map((r) => [r.id, r.ref]));
  const phones = new Map();
  for (const p of d.prepare('SELECT person_id, raw FROM phones WHERE archived_at IS NULL').all()) phones.set(p.person_id, [...(phones.get(p.person_id) || []), p.raw]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'الوسيط العقاري';
  wb.created = new Date();
  const add = (name, columns, rows) => {
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map(([header, key, width]) => ({ header, key, width: width || 18 }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])));
  };
  if (sheets.includes('people')) add('العملاء', [['الاسم', 'name', 24], ['اسم آخر/فرنسي', 'alt'], ['الهواتف', 'phones', 24], ['الأدوار', 'roles'], ['الأولوية', 'priority'], ['المصدر', 'source'], ['ملاحظات', 'notes', 40], ['تاريخ الإضافة', 'created']],
    d.prepare('SELECT * FROM people WHERE archived_at IS NULL AND merged_into IS NULL ORDER BY name').all().map((p) => ({ name: p.name, alt: p.name_alt, phones: (phones.get(p.id) || []).join(' / '), roles: J(p.roles).map((r) => ROLES[r] || r).join('، '), priority: PRIORITY[p.priority], source: p.source, notes: p.notes, created: fmtDate(p.created_at) })));
  if (sheets.includes('requests')) add('الطلبات', [['المرجع', 'ref', 10], ['العميل', 'person', 22], ['العملية', 'deal'], ['الأنواع', 'types'], ['المواقع', 'locs', 30], ['الميزانية كما وردت', 'braw', 22], ['الحد الأدنى', 'bmin'], ['الحد الأعلى', 'bmax'], ['العملة', 'cur'], ['المساحة', 'area'], ['المواصفات', 'specs', 30], ['الحالة', 'status'], ['الأولوية', 'priority'], ['تاريخ الإضافة', 'created']],
    d.prepare('SELECT * FROM requests WHERE archived_at IS NULL ORDER BY created_at DESC').all().map((r) => ({ ref: r.ref, person: people.get(r.person_id) || '', deal: DEALS[r.deal] || '', types: J(r.types).map((t) => TYPES[t] || t).join('، '), locs: J(r.locations).map((l) => l.text || geo.get(l.moughataa_code) || geo.get(l.wilaya_code) || '').join('، '), braw: r.budget_raw, bmin: r.budget_min, bmax: r.budget_max, cur: CURRENCIES[r.budget_currency]?.label, area: [r.area_min, r.area_max].filter((x) => x != null).join(' - '), specs: r.specs, status: REQUEST_STATUS[r.status], priority: PRIORITY[r.priority], created: fmtDate(r.created_at) })));
  if (sheets.includes('properties')) add('العروض', [['المرجع', 'ref', 10], ['العنوان', 'title', 28], ['العملية', 'deal'], ['النوع', 'type'], ['الولاية', 'w'], ['المقاطعة', 'm'], ['الحي/المنطقة', 'area'], ['معلم قريب', 'lm'], ['المخطط', 'plan'], ['القطاع', 'sector'], ['رقم القطعة', 'lot'], ['المساحة م²', 'm2'], ['السعر كما ورد', 'praw', 20], ['السعر', 'price'], ['العملة', 'cur'], ['أساس السعر', 'basis'], ['بالأوقية الجديدة', 'mru'], ['التوفر', 'avail'], ['آخر تحقق', 'verified'], ['منشور', 'pub'], ['المالك', 'owner']],
    d.prepare('SELECT * FROM properties WHERE archived_at IS NULL ORDER BY created_at DESC').all().map((p) => ({ ref: p.ref, title: p.title, deal: DEALS[p.deal] || '', type: TYPES[p.type] || '', w: geo.get(p.wilaya_code) || '', m: geo.get(p.moughataa_code) || '', area: p.area_text, lm: p.landmark, plan: p.plan, sector: p.sector, lot: p.lot_number, m2: p.area_m2, praw: p.price_raw, price: p.price_amount, cur: CURRENCIES[p.price_currency]?.label, basis: PRICE_BASIS[p.price_basis], mru: toMRU(p.price_amount, p.price_currency), avail: AVAILABILITY[p.availability], verified: fmtDate(p.verified_at), pub: p.published ? 'نعم' : 'لا', owner: people.get(p.owner_person_id) || '' })));
  if (sheets.includes('appointments')) add('المواعيد', [['التاريخ والوقت (نواكشوط)', 'at', 22], ['النوع', 'kind'], ['العميل', 'person', 22], ['العقار', 'prop'], ['المكان', 'place', 24], ['الأطراف', 'parties', 24], ['الحالة', 'status'], ['النتيجة', 'outcome', 30]],
    d.prepare('SELECT * FROM appointments WHERE archived_at IS NULL ORDER BY starts_at DESC').all().map((a) => ({ at: fmtDate(a.starts_at), kind: APPT_KINDS[a.kind], person: people.get(a.person_id) || '', prop: props.get(a.property_id) || '', place: a.place, parties: a.parties, status: APPT_STATUS[a.status], outcome: a.outcome })));
  if (sheets.includes('deals')) add('الصفقات', [['الفرصة', 'title', 26], ['العميل', 'client', 22], ['المالك/البائع', 'owner', 22], ['العقار', 'prop'], ['المرحلة', 'stage'], ['سبب التوقف', 'lost', 24], ['المبلغ المتفق عليه', 'agreed'], ['العملة', 'cur'], ['تاريخ الإغلاق', 'closed']],
    d.prepare('SELECT * FROM deals WHERE archived_at IS NULL ORDER BY updated_at DESC').all().map((x) => ({ title: x.title, client: people.get(x.client_person_id) || '', owner: people.get(x.owner_person_id) || '', prop: props.get(x.property_id) || '', stage: DEAL_STAGES[x.stage], lost: x.lost_reason, agreed: x.agreed_amount, cur: CURRENCIES[x.agreed_currency]?.label, closed: fmtDate(x.closed_at) })));
  if (sheets.includes('commissions')) {
    const deals = new Map(d.prepare('SELECT id, title, stage FROM deals').all().map((r) => [r.id, r]));
    add('العمولات', [['الصفقة', 'deal', 26], ['الطرف', 'party', 22], ['الأساس', 'basis'], ['النسبة %', 'pct'], ['المستحق', 'amount'], ['المدفوع', 'paid'], ['المتبقي', 'rem'], ['العملة', 'cur'], ['تاريخ الاستحقاق', 'due'], ['الاتفاق', 'agreement', 30]],
      d.prepare('SELECT c.*, COALESCE((SELECT SUM(amount) FROM commission_payments p WHERE p.commission_id = c.id AND p.archived_at IS NULL), 0) paid FROM commissions c WHERE c.archived_at IS NULL').all().map((c) => ({ deal: deals.get(c.deal_id)?.title || '', party: people.get(c.party_person_id) || '', basis: c.basis === 'percent' ? 'نسبة' : 'مبلغ ثابت', pct: c.percent, amount: c.amount, paid: c.paid, rem: c.amount != null ? c.amount - c.paid : null, cur: CURRENCIES[c.currency]?.label, due: fmtDate(c.due_at), agreement: c.agreement })));
  }
  if (sheets.includes('tasks')) add('المتابعات', [['المهمة', 'title', 34], ['الموعد', 'due', 20], ['الشخص', 'person', 22], ['منجزة', 'done']],
    d.prepare('SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY due_at').all().map((t) => ({ title: t.title, due: fmtDate(t.due_at), person: people.get(t.person_id) || '', done: t.done_at ? 'نعم' : 'لا' })));
  return wb;
}
