-- Migration 048: Exam Scheduling Support
-- Adds schedule_type to appointments and exam-handling toggles to bot_settings

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'consulta'
  CHECK (schedule_type IN ('consulta', 'exame'));

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS bot_handles_exam BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS bot_handles_exam_particular BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_appointments_schedule_type ON appointments(schedule_type);

COMMENT ON COLUMN appointments.schedule_type IS 'Whether this is a consulta or exame';
COMMENT ON COLUMN bot_settings.bot_handles_exam IS 'When true, bot handles exam scheduling automatically. When false, transfers to human.';
COMMENT ON COLUMN bot_settings.bot_handles_exam_particular IS 'When true, bot handles Particular exam scheduling. When false, transfers to human.';
