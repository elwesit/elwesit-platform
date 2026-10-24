-- المنطقة (الحي) التي يتبعها المخطط، وهل تحقق المستخدم من المقاطعة والمنطقة
-- (المقاطعة المستنتجة من موقع المخطط على الخريطة تبقى غير مؤكدة حتى يؤكدها)
ALTER TABLE plans ADD COLUMN area_id TEXT;
ALTER TABLE plans ADD COLUMN place_verified INTEGER NOT NULL DEFAULT 0;
