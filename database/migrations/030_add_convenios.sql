-- Migration 030: Add convenios list to bot_settings
-- Stores the insurance plans (convênios) accepted by the clinic.
-- Shown to the patient as an interactive list when they choose Convênio.

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS convenios JSONB;

-- Default: empty list (doctor must configure)
UPDATE bot_settings
SET convenios = '[]'::jsonb
WHERE convenios IS NULL;

COMMENT ON COLUMN bot_settings.convenios IS
  'Array of insurance plan names accepted by the clinic (e.g. ["Unimed","Amil","Bradesco Saúde"]). '
  'Shown as an interactive selection list when patient chooses Convênio.';
