-- مخططات التجزئة (لوتيسمان): صورة مضبوطة على الخريطة + فهرس أرقام القطع ومواقعها.
-- الصورة ملف خاص (files, owner_type = 'plan')؛ لا تُنشر للزوار.
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  lotissement TEXT NOT NULL DEFAULT '',     -- اسم التجزئة كما يُكتب في خانة «المخطط»
  moughataa_code TEXT,
  source_name TEXT NOT NULL DEFAULT '',
  source_date TEXT,
  georef TEXT NOT NULL DEFAULT '',          -- geopdf: إحداثيات مضمنة في الملف، points: نقاط مرجعية من المخطط
  south REAL, west REAL, north REAL, east REAL,
  image_file_id TEXT,
  transparent INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  lots TEXT NOT NULL DEFAULT '[]',          -- [[رقم, lat, lng, حالة؟], ...]
  status_legend TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  fv TEXT NOT NULL DEFAULT '{}'
);
