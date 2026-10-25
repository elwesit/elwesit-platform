// إحصاءات الموقع العام: زيارات الصفحات ونقرات «استفسر عبر واتساب» والمشاركة، ومصدر الزائر.
// المدخل الثاني من الموقع العام إلى main.db بعد «الوارد»: يزيد عدادات يومية مجمّعة فقط،
// لا يحفظ عنوان IP ولا هوية الزائر ولا يضع كعكات.
import { db, publicReadDb } from './db.js';

export const PAGES = new Set(['home', 'listing', 'lots', 'area', 'form', 'other']);
const EVENTS = { view: 'views', wa: 'wa', share: 'shares' };

// أسماء المصادر كما تظهر في لوحة الإدارة
export const SOURCE_LABELS = {
  direct: 'مباشر أو غير معروف', fb: 'فيسبوك', ig: 'إنستغرام', tt: 'تيك توك', wa: 'واتساب', share: 'مشاركة من الموقع',
  google: 'بحث Google', bing: 'بحث Bing', x: 'X (تويتر)', yt: 'يوتيوب', sc: 'سناب شات', qr: 'رمز QR', other: 'مواقع أخرى',
};

const HOSTS = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'fb'], [/(^|\.)instagram\.com$/, 'ig'], [/(^|\.)tiktok\.com$/, 'tt'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'wa'], [/(^|\.)google\.[a-z.]+$/, 'google'], [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'yt'], [/(^|\.)snapchat\.com$/, 'sc'],
];

// المصدر: ?src= في الرابط إن وُجد (روابط الحملات)، وإلا موقع الإحالة، وإلا «مباشر»
export function sourceOf(src, refHost) {
  const s = String(src || '').toLowerCase().trim();
  if (/^[a-z0-9_-]{1,24}$/.test(s)) return s;
  const h = String(refHost || '').toLowerCase().trim().replace(/^www\./, '');
  if (!h) return 'direct';
  for (const [re, name] of HOSTS) if (re.test(h)) return name;
  return /^[a-z0-9.-]{1,120}$/.test(h) ? 'other' : 'direct';
}

// برامج المعاينة (واتساب، فيسبوك…) ومحركات البحث لا تُحسب زيارات
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|telegram|preview|headless|lighthouse|python|curl|wget/i;
export const isBot = (ua) => !ua || BOT.test(ua);

const today = () => new Date().toISOString().slice(0, 10);

export function recordHit({ ev, page, ref, src, refHost }) {
  const col = EVENTS[ev];
  if (!col) return { error: 'bad_event' };
  const p = PAGES.has(page) ? page : 'other';
  let r = '';
  if (ref) {
    // لا نعدّ إلا عروضاً منشورة فعلاً، حتى لا تمتلئ القاعدة بمراجع عشوائية
    if (!publicReadDb().prepare('SELECT 1 FROM listings WHERE ref = ?').get(String(ref).slice(0, 20))) return { error: 'no_listing' };
    r = String(ref).slice(0, 20);
  }
  if ((ev === 'wa' || ev === 'share') && !r) return { error: 'no_listing' };
  const s = sourceOf(src, refHost);
  db().prepare(`INSERT INTO stat_daily (day, page, ref, src, ${col}) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(day, page, ref, src) DO UPDATE SET ${col} = ${col} + 1`).run(today(), p, r, s);
  return { ok: true, src: s };
}

// ملخص آخر N يوماً للوحة الإدارة
export function statsSummary(days = 30) {
  const n = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
  const from = new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);
  const d = db();
  const totals = d.prepare('SELECT COALESCE(SUM(views),0) views, COALESCE(SUM(wa),0) wa, COALESCE(SUM(shares),0) shares FROM stat_daily WHERE day >= ?').get(from);
  totals.inquiries = d.prepare("SELECT COUNT(*) c FROM inbox WHERE source = 'site' AND created_at >= ?").get(from).c;
  const bySrc = d.prepare('SELECT src, SUM(views) views, SUM(wa) wa, SUM(shares) shares FROM stat_daily WHERE day >= ? GROUP BY src ORDER BY views DESC, wa DESC').all(from)
    .map((r) => ({ ...r, label: SOURCE_LABELS[r.src] || r.src }));
  const byPage = d.prepare('SELECT page, SUM(views) views FROM stat_daily WHERE day >= ? GROUP BY page ORDER BY views DESC').all(from);
  const titles = new Map(d.prepare('SELECT ref, pub_title, title, id FROM properties').all().map((p) => [p.ref, p]));
  const pubTitles = new Map(publicReadDb().prepare('SELECT ref, title FROM listings').all().map((l) => [l.ref, l.title]));
  const top = d.prepare("SELECT ref, SUM(views) views, SUM(wa) wa, SUM(shares) shares FROM stat_daily WHERE day >= ? AND ref != '' GROUP BY ref ORDER BY views DESC, wa DESC LIMIT 20").all(from)
    .map((r) => { const p = titles.get(r.ref); return { ...r, id: p?.id || null, title: pubTitles.get(r.ref) || p?.pub_title || p?.title || r.ref, published: pubTitles.has(r.ref) }; });
  // كل الأيام حتى الفارغة، ليُقرأ الرسم كخط زمني
  const byDay = new Map(d.prepare('SELECT day, SUM(views) views, SUM(wa) wa FROM stat_daily WHERE day >= ? GROUP BY day').all(from).map((r) => [r.day, r]));
  const daily = Array.from({ length: n }, (_, i) => { const day = new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10); return byDay.get(day) || { day, views: 0, wa: 0 }; });
  return { days: n, from, totals, by_src: bySrc, by_page: byPage, top, daily };
}
