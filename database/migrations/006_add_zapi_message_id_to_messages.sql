-- Migration: Add zapi_message_id to messages table for deduplication
-- Run this in your Supabase SQL Editor

-- Add zapi_message_id column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS zapi_message_id TEXT;

-- Create unique index on zapi_message_id to prevent duplicates
-- Use partial index (WHERE zapi_message_id IS NOT NULL) to allow NULL values
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_zapi_message_id 
ON messages(zapi_message_id) 
WHERE zapi_message_id IS NOT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN messages.zapi_message_id IS 'Z-API message ID for deduplication. Ensures we do not process the same webhook twice.';
