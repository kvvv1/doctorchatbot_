-- Migration 044: Add unique constraint to prevent duplicate conversations
-- per clinic + phone number pair.
--
-- Step 1: Remove duplicate conversations, keeping only the row with the most
--         recent activity (last_message_at → created_at as fallback).

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

-- Step 2: Add unique constraint.
ALTER TABLE conversations
  ADD CONSTRAINT unique_clinic_phone UNIQUE (clinic_id, patient_phone);
