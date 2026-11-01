// يولّد أيقونات الموقع وصورة المشاركة الافتراضية من شعار «الوسيط العقاري» (public-static/logo-mark.svg).
// التشغيل: node scripts/make-icons.mjs [رقم واتساب]
import sharp from 'sharp'; import fs from 'node:fs';
process.chdir(new URL('..', import.meta.url).pathname);
const GREEN = '#2cb33b', ORANGE = '#e8873f', GRAY = '#6b6e75';
const FONT = 'server/assets/fonts/Cairo-Bold.ttf';
const wa = process.argv[2] || '26463808';

const markSvg = fs.readFileSync('public-static/logo-mark.svg', 'utf8');
const inner = markSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
// أيقونة مربعة بخلفية بيضاء (المتصفح والهاتف)
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" rx="160" fill="#fff"/><g transform="translate(64 40) scale(.86)">${inner}</g></svg>\n`;
fs.writeFileSync('public-static/icon.svg', icon);
const iconBuf = Buffer.from(icon);
for (const [s, f] of [[180, 'admin-ui/public/icon-180.png'], [192, 'admin-ui/public/icon-192.png'], [512, 'admin-ui/public/icon-512.png'], [180, 'public-static/icon-180.png']])
  await sharp(iconBuf, { density: 300 }).resize(s, s).flatten({ background: '#fff' }).png().toFile(f);

const text = async (markup, size, width) => {
  const { data, info } = await sharp({ text: { text: markup, font: `Cairo Bold ${size}`, fontfile: FONT, rgba: true, width, align: 'center' } }).png().toBuffer({ resolveWithObject: true });
  return { input: data, w: info.width, h: info.height };
};
const name = await text(`<span foreground="${GREEN}">الوسيط العقاري</span>`, 76, 580);
const latin = await text(`<span foreground="${ORANGE}">E</span><span foreground="${GRAY}">LWESITE IMMOBILIER</span>`, 34, 700);
const tag = await text(`<span foreground="#1c2a20">بيع وشراء وإيجار العقارات في نواكشوط</span>`, 30, 640);
const phone = await text(`<span foreground="${GRAY}">واتساب  </span><span foreground="#128c4b">‎${wa.replace(/(\d{2})(?=\d)/g, '$1 ')}</span>`, 40, 640);
const mark = (s) => sharp(Buffer.from(markSvg), { density: 300 }).resize(s, s).png().toBuffer();

// صورة المشاركة الافتراضية 1200×630: الشعار يميناً والنصوص يساراً على خلفية شبكة قطع باهتة
const grid = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><pattern id="p" width="72" height="48" patternUnits="userSpaceOnUse"><path d="M72 0H0V48" fill="none" stroke="${GREEN}" stroke-opacity=".12" stroke-width="2"/></pattern></defs><rect width="1200" height="630" fill="#f5f9f5"/><rect width="1200" height="630" fill="url(#p)"/><circle cx="905" cy="315" r="262" fill="#fff" stroke="${GREEN}" stroke-width="14"/><rect y="0" width="1200" height="12" fill="${GREEN}"/><rect y="618" width="1200" height="12" fill="${GREEN}"/></svg>`);
const colX = (img) => Math.round(330 - img.w / 2);
let y = 140;
const layers = [{ input: await mark(400), left: 705, top: 115 }];
for (const [img, gap] of [[name, 0], [latin, 6], [tag, 40], [phone, 34]]) { y += gap; layers.push({ input: img.input, left: colX(img), top: y }); y += img.h; }
await sharp(grid).composite(layers).png({ compressionLevel: 9 }).toFile('public-static/og.png');

// شعار مربع كامل (للبيانات المنظمة وملفات التعريف)
const name2 = await text(`<span foreground="${GREEN}">الوسيط العقاري</span>`, 64, 480);
const latin2 = await text(`<span foreground="${ORANGE}">E</span><span foreground="${GRAY}">LWESITE IMMOBILIER</span>`, 26, 480);
await sharp({ create: { width: 512, height: 512, channels: 3, background: '#ffffff' } })
  .composite([{ input: await mark(330), left: 91, top: 18 }, { input: name2.input, left: Math.round(256 - name2.w / 2), top: 350 }, { input: latin2.input, left: Math.round(256 - latin2.w / 2), top: 352 + name2.h }])
  .png({ compressionLevel: 9 }).toFile('public-static/logo.png');
console.log('ok');
