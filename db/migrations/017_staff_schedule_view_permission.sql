UPDATE roles
SET permissions = CASE
  WHEN permissions ? 'view_staff_schedules' THEN permissions
  ELSE permissions || '["view_staff_schedules"]'::jsonb
END
WHERE name IN ('owner', 'cashier');
