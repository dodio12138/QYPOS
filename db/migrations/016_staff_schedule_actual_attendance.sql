ALTER TABLE staff_schedule_cells
  ADD COLUMN IF NOT EXISTS actual_start_time TIME,
  ADD COLUMN IF NOT EXISTS actual_end_time TIME,
  ADD COLUMN IF NOT EXISTS actual_break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_break_minutes >= 0 AND actual_break_minutes <= 1440),
  ADD COLUMN IF NOT EXISTS actual_note TEXT NOT NULL DEFAULT '';
