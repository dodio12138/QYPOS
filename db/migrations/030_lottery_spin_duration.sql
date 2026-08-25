ALTER TABLE lottery_campaigns
  ADD COLUMN IF NOT EXISTS spin_duration_seconds INTEGER NOT NULL DEFAULT 10;

ALTER TABLE lottery_campaigns
  DROP CONSTRAINT IF EXISTS lottery_campaigns_spin_duration_seconds_check;

ALTER TABLE lottery_campaigns
  ADD CONSTRAINT lottery_campaigns_spin_duration_seconds_check
  CHECK (spin_duration_seconds BETWEEN 3 AND 30);

UPDATE lottery_campaigns
SET spin_duration_seconds = 10
WHERE spin_duration_seconds IS NULL;
