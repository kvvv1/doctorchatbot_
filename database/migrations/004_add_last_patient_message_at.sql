-- Migration: Add last_patient_message_at to conversations table for SLA tracking
-- Description: Tracks the timestamp of the last message received from a patient
--              to enable SLA monitoring and highlight conversations requiring attention

-- Add column for tracking last patient message timestamp
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_patient_message_at TIMESTAMPTZ;

-- Create index for efficient SLA queries
CREATE INDEX IF NOT EXISTS idx_conversations_last_patient_message_at 
ON conversations(last_patient_message_at DESC);

-- Update existing conversations with last patient message timestamp
-- (only for messages sent by 'patient')
UPDATE conversations c
SET last_patient_message_at = (
  SELECT MAX(m.created_at)
  FROM messages m
  WHERE m.conversation_id = c.id
    AND m.sender = 'patient'
)
WHERE EXISTS (
  SELECT 1
  FROM messages m
  WHERE m.conversation_id = c.id
    AND m.sender = 'patient'
);

-- Add comment to document the column
COMMENT ON COLUMN conversations.last_patient_message_at IS 
'Timestamp of the most recent message sent by the patient. Used for SLA tracking and highlighting conversations that need attention.';
