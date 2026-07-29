ALTER TABLE staff_schedule_cells
  ADD COLUMN IF NOT EXISTS actual_is_off BOOLEAN NOT NULL DEFAULT false;
