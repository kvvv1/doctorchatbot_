-- ============================================================================
-- MIGRATION 027: PWA INBOX V1
-- ============================================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_conversations_unread_count
  ON conversations(unread_count);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS failed_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE messages
SET
  message_type = COALESCE(NULLIF(message_type, ''), 'text'),
  delivery_status = CASE
    WHEN sender = 'patient' THEN 'received'
    ELSE 'sent'
  END
WHERE
  message_type IS NULL
  OR message_type = ''
  OR delivery_status IS NULL
  OR delivery_status = '';

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text'));

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_delivery_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IN ('queued', 'sending', 'sent', 'received', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_message_id
  ON messages(client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_delivery_status
  ON messages(delivery_status);

CREATE OR REPLACE FUNCTION increment_conversation_unread(target_conversation_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE conversations
  SET
    unread_count = COALESCE(unread_count, 0) + 1,
    updated_at = NOW()
  WHERE id = target_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reset_conversation_unread(target_conversation_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE conversations
  SET
    unread_count = 0,
    updated_at = NOW()
  WHERE id = target_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_conversation_unread(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_conversation_unread(UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_disabled_at
  ON push_subscriptions(disabled_at);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can view their own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can insert their own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can update their own push subscriptions"
  ON push_subscriptions FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can delete their own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS notifications REPLICA IDENTITY FULL;

COMMENT ON COLUMN conversations.unread_count IS 'Unread inbound patient messages for the conversation';
COMMENT ON COLUMN messages.client_message_id IS 'Client-generated id for idempotent outgoing sends';
COMMENT ON COLUMN messages.message_type IS 'Message type supported by inbox UI. v1 supports text only';
COMMENT ON COLUMN messages.delivery_status IS 'Delivery lifecycle for inbox rendering and retries';
COMMENT ON TABLE push_subscriptions IS 'Browser push subscriptions per authenticated clinic user';
