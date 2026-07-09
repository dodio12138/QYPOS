ALTER TABLE staff_schedule_employees
  ADD COLUMN IF NOT EXISTS hourly_wage NUMERIC(10,2) NOT NULL DEFAULT 0;
