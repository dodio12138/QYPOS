ALTER TABLE modifier_groups
  ADD COLUMN IF NOT EXISTS preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS modifier_groups_preset_idx
  ON modifier_groups(preset_id)
  WHERE preset_id IS NOT NULL;
