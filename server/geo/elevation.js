// الارتفاع التقريبي عن سطح البحر في نواكشوط من نموذج Copernicus DEM GLO-30 (شبكة 1 ثانية قوسية ≈ 30 م).
// الملف dem-nouakchott.bin.gz: قيم Int16 بالديسيمتر، صفوف من الشمال إلى الجنوب، يغطي ELEV_GRID.
// نموذج سطح (DSM) يشمل المباني، ودقته بضعة أمتار: للاسترشاد فقط.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ELEV_GRID = { south: 17.95, north: 18.25, west: -16.10, east: -15.80, perDeg: 3600 };
export const ELEV_SOURCE = 'Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA';

let grid = null;
function load() {
  if (!grid) {
    const buf = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'dem-nouakchott.bin.gz')));
    const g = ELEV_GRID;
    grid = { data: new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2), rows: Math.round((g.north - g.south) * g.perDeg), cols: Math.round((g.east - g.west) * g.perDeg) };
  }
  return grid;
}

// بالمتر، بتقريب ثنائي الخطية؛ null خارج نواكشوط
export function elevationAt(lat, lng) {
  const g = ELEV_GRID;
  if (!(lat > g.south && lat < g.north && lng > g.west && lng < g.east)) return null;
  const { data, rows, cols } = load();
  const r = (g.north - lat) * g.perDeg; const c = (lng - g.west) * g.perDeg;
  const r0 = Math.min(rows - 2, Math.floor(r)); const c0 = Math.min(cols - 2, Math.floor(c));
  const fr = r - r0; const fc = c - c0;
  const v = (rr, cc) => data[rr * cols + cc] / 10;
  return (v(r0, c0) * (1 - fc) + v(r0, c0 + 1) * fc) * (1 - fr) + (v(r0 + 1, c0) * (1 - fc) + v(r0 + 1, c0 + 1) * fc) * fr;
}
