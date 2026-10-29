-- إحصاءات الموقع العام: أعداد يومية مجمّعة فقط (لا عنوان IP ولا هوية زائر ولا كعكات).
-- page: home | listing | lots | area | form | other ؛ ref للعرض عند الحاجة ؛ src مصدر الزائر (fb، tt، wa، google…)
CREATE TABLE stat_daily (
  day TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  src TEXT NOT NULL DEFAULT 'direct',
  views INTEGER NOT NULL DEFAULT 0,
  wa INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page, ref, src)
);
CREATE INDEX stat_daily_ref ON stat_daily(ref, day);
