-- البحث العام عن القطع: المخططات التي اختار المدير إتاحتها، وقطعها (الرقم والموقع والحدود فقط، بلا صورة المخطط)
CREATE TABLE plan_index (
  plan_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  moughataa_code TEXT,
  area_name TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  georef TEXT NOT NULL DEFAULT '',
  lots_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE plan_lots (
  plan_id TEXT NOT NULL,
  lot TEXT NOT NULL,
  lot_norm TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  poly TEXT,                 -- [lat,lng,...] أو NULL إن لم تُستخرج الحدود
  status_label TEXT NOT NULL DEFAULT ''
);
CREATE INDEX plan_lots_find ON plan_lots(plan_id, lot_norm);
