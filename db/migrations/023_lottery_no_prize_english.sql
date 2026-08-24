UPDATE lottery_prizes
SET name_i18n = jsonb_set(name_i18n, '{en-GB}', '"Thank you"'::jsonb, true),
    updated_at = now()
WHERE kind = 'no_prize'
  AND name_i18n->>'en-GB' = 'Try again';
