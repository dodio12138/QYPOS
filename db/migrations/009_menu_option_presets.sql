CREATE TABLE IF NOT EXISTS menu_option_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('variants', 'modifiers')),
  payload JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_option_presets_kind_idx
  ON menu_option_presets(kind, active, created_at);

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS variant_preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL;
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS modifier_preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL;
