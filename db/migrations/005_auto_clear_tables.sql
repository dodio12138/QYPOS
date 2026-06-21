-- 005_auto_clear_tables.sql
-- Optional POS behavior: release a dine-in table immediately after full payment.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS auto_clear_tables_after_payment BOOLEAN NOT NULL DEFAULT false;
