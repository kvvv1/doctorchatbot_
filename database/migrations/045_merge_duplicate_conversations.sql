-- Migration 045: Merge duplicate conversations safely.
--
-- For each (clinic_id, patient_phone) group with duplicates:
--   1. Keep the row with the most recent activity (the "winner")
--   2. Re-assign all messages from the duplicate rows to the winner
--   3. Delete the duplicate rows
--   4. Ensure the unique constraint from 044 exists (idempotent)

-- Step 1: Move all messages from duplicate conversations to the winner.
UPDATE messages
SET conversation_id = winner.id
FROM (
  SELECT DISTINCT ON (clinic_id, patient_phone) id, clinic_id, patient_phone
  FROM conversations
  ORDER BY
    clinic_id,
    patient_phone,
    last_message_at DESC NULLS LAST,
    created_at DESC
) AS winner
JOIN conversations dup
  ON dup.clinic_id = winner.clinic_id
  AND dup.patient_phone = winner.patient_phone
  AND dup.id <> winner.id
WHERE messages.conversation_id = dup.id;

-- Step 2: Delete the duplicate (loser) conversations.
DELETE FROM conversations
WHERE id NOT IN (
  SELECT DISTINCT ON (clinic_id, patient_phone) id
  FROM conversations
  ORDER BY
    clinic_id,
    patient_phone,
    last_message_at DESC NULLS LAST,
    created_at DESC
);

-- Step 3: Add unique constraint (skip if already exists from migration 044).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_clinic_phone'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT unique_clinic_phone UNIQUE (clinic_id, patient_phone);
  END IF;
END$$;
