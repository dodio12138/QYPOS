CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT,
  provider_session_id TEXT,
  terminal_id TEXT,
  error_code TEXT,
  error_message TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_attempts_order_idx ON payment_attempts(order_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_provider_payment_idx
  ON payment_attempts(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_attempt_id UUID REFERENCES payment_attempts(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS terminal_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_brand TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_last4 TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS auth_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_attempt_idx
  ON payments(payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_idx
  ON payments(provider, provider_payment_id)
  WHERE provider IS NOT NULL AND provider_payment_id IS NOT NULL;
