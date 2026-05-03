-- Migration: Add bot_globally_enabled to bot_settings
-- Controls whether the bot automation is globally on or off for the clinic

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS bot_globally_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN bot_settings.bot_globally_enabled IS 'When false, bot is completely disabled for the clinic (overrides per-conversation bot_enabled)';
