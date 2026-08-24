ALTER TABLE lottery_prizes
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT;

UPDATE lottery_prizes
SET fulfillment_type = 'voucher'
WHERE kind = 'prize' AND fulfillment_type IS NULL;

UPDATE lottery_prizes
SET fulfillment_type = NULL
WHERE kind = 'no_prize';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lottery_prizes_fulfillment_type_check'
  ) THEN
    ALTER TABLE lottery_prizes
      ADD CONSTRAINT lottery_prizes_fulfillment_type_check
      CHECK (
        (kind = 'no_prize' AND fulfillment_type IS NULL)
        OR (kind = 'prize' AND fulfillment_type IN ('instant', 'voucher'))
      );
  END IF;
END $$;
