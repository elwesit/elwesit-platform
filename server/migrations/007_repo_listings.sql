-- بصمة محتوى كل عرض من المستودع، لتطبيق تعديلات المجلد مرة واحدة
CREATE TABLE repo_listings (
  key TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- العروض المنشورة قبل حفظ البصمات (محتواها لم يتغير)
INSERT INTO repo_listings (key, hash, updated_at) VALUES ('iskan1-400-corner', 'c58115e64cbe328e8c94605ad4cec0b4941ef99d7a413060c8a1aa03403fa7ac', '2026-11-01T00:00:00Z');
INSERT INTO repo_listings (key, hash, updated_at) VALUES ('iskan1-520-784', '244ad8d4c009711530f0dcbf82f70192c44f45e33065752023ccb2e2d08782b4', '2026-11-01T00:00:00Z');
