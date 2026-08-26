ALTER TABLE lottery_campaigns
  ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'lucky_wheel';

UPDATE lottery_campaigns
SET activity_type = 'lucky_wheel'
WHERE activity_type IS NULL OR activity_type = '';
