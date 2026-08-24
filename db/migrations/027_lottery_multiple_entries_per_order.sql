ALTER TABLE lottery_tickets
  ADD COLUMN IF NOT EXISTS issuance_index INTEGER;

UPDATE lottery_tickets
SET issuance_index = 1
WHERE issuance_index IS NULL;

ALTER TABLE lottery_tickets
  ALTER COLUMN issuance_index SET NOT NULL;

ALTER TABLE lottery_tickets
  DROP CONSTRAINT IF EXISTS lottery_tickets_campaign_id_order_group_id_key;

ALTER TABLE lottery_tickets
  ADD CONSTRAINT lottery_tickets_campaign_order_issuance_key
  UNIQUE (campaign_id, order_group_id, issuance_index);

CREATE INDEX IF NOT EXISTS lottery_tickets_order_issued_idx
  ON lottery_tickets(source_order_id, status, issued_at DESC);
