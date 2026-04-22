-- Migration 042: Bot handles Particular appointments toggle
-- When true, the bot schedules Particular appointments automatically
-- instead of transferring to a human attendant. Default: false (transfer to human).

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS bot_handles_particular BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN bot_settings.bot_handles_particular IS
  'When true, the bot schedules Particular appointments automatically. When false (default), the patient is transferred to a human attendant.';
