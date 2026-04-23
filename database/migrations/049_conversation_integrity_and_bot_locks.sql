-- Migration 049: Normalize patient phones, merge duplicate conversations fully,
-- and add short-lived locks to prevent duplicate bot replies.

CREATE OR REPLACE FUNCTION normalize_phone_for_storage(phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := regexp_replace(COALESCE(phone, ''), '\D', '', 'g');

  IF digits = '' THEN
    RETURN NULL;
  END IF;

  IF digits ~ '^55\d{10,11}$' THEN
    RETURN digits;
  END IF;

  IF digits ~ '^\d{10,11}$' THEN
    RETURN '55' || digits;
  END IF;

  RETURN digits;
END;
$$;

UPDATE conversations
SET patient_phone = normalize_phone_for_storage(patient_phone)
WHERE patient_phone IS DISTINCT FROM normalize_phone_for_storage(patient_phone)
  AND normalize_phone_for_storage(patient_phone) IS NOT NULL;

UPDATE appointments
SET patient_phone = normalize_phone_for_storage(patient_phone)
WHERE patient_phone IS DISTINCT FROM normalize_phone_for_storage(patient_phone)
  AND normalize_phone_for_storage(patient_phone) IS NOT NULL;

UPDATE reminders
SET recipient_phone = normalize_phone_for_storage(recipient_phone)
WHERE recipient_phone IS DISTINCT FROM normalize_phone_for_storage(recipient_phone)
  AND normalize_phone_for_storage(recipient_phone) IS NOT NULL;

WITH ranked_conversations AS (
  SELECT
    id,
    clinic_id,
    patient_phone,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, patient_phone
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS row_num,
    FIRST_VALUE(id) OVER (
      PARTITION BY clinic_id, patient_phone
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS winner_id
  FROM conversations
),
duplicates AS (
  SELECT id AS loser_id, winner_id
  FROM ranked_conversations
  WHERE row_num > 1
)
UPDATE messages AS target
SET conversation_id = duplicates.winner_id
FROM duplicates
WHERE target.conversation_id = duplicates.loser_id;

WITH ranked_conversations AS (
  SELECT
    id,
    clinic_id,
    patient_phone,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, patient_phone
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS row_num,
    FIRST_VALUE(id) OVER (
      PARTITION BY clinic_id, patient_phone
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS winner_id
  FROM conversations
),
duplicates AS (
  SELECT id AS loser_id, winner_id
  FROM ranked_conversations
  WHERE row_num > 1
)
UPDATE appointments AS target
SET conversation_id = duplicates.winner_id
FROM duplicates
WHERE target.conversation_id = duplicates.loser_id;

WITH ranked_conversations AS (
  SELECT
    id,
    clinic_id,
    patient_phone,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, patient_phone
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS row_num,
    FIRST_VALUE(id) OVER (
      PARTITION BY clinic_id, patient_phone
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS winner_id
  FROM conversations
),
duplicates AS (
  SELECT id AS loser_id, winner_id
  FROM ranked_conversations
  WHERE row_num > 1
)
UPDATE reminders AS target
SET conversation_id = duplicates.winner_id
FROM duplicates
WHERE target.conversation_id = duplicates.loser_id;

WITH ranked_conversations AS (
  SELECT
    id,
    clinic_id,
    patient_phone,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, patient_phone
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS row_num,
    FIRST_VALUE(id) OVER (
      PARTITION BY clinic_id, patient_phone
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS winner_id
  FROM conversations
),
duplicates AS (
  SELECT id AS loser_id, winner_id
  FROM ranked_conversations
  WHERE row_num > 1
)
UPDATE notifications AS target
SET conversation_id = duplicates.winner_id
FROM duplicates
WHERE target.conversation_id = duplicates.loser_id;

DELETE FROM conversations
WHERE id IN (
  WITH ranked_conversations AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY clinic_id, patient_phone
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
      ) AS row_num
    FROM conversations
  )
  SELECT id
  FROM ranked_conversations
  WHERE row_num > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_clinic_phone'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT unique_clinic_phone UNIQUE (clinic_id, patient_phone);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS bot_processing_locks (
  conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  locked_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_processing_locks_locked_until
  ON bot_processing_locks(locked_until);
