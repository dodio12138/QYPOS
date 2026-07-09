CREATE TABLE IF NOT EXISTS staff_schedule_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#22c55e',
  hourly_wage NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_schedule_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES staff_schedule_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  is_off BOOLEAN NOT NULL DEFAULT false,
  start_time TIME,
  end_time TIME,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 1440),
  note TEXT NOT NULL DEFAULT '',
  actual_start_time TIME,
  actual_end_time TIME,
  actual_break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_break_minutes >= 0 AND actual_break_minutes <= 1440),
  actual_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, work_date),
  CHECK (
    is_off = true
    OR (start_time IS NOT NULL AND end_time IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS staff_schedule_cells_work_date_idx ON staff_schedule_cells(work_date);

UPDATE roles
SET permissions = CASE
  WHEN permissions ? 'view_staff_schedules' THEN permissions
  ELSE permissions || '["view_staff_schedules"]'::jsonb
END
WHERE name IN ('owner', 'cashier');

UPDATE roles
SET permissions = CASE
  WHEN permissions ? 'manage_staff_schedules' THEN permissions
  ELSE permissions || '["manage_staff_schedules"]'::jsonb
END
WHERE name = 'owner';
