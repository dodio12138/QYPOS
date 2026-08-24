ALTER TABLE lottery_draws
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id);

ALTER TABLE lottery_draws
  ADD CONSTRAINT lottery_draws_redeemed_or_voided_check
  CHECK (redeemed_at IS NULL OR voided_at IS NULL);
