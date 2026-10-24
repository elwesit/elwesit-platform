-- «متاح للبحث العام»: تُنشر قطع المخطط (أرقامها وحدودها فقط، بلا صورة المخطط) إلى public.db
ALTER TABLE plans ADD COLUMN public_search INTEGER NOT NULL DEFAULT 0;
