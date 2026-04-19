-- Migration 039: Bot handles reschedule/cancel toggle
-- Allows clinics to configure whether the bot handles these flows
-- or immediately transfers to a human attendant.

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS bot_handles_reschedule BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS bot_handles_cancel BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN bot_settings.bot_handles_reschedule IS
  'When false, the bot transfers to a human attendant immediately when patient wants to reschedule.';

COMMENT ON COLUMN bot_settings.bot_handles_cancel IS
  'When false, the bot transfers to a human attendant immediately when patient wants to cancel.';
