ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS customer_display_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_display_interaction_mode TEXT NOT NULL DEFAULT 'customer_touch',
  ADD COLUMN IF NOT EXISTS customer_display_show_bill_on_checkout BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_display_auto_show_lottery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_display_payment_success_seconds INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS customer_display_lottery_result_seconds INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS customer_display_idle_content JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS lottery_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_name TEXT NOT NULL,
  title_i18n JSONB NOT NULL DEFAULT '{}',
  subtitle_i18n JSONB NOT NULL DEFAULT '{}',
  button_i18n JSONB NOT NULL DEFAULT '{"zh-CN":"开始抽奖","en-GB":"Start draw"}',
  losing_message_i18n JSONB NOT NULL DEFAULT '{"zh-CN":"谢谢参与","en-GB":"Thank you for taking part"}',
  rules_i18n JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'ended')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  minimum_order_total NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (minimum_order_total >= 0),
  service_types JSONB NOT NULL DEFAULT '["dine_in","takeaway"]',
  excluded_payment_methods JSONB NOT NULL DEFAULT '["complimentary"]',
  ticket_valid_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (ticket_valid_minutes BETWEEN 1 AND 43200),
  claim_valid_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (claim_valid_minutes BETWEEN 1 AND 43200),
  theme JSONB NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS lottery_campaigns_status_time_idx
  ON lottery_campaigns(status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS lottery_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES lottery_campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'prize' CHECK (kind IN ('prize', 'no_prize')),
  name_i18n JSONB NOT NULL DEFAULT '{}',
  description_i18n JSONB NOT NULL DEFAULT '{}',
  claim_instructions_i18n JSONB NOT NULL DEFAULT '{}',
  weight_bps INTEGER NOT NULL CHECK (weight_bps > 0 AND weight_bps <= 10000),
  stock_total INTEGER CHECK (stock_total IS NULL OR stock_total >= 0),
  stock_awarded INTEGER NOT NULL DEFAULT 0 CHECK (stock_awarded >= 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  background_color TEXT NOT NULL DEFAULT '#f59e0b',
  text_color TEXT NOT NULL DEFAULT '#241b12',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, position),
  CHECK (stock_total IS NULL OR stock_awarded <= stock_total)
);

CREATE INDEX IF NOT EXISTS lottery_prizes_campaign_idx
  ON lottery_prizes(campaign_id, position);

CREATE TABLE IF NOT EXISTS lottery_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES lottery_campaigns(id),
  order_group_id UUID NOT NULL,
  source_order_id UUID NOT NULL REFERENCES orders(id),
  access_code_hash TEXT NOT NULL UNIQUE,
  access_code_suffix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'used', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (campaign_id, order_group_id)
);

CREATE INDEX IF NOT EXISTS lottery_tickets_campaign_status_idx
  ON lottery_tickets(campaign_id, status, expires_at);

CREATE TABLE IF NOT EXISTS lottery_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES lottery_tickets(id),
  campaign_id UUID NOT NULL REFERENCES lottery_campaigns(id),
  prize_id UUID NOT NULL REFERENCES lottery_prizes(id),
  idempotency_key TEXT NOT NULL,
  prize_snapshot JSONB NOT NULL DEFAULT '{}',
  wheel_snapshot JSONB NOT NULL DEFAULT '{}',
  claim_code_hash TEXT,
  claim_code_suffix TEXT,
  claim_expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS lottery_draws_campaign_created_idx
  ON lottery_draws(campaign_id, created_at DESC);
