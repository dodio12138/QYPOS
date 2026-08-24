ALTER TABLE lottery_campaigns
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS lottery_campaigns_active_idx
  ON lottery_campaigns(status, starts_at, ends_at)
  WHERE deleted_at IS NULL;
