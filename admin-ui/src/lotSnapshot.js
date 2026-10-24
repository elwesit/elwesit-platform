// صورة القطعة من المخطط: قص صغير من صورة المخطط حول القطعة، بحدودها وأطوال أضلاعها، لإضافتها إلى صور العرض.
import { fileUrl } from './data.js';
import { planLabel, sidesText } from '@shared/plans.js';

const W = 1200; const H = 900; const BAR = 96;
const ar = (x) => (Math.round(x * 10) / 10).toLocaleString('ar-u-nu-latn');

export async function lotSnapshot(hit) {
  const plan = hit.plan;
  if (!plan.image_file_id) throw new Error('هذا المخطط بلا صورة.');
  const res = await fetch(fileUrl({ id: plan.image_file_id }), { credentials: 'same-origin' });
  if (!res.ok) throw new Error('تعذر تحميل صورة المخطط.');
  const img = await createImageBitmap(await res.blob());
  const { south, west, north, east } = plan;
  const toPx = ([lat, lng]) => [((lng - west) / (east - west)) * img.width, ((north - lat) / (north - south)) * img.height];

  // الإطار: القطعة في الوسط بعرض نحو ثلث الصورة، أو 60 م حول النقطة إن لم تُعرف حدودها
  const pts = hit.shape ? hit.shape.poly.map(toPx) : null;
  const [cx, cy] = pts ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : toPx([hit.lat, hit.lng]);
  const mPerPx = ((east - west) * 111320 * Math.cos(((north + south) / 2) * Math.PI / 180)) / img.width;
  let span = pts ? Math.max(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), (Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))) * W / (H - BAR)) * 3 : 60 / mPerPx;
  span = Math.max(span, 45 / mPerPx);
  const cw = span; const ch = span * (H - BAR) / W;
  const sx = cx - cw / 2; const sy = cy - ch / 2;
  const k = W / cw;
  const P = ([x, y]) => [(x - sx) * k, (y - sy) * k];

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, cw, ch, 0, 0, W, H - BAR);
  img.close?.();

  if (pts) {
    const q = pts.map(P);
    g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = 'rgba(122,74,184,.22)'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#7a4ab8'; g.stroke();
    // طول كل ضلع على منتصفه
    g.font = 'bold 26px system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    q.forEach((p, i) => {
      if (hit.shape.sides[i] < 2) return;
      const n = q[(i + 1) % q.length];
      const t = `${ar(hit.shape.sides[i])} م`;
      const mx = (p[0] + n[0]) / 2; const my = (p[1] + n[1]) / 2;
      const w = g.measureText(t).width + 18;
      g.fillStyle = 'rgba(255,255,255,.94)'; g.strokeStyle = '#7a4ab8'; g.lineWidth = 2;
      g.beginPath(); g.roundRect ? g.roundRect(mx - w / 2, my - 18, w, 36, 8) : g.rect(mx - w / 2, my - 18, w, 36); g.fill(); g.stroke();
      g.fillStyle = '#4a2a7a'; g.fillText(t, mx, my + 1);
    });
  } else {
    const [x, y] = P([cx, cy]);
    g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fillStyle = '#7a4ab8'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
  }

  // سهم الشمال (صورة المخطط موجهة للشمال دائماً)
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(W - 46, 46, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1d2623'; g.beginPath(); g.moveTo(W - 46, 22); g.lineTo(W - 58, 54); g.lineTo(W - 46, 47); g.lineTo(W - 34, 54); g.closePath(); g.fill();
  g.font = 'bold 15px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('N', W - 46, 66);

  // الشريط السفلي
  g.fillStyle = '#0e5a4c'; g.fillRect(0, H - BAR, W, BAR);
  g.fillStyle = '#fff'; g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
  g.font = 'bold 34px system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif';
  // كل جزء يُرسم وحده من اليمين، كي لا يخلط اتجاه النص العربي واللاتيني ترتيب الأجزاء
  const line = (parts, y) => {
    let x = W - 28;
    parts.filter(Boolean).forEach((t, i) => {
      if (i) { g.fillText(' · ', x, y); x -= g.measureText(' · ').width; }
      g.fillText(t, x, y); x -= g.measureText(t).width;
    });
  };
  line([`قطعة ${hit.lot}`, planLabel(plan), hit.shape && `${hit.shape.area.toLocaleString('ar-u-nu-latn')} م²`], H - BAR + 44);
  g.font = '20px system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)';
  line(hit.shape ? [sidesText(hit.shape.sides), 'من مخطط التجزئة، للاسترشاد'] : ['موقع القطعة من مخطط التجزئة، للاسترشاد'], H - BAR + 78);

  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  c.width = c.height = 0;
  if (!blob) throw new Error('تعذر تجهيز الصورة.');
  return new File([blob], `lot-${hit.lot}.jpg`, { type: 'image/jpeg' });
}
