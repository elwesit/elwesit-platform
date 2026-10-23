-- fv: رقم النسخة التي تغيّر فيها كل حقل آخر مرة.
-- يسمح بدمج تعديلين من جهازين على حقول مختلفة، ويكشف التضارب عندما يُعدَّل الحقل نفسه.
ALTER TABLE areas ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE people ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE phones ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE properties ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE property_sources ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE geometries ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE requests ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE sent_offers ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE activities ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE appointments ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE deals ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE commissions ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE commission_payments ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE files ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE inbox ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE captures ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE templates ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';
ALTER TABLE dismissals ADD COLUMN fv TEXT NOT NULL DEFAULT '{}';

CREATE INDEX people_upd ON people(updated_at);
CREATE INDEX properties_upd ON properties(updated_at);
CREATE INDEX requests_upd ON requests(updated_at);
CREATE INDEX tasks_due ON tasks(due_at);
CREATE INDEX appt_start ON appointments(starts_at);
