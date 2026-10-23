-- الوسيط العقاري: البنية الأساسية للبيانات الخاصة (main.db)
-- كل السجلات القابلة للتعديل تحمل version لمنع الكتابة الصامتة فوق تعديل جهاز آخر،
-- و updated_at للمزامنة، و archived_at للأرشفة بدل الحذف.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  -- الصلاحية تُمنح صراحةً من سطر الأوامر فقط. 'none' لا يصل لأي بيانات.
  role TEXT NOT NULL DEFAULT 'none' CHECK (role IN ('none','owner','admin')),
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE recovery_codes (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- الجغرافيا
CREATE TABLE wilayas (
  code TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  lat REAL, lng REAL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE moughataas (
  code TEXT PRIMARY KEY,
  wilaya_code TEXT NOT NULL REFERENCES wilayas(code),
  name_ar TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  lat REAL, lng REAL
);
-- الأحياء والمناطق: يضيفها الوسيط. moughataa_code اختياري ولا يُخمَّن.
CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  wilaya_code TEXT REFERENCES wilayas(code),
  moughataa_code TEXT REFERENCES moughataas(code),
  kind TEXT NOT NULL DEFAULT 'area' CHECK (kind IN ('area','landmark','plan')),
  lat REAL, lng REAL,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- الأشخاص: ملف موحد بأدوار متعددة
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  name_alt TEXT NOT NULL DEFAULT '',
  roles TEXT NOT NULL DEFAULT '[]',          -- buyer, seller, tenant, landlord, owner, broker
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  source TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  merged_into TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE phones (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  raw TEXT NOT NULL,
  normalized TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  whatsapp INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX phones_norm ON phones(normalized);
CREATE INDEX phones_person ON phones(person_id);

-- العقارات (العروض). السعر كما ورد + تفسيره المؤكد.
CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  deal TEXT CHECK (deal IN ('sale','rent')),
  type TEXT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  wilaya_code TEXT,
  moughataa_code TEXT,
  area_id TEXT,
  area_text TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  location_desc TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  location_method TEXT,                      -- pin, gps, coords, link
  location_precision TEXT NOT NULL DEFAULT 'none' CHECK (location_precision IN ('exact','approximate','none')),
  plan TEXT NOT NULL DEFAULT '',             -- المخطط
  sector TEXT NOT NULL DEFAULT '',           -- القطاع
  lot_number TEXT NOT NULL DEFAULT '',       -- رقم القطعة / النمرة
  lot_norm TEXT NOT NULL DEFAULT '',
  area_m2 REAL,
  frontage TEXT NOT NULL DEFAULT '',
  bedrooms INTEGER, bathrooms INTEGER, floors INTEGER,
  features TEXT NOT NULL DEFAULT '[]',
  owner_person_id TEXT,
  price_raw TEXT NOT NULL DEFAULT '',
  price_amount REAL,                         -- القيمة كما فُسِّرت بالعملة المحددة
  price_currency TEXT NOT NULL DEFAULT 'unknown' CHECK (price_currency IN ('MRU','MRO','unknown')),
  price_basis TEXT NOT NULL DEFAULT 'total' CHECK (price_basis IN ('total','per_m2','monthly','yearly','daily')),
  price_confirmed INTEGER NOT NULL DEFAULT 0,
  price_negotiable INTEGER NOT NULL DEFAULT 0,
  price_terms TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('available','reserved','sold','rented','withdrawn','unknown')),
  verified_at TEXT,                          -- آخر تحقق من السعر والتوفر
  internal_notes TEXT NOT NULL DEFAULT '',
  -- النشر
  published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  pub_title TEXT NOT NULL DEFAULT '',
  pub_description TEXT NOT NULL DEFAULT '',
  pub_show_price INTEGER NOT NULL DEFAULT 1,
  pub_show_lot INTEGER NOT NULL DEFAULT 0,
  pub_show_plan INTEGER NOT NULL DEFAULT 1,
  pub_show_landmark INTEGER NOT NULL DEFAULT 1,
  pub_location TEXT NOT NULL DEFAULT 'approximate' CHECK (pub_location IN ('exact','approximate','hidden')),
  pub_show_boundary INTEGER NOT NULL DEFAULT 0,
  pub_photo_ids TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX properties_lot ON properties(lot_norm);

-- مصادر العرض: نفس العقار من عدة وسطاء/ملاك بأسعار وشروط مختلفة
CREATE TABLE property_sources (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  person_id TEXT,
  relation TEXT NOT NULL DEFAULT 'broker' CHECK (relation IN ('owner','broker','relative','other')),
  channel TEXT NOT NULL DEFAULT '',
  price_raw TEXT NOT NULL DEFAULT '',
  price_amount REAL,
  price_currency TEXT NOT NULL DEFAULT 'unknown' CHECK (price_currency IN ('MRU','MRO','unknown')),
  price_basis TEXT NOT NULL DEFAULT 'total',
  commission_terms TEXT NOT NULL DEFAULT '',
  conditions TEXT NOT NULL DEFAULT '',
  verified_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX sources_property ON property_sources(property_id);

-- حدود/أشكال مرتبطة بعقار، مع مصدرها. method: manual = رسمتها بنفسي، imported = مستوردة
CREATE TABLE geometries (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  plan TEXT NOT NULL DEFAULT '', sector TEXT NOT NULL DEFAULT '', lot_number TEXT NOT NULL DEFAULT '', lot_norm TEXT NOT NULL DEFAULT '',
  geojson TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('manual','imported')),
  source_name TEXT NOT NULL DEFAULT '',
  source_license TEXT NOT NULL DEFAULT '',
  source_date TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  area_m2 REAL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX geometries_lot ON geometries(lot_norm);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  person_id TEXT,
  deal TEXT CHECK (deal IN ('sale','rent')),
  types TEXT NOT NULL DEFAULT '[]',
  locations TEXT NOT NULL DEFAULT '[]',      -- [{wilaya_code, moughataa_code, area_id, text}]
  budget_raw TEXT NOT NULL DEFAULT '',
  budget_min REAL, budget_max REAL,
  budget_currency TEXT NOT NULL DEFAULT 'unknown' CHECK (budget_currency IN ('MRU','MRO','unknown')),
  budget_basis TEXT NOT NULL DEFAULT 'total',
  budget_confirmed INTEGER NOT NULL DEFAULT 0,
  area_min REAL, area_max REAL,
  bedrooms_min INTEGER,
  specs TEXT NOT NULL DEFAULT '',
  flexibility TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','active','paused','won','lost')),
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- ما أرسلته لكل عميل وردّه
CREATE TABLE sent_offers (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  person_id TEXT,
  property_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  response TEXT NOT NULL DEFAULT 'pending' CHECK (response IN ('pending','interested','not_interested','visited','dismissed')),
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX sent_req ON sent_offers(request_id, property_id);

-- سجل التواصل والملاحظات
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('call','whatsapp','meeting','note','visit','sms','other')),
  body TEXT NOT NULL DEFAULT '',
  person_id TEXT, property_id TEXT, request_id TEXT, deal_id TEXT,
  occurred_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- المهام والمتابعات (الخطوة التالية لأي سجل)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  due_at TEXT,
  due_has_time INTEGER NOT NULL DEFAULT 0,
  person_id TEXT, property_id TEXT, request_id TEXT, deal_id TEXT,
  done_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- المعاينات والمواعيد
CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'viewing' CHECK (kind IN ('viewing','meeting','signing','other')),
  starts_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  place TEXT NOT NULL DEFAULT '',
  person_id TEXT, property_id TEXT, request_id TEXT, deal_id TEXT,
  parties TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled','no_show','postponed')),
  outcome TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  remind_min INTEGER NOT NULL DEFAULT 60,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- الفرص/الصفقات
CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  request_id TEXT, property_id TEXT,
  client_person_id TEXT,      -- المشتري/المستأجر
  owner_person_id TEXT,       -- البائع/المؤجر
  stage TEXT NOT NULL DEFAULT 'interest' CHECK (stage IN ('interest','contacted','viewing','negotiation','won','lost')),
  lost_reason TEXT NOT NULL DEFAULT '',
  agreed_raw TEXT NOT NULL DEFAULT '',
  agreed_amount REAL,
  agreed_currency TEXT NOT NULL DEFAULT 'unknown' CHECK (agreed_currency IN ('MRU','MRO','unknown')),
  closed_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- العمولات: لا تعتبر محصلة إلا بتسجيل دفعات
CREATE TABLE commissions (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  party_person_id TEXT,       -- الطرف المتفق معه
  basis TEXT NOT NULL DEFAULT 'fixed' CHECK (basis IN ('fixed','percent')),
  percent REAL,
  base_amount REAL,           -- أساس الاحتساب
  amount REAL,                -- المستحق
  currency TEXT NOT NULL DEFAULT 'unknown' CHECK (currency IN ('MRU','MRO','unknown')),
  agreement TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  shares TEXT NOT NULL DEFAULT '[]',  -- [{person_id, name, percent, amount}]
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE commission_payments (
  id TEXT PRIMARY KEY,
  commission_id TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- الملفات: صور ووثائق وتسجيلات. كلها خاصة؛ النشر ينسخ نسخة عامة منفصلة.
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('photo','document','audio')),
  owner_type TEXT NOT NULL,   -- property, person, deal, request, capture, inbox
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER, height INTEGER,
  storage_key TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  is_cover INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX files_owner ON files(owner_type, owner_id);

-- الوارد: من الموقع ومن واتساب ومن الالتقاط
CREATE TABLE inbox (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('site','whatsapp','import','capture')),
  kind TEXT NOT NULL CHECK (kind IN ('search','offer','interest','contact','message')),
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_norm TEXT NOT NULL DEFAULT '',
  property_ref TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','converted','spam','closed')),
  converted TEXT NOT NULL DEFAULT '{}',   -- {person_id, request_id, property_id}
  client_token TEXT UNIQUE,
  external_id TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- الالتقاط السريع: النص الأصلي يُحفظ دائماً
CREATE TABLE captures (
  id TEXT PRIMARY KEY,
  raw_text TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'text' CHECK (method IN ('text','dictation','paste','audio')),
  parsed TEXT NOT NULL DEFAULT '{}',
  result TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','saved','discarded')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- العناصر التي أخفاها المستخدم من «اليوم» (لمنع التنبيه المكرر)
CREATE TABLE dismissals (
  id TEXT PRIMARY KEY,
  item_key TEXT NOT NULL UNIQUE,
  until_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- عمليات العميل: كل كتابة تحمل op_id، فإعادة المحاولة لا تكرر التنفيذ
CREATE TABLE client_ops (
  op_id TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- أحداث webhooks الخارجية: منع المعالجة المكررة
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT NOT NULL DEFAULT ''
);

CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
