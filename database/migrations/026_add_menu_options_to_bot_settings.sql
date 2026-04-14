-- Migration 026: Add menu_options configuration to bot_settings
-- This allows clinics to customize which menu options are shown to patients

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS menu_options JSONB NOT NULL DEFAULT '{
    "schedule": true,
    "view_appointments": true,
    "reschedule": true,
    "cancel": true,
    "attendant": true
  }'::jsonb;

COMMENT ON COLUMN bot_settings.menu_options IS
  'JSON object controlling which menu options are visible to patients. Valid keys: schedule, view_appointments, reschedule, cancel, attendant';
