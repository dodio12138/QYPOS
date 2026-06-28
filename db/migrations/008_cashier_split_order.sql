UPDATE roles
SET permissions = CASE
  WHEN permissions ? 'split_order' THEN permissions
  ELSE permissions || '["split_order"]'::jsonb
END
WHERE name IN ('cashier', 'owner');
