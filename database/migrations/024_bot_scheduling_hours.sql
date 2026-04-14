-- Migration 024: Separate bot scheduling hours from clinic working hours
--
-- Adds two new concepts to bot_settings:
--   1. bot_respond_anytime  — when true, the bot responds 24/7 (ignores working_hours
--                             for the out-of-hours response check).
--   2. bot_scheduling_hours_enabled / bot_scheduling_hours — independent schedule that
--      controls what slots the bot offers for appointment booking.
--      When disabled, the bot falls back to the clinic's working_hours.

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS bot_respond_anytime BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_scheduling_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_scheduling_hours JSONB NOT NULL DEFAULT '{
    "timezone": "America/Sao_Paulo",
    "days": [
      {"day": "mon", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "tue", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "wed", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "thu", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "fri", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "sat", "enabled": false, "start": "08:00", "end": "12:00"},
      {"day": "sun", "enabled": false, "start": "08:00", "end": "12:00"}
    ]
  }'::jsonb;

COMMENT ON COLUMN bot_settings.bot_respond_anytime IS
  'When true, the bot responds to messages at any hour (ignores working_hours for the out-of-hours check). The bot still offers slots within the configured scheduling hours.';

COMMENT ON COLUMN bot_settings.bot_scheduling_hours_enabled IS
  'When true, the bot uses bot_scheduling_hours instead of working_hours to determine what appointment slots to offer.';

COMMENT ON COLUMN bot_settings.bot_scheduling_hours IS
  'Independent working-hours config used by the bot for slot availability. Same JSON structure as working_hours. Only active when bot_scheduling_hours_enabled = true.';
