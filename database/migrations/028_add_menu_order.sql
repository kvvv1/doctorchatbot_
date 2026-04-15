-- Migration 028: Add menu_order to bot_settings
-- Stores the display order of menu options as an ordered array of keys.
-- Decoupled from menu_options (enabled/disabled) so reordering never
-- affects feature flags and vice-versa.
--
-- Retrocompat: if menu_order is NULL the engine falls back to the legacy
-- hardcoded order: schedule → view_appointments → reschedule → cancel → attendant

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS menu_order JSONB;

-- Back-fill existing rows with the default order so the UI shows a
-- consistent initial state (avoids null-checks in the UI layer).
UPDATE bot_settings
SET menu_order = '["schedule","view_appointments","reschedule","cancel","attendant"]'::jsonb
WHERE menu_order IS NULL;

COMMENT ON COLUMN bot_settings.menu_order IS
  'Ordered array of menu option keys controlling display order in the bot menu. '
  'When NULL the engine falls back to the default hardcoded order.';
