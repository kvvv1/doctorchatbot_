-- Migration 025: persist the business origin of appointments
-- This lets the agenda distinguish:
-- - manual records created inside DoctorChatBot
-- - records created by the WhatsApp bot
-- - records imported from external calendars such as GestaoDS

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS origin TEXT;

UPDATE appointments
SET origin = CASE
  WHEN conversation_id IS NOT NULL AND COALESCE(description, '') ILIKE '%via whatsapp%' THEN 'bot_whatsapp'
  WHEN provider = 'manual' THEN 'manual_doctorchat'
  WHEN provider IN ('gestaods', 'google') THEN 'external_import'
  ELSE 'manual_doctorchat'
END
WHERE origin IS NULL;

ALTER TABLE appointments
  ALTER COLUMN origin SET DEFAULT 'manual_doctorchat';

ALTER TABLE appointments
  ALTER COLUMN origin SET NOT NULL;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_origin_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_origin_check
  CHECK (origin IN ('manual_doctorchat', 'bot_whatsapp', 'external_import'));

CREATE INDEX IF NOT EXISTS idx_appointments_origin ON appointments(origin);
