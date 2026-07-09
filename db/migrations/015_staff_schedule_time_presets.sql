CREATE TABLE IF NOT EXISTS staff_schedule_time_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL DEFAULT '',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(start_time, end_time)
);

INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order)
VALUES
  ('09:00-14:00', '09:00', '14:00', 1),
  ('11:30-14:00', '11:30', '14:00', 2),
  ('12:00-16:00', '12:00', '16:00', 3),
  ('14:00-20:00', '14:00', '20:00', 4),
  ('14:00-22:30', '14:00', '22:30', 5),
  ('20:30-22:30', '20:30', '22:30', 6)
ON CONFLICT (start_time, end_time) DO NOTHING;
