CREATE TABLE IF NOT EXISTS online_order_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_order_id TEXT NOT NULL UNIQUE,
  external_reference TEXT NOT NULL,
  payment_intent_id TEXT,
  payment_status TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  customer_payload JSONB NOT NULL DEFAULT '{}',
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS online_order_inbox_received_idx
  ON online_order_inbox(received_at DESC);
CREATE INDEX IF NOT EXISTS online_order_inbox_status_idx
  ON online_order_inbox(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS online_order_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_order_id UUID NOT NULL REFERENCES online_order_inbox(id) ON DELETE CASCADE,
  source_item_id TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  option_label_en TEXT,
  option_label_zh TEXT,
  quantity INTEGER NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  line_total_minor INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS online_order_inbox_items_order_idx
  ON online_order_inbox_items(inbox_order_id);

CREATE TABLE IF NOT EXISTS online_order_sync_state (
  connector_id TEXT PRIMARY KEY,
  last_cursor TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
