-- 006_kitchen_print_style.sql
-- Kitchen ticket item text size and bold controls.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS kitchen_item_font_size INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS kitchen_item_bold BOOLEAN NOT NULL DEFAULT true;
