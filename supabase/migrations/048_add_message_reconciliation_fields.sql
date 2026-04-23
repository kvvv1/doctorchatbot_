ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_external_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciliation_state TEXT NOT NULL DEFAULT 'healthy';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'webhook_reconciled',
  ADD COLUMN IF NOT EXISTS external_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_seen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sent_by_me_seen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS failed_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_client_message_id
  ON messages(client_message_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_external_status
  ON messages(conversation_id, external_status);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_reconciliation_state
  ON conversations(clinic_id, reconciliation_state);
