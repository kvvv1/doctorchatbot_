-- Migration 029: Add particular_days to bot_settings
-- Stores which weekdays are reserved for Particular appointments.
-- When a patient selects Convênio, these days are excluded from the
-- available day list shown by the bot.
--
-- Values are weekday keys: 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
-- Example: '["mon","wed","fri"]' means Mon/Wed/Fri are Particular-only days.

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS particular_days JSONB;

-- Default: no particular days (all days available to convênio)
UPDATE bot_settings
SET particular_days = '[]'::jsonb
WHERE particular_days IS NULL;

COMMENT ON COLUMN bot_settings.particular_days IS
  'Array of weekday keys (sun/mon/tue/wed/thu/fri/sat) reserved for Particular appointments. '
  'Convênio patients will not see these days in the available date list.';
