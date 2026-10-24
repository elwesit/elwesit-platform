// مخطط GeoPDF صغير مصطنع للاختبارات (مخططات المستخدم الحقيقية لا تدخل المستودع العام)
// إطار الخريطة [50 50 550 550] يقابل الحدود bounds = [جنوب، غرب، شمال، شرق]
export function makeGeoPdf({ bounds = [18.1100, -15.9800, 18.1145, -15.9753], lots = 12, first = 101, geo = true } = {}) {
  const [s, w, n, e] = bounds;
  const ops = ['0.2 0.2 0.6 RG 1 w 50 50 500 500 re S'];
  for (let i = 0; i < lots; i++) {
    const cx = 80 + (i % 4) * 120; const cy = 480 - Math.floor(i / 4) * 120;
    ops.push(`${cx - 30} ${cy - 30} 100 80 re S`);
    ops.push(`BT /F1 9 Tf 1 0 0 1 ${cx} ${cy} Tm (${first + i}) Tj ET`);
  }
  ops.push('BT /F2 14 Tf 1 0 0 1 60 565 Tm (Plan de lotissement test) Tj ET');
  const content = ops.join('\n');
  const vp = geo ? ' /VP [<< /Type /Viewport /BBox [50 50 550 550] /Measure 6 0 R >>]' : '';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 600] /Resources << /Font << /F1 4 0 R /F2 7 0 R >> >> /Contents 5 0 R${vp} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Measure /Subtype /GEO /Bounds [0 1 0 0 1 0 1 1] /GPTS [${n} ${w} ${s} ${w} ${s} ${e} ${n} ${e}] /LPTS [0 1 0 0 1 0 1 1] /GCS << /Type /PROJCS /WKT (GEOGCS["WGS 84"]) >> >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let pdf = '%PDF-1.7\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
