-- public.db: لا يحتوي إلا ما اخترت نشره. الموقع العام يقرأ من هذا الملف وحده (اتصال للقراءة فقط).
CREATE TABLE listings (
  ref TEXT PRIMARY KEY,
  deal TEXT,
  type TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  wilaya_code TEXT, moughataa_code TEXT,
  place_label TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  price_amount REAL,              -- NULL إذا أُخفي أو غير معروف
  price_currency TEXT,
  price_basis TEXT,
  price_mru REAL,                 -- للفرز والفلترة فقط عند تأكيد العملة
  price_hidden INTEGER NOT NULL DEFAULT 0,
  price_negotiable INTEGER NOT NULL DEFAULT 0,
  area_m2 REAL,
  lot_number TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  sector TEXT NOT NULL DEFAULT '',
  bedrooms INTEGER, bathrooms INTEGER, floors INTEGER,
  features TEXT NOT NULL DEFAULT '[]',
  loc_mode TEXT NOT NULL DEFAULT 'hidden',  -- exact, approximate, hidden
  lat REAL, lng REAL,                       -- مُزاحة عند التقريب
  radius_m INTEGER,
  boundary TEXT,                            -- GeoJSON موثق ومسموح بنشره فقط
  boundary_source TEXT,
  photos TEXT NOT NULL DEFAULT '[]',        -- [{key,w,h}]
  cover TEXT,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX listings_pub ON listings(published_at DESC);
CREATE TABLE site (key TEXT PRIMARY KEY, value TEXT NOT NULL);
