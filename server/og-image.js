// صورة المشاركة لكل عرض (1200×630): صورة الغلاف وعليها نوع العملية والعنوان والمكان والمساحة والسعر،
// فتظهر في معاينة واتساب وفيسبوك كإعلان جاهز. تُولَّد من بيانات public.db فقط وتُحفظ في مجلد
// مؤقت غير مكشوف؛ المسار العام يتحقق في كل طلب أن العرض ما زال منشوراً.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from './config.js';
import { TYPES, DEALS_PUBLIC } from '../shared/vocab.js';
import { formatNumber } from '../shared/money.js';
import { displayPhone, normalizePhone } from '../shared/phone.js';

export const OG_W = 1200, OG_H = 630;
const FONT = path.join(config.root, 'server', 'assets', 'fonts', 'Cairo-Bold.ttf');
const LAYOUT_VERSION = '3'; // غيّره عند تعديل التصميم لتُولَّد الصور من جديد
const cacheDir = () => path.join(config.dataDir, 'og-cache');
const BRAND = '#0e5a4c', GOLD = '#f2c46d';

const markup = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clip = (s, n) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n - 1).trim() + '…' : t; };

async function textImg(text, { size, color = '#ffffff', width = OG_W - 120 }) {
  const { data, info } = await sharp({ text: { text: `<span foreground="${color}">${markup(text)}</span>`, font: `Cairo Bold ${size}`, fontfile: FONT, rgba: true, width, align: 'right' } })
    .png().toBuffer({ resolveWithObject: true });
  return { input: data, w: info.width, h: info.height };
}

// المفتاح يتغير مع أي تعديل على العرض أو على اسم الموقع ورقمه
export function ogKey(l, site) {
  return crypto.createHash('sha256').update([LAYOUT_VERSION, l.ref, l.updated_at, site.site_name, site.contact_whatsapp || site.contact_phone || ''].join('|')).digest('hex').slice(0, 12);
}

export async function renderOg(l, site, priceMain) {
  const deal = DEALS_PUBLIC[l.deal] || '';
  const typeLabel = TYPES[l.type] || 'عقار';
  const coverPath = l.cover ? path.join(config.publicMediaDir, l.ref, l.cover + '.webp') : null;
  const base = coverPath && fs.existsSync(coverPath)
    ? sharp(coverPath).resize(OG_W, OG_H, { fit: 'cover', position: 'attention' })
    : sharp({ create: { width: OG_W, height: OG_H, channels: 3, background: BRAND } });
  // تدرج داكن أسفل الصورة ليُقرأ النص فوق أي صورة
  const shade = Buffer.from(`<svg width="${OG_W}" height="${OG_H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.25" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect y="${OG_H - 64}" width="100%" height="64" fill="${BRAND}"/></svg>`);
  const layers = [{ input: shade, top: 0, left: 0 }];
  const pad = 60;
  const right = (img, top) => ({ input: img.input, top: Math.round(top), left: Math.max(pad, OG_W - pad - img.w) });

  // شريط سفلي: اسم الموقع ورقم واتساب
  const wa = normalizePhone(site.contact_whatsapp || site.contact_phone || '');
  const brand = await textImg(site.site_name || 'الوسيط العقاري', { size: 30, width: 700 });
  layers.push(right(brand, OG_H - 32 - brand.h / 2));
  if (wa) {
    // الرقم في سطر مستقل اتجاهه من اليسار (LRM) حتى لا تنقلب مجموعات الأرقام
    const ph = await textImg('\u200e' + displayPhone(wa), { size: 28, color: GOLD, width: 300 });
    const lbl = await textImg('واتساب', { size: 28, color: GOLD, width: 200 });
    layers.push({ input: ph.input, top: Math.round(OG_H - 32 - ph.h / 2), left: pad }, { input: lbl.input, top: Math.round(OG_H - 32 - lbl.h / 2), left: pad + ph.w + 12 });
  }

  // من الأسفل إلى الأعلى: السعر، ثم المكان والمساحة، ثم العنوان
  let y = OG_H - 64 - 24;
  const price = await textImg(clip(priceMain, 48), { size: 50, color: GOLD });
  y -= price.h; layers.push(right(price, y));
  const meta = [l.place_label, l.area_m2 ? `${formatNumber(l.area_m2)} م²` : '', l.bedrooms ? `${l.bedrooms} غرف` : ''].filter(Boolean).join('  ·  ');
  if (meta) { const m = await textImg(clip(meta, 70), { size: 34, color: '#e8efe9' }); y -= m.h + 6; layers.push(right(m, y)); }
  const title = await textImg(clip(l.title, 46), { size: 52 });
  y -= title.h + 4; layers.push(right(title, y));

  // شارة العملية أعلى الصورة
  const badgeText = await textImg(`${deal} · ${typeLabel}`, { size: 30, width: 600 });
  const bw = badgeText.w + 48, bh = badgeText.h + 16;
  const badgeBg = Buffer.from(`<svg width="${bw}" height="${bh}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${bh / 2}" fill="${l.deal === 'rent' ? '#1d6fb8' : '#b5481f'}"/></svg>`);
  layers.push({ input: badgeBg, top: 40, left: OG_W - pad - bw }, { input: badgeText.input, top: 48, left: OG_W - pad - bw + 24 });

  return base.composite(layers).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

// يُرجع مسار الصورة المخزنة، ويولدها عند أول طلب بعد أي تعديل
const pending = new Map();
export async function ogImageFile(l, site, priceMain) {
  const key = ogKey(l, site);
  const dir = cacheDir();
  const file = path.join(dir, `${l.ref}-${key}.jpg`);
  if (fs.existsSync(file)) return file;
  if (pending.has(file)) return pending.get(file);
  const job = (async () => {
    fs.mkdirSync(dir, { recursive: true });
    const buf = await renderOg(l, site, priceMain);
    // نحذف النسخ القديمة لهذا العرض
    for (const f of fs.readdirSync(dir)) if (f.startsWith(l.ref + '-') && f !== path.basename(file)) fs.rmSync(path.join(dir, f), { force: true });
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
    return file;
  })().finally(() => pending.delete(file));
  pending.set(file, job);
  return job;
}

export function dropOgCache(ref) {
  const dir = cacheDir();
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) if (f.startsWith(ref + '-')) fs.rmSync(path.join(dir, f), { force: true });
}
