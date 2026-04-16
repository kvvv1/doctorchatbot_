-- Migration 035: Add per-convenio carteirinha request list to bot_settings
-- Replaces the global convenio_solicita_carteirinha boolean with a per-plan array.
-- Each entry in this array is the name of a convenio that requires an insurance card photo.

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS convenios_solicita_carteirinha TEXT[] NOT NULL DEFAULT '{}';
