ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS customer_display_lottery_invitation_seconds INTEGER NOT NULL DEFAULT 10;

ALTER TABLE settings
  DROP CONSTRAINT IF EXISTS settings_customer_display_lottery_invitation_seconds_check;

UPDATE settings
SET customer_display_lottery_invitation_seconds = 10
WHERE customer_display_lottery_invitation_seconds IS NULL
   OR customer_display_lottery_invitation_seconds < 1
   OR customer_display_lottery_invitation_seconds > 60;

ALTER TABLE settings
  ADD CONSTRAINT settings_customer_display_lottery_invitation_seconds_check
  CHECK (customer_display_lottery_invitation_seconds BETWEEN 1 AND 60);
