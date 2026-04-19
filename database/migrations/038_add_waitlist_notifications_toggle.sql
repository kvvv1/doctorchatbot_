-- Migration 038: Add waitlist notifications toggle to bot_settings
-- Also updates menu_options default to include 'waitlist' key so
-- new clinics get the option pre-populated.

-- 1. Add the toggle column --------------------------------------------------
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS waitlist_notifications_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN bot_settings.waitlist_notifications_enabled IS
  'When false, the bot will NOT automatically notify waitlist patients when a slot is freed by a cancellation or confirmation.';

-- 2. Update menu_options default to include waitlist: false ------------------
--    Only executed when the column already exists (requires migration 026).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bot_settings' AND column_name = 'menu_options'
  ) THEN
    ALTER TABLE bot_settings
      ALTER COLUMN menu_options SET DEFAULT '{
        "schedule": true,
        "view_appointments": true,
        "reschedule": true,
        "cancel": true,
        "attendant": true,
        "waitlist": false
      }'::jsonb;

    COMMENT ON COLUMN bot_settings.menu_options IS
      'JSON object controlling which menu options are visible to patients. Valid keys: schedule, view_appointments, reschedule, cancel, attendant, waitlist';
  END IF;
END $$;
