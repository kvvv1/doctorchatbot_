-- Migration: Add bot_state and bot_context to conversations table
-- Run this in your Supabase SQL Editor

-- Add bot_state column to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS bot_state TEXT NOT NULL DEFAULT 'menu';

-- Add bot_context column to conversations table (JSONB for flexible context storage)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS bot_context JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Add index on bot_state for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_bot_state ON conversations(bot_state);

-- Add comment explaining the bot_state values
COMMENT ON COLUMN conversations.bot_state IS 'Current state of the bot conversation: menu, agendar_nome, agendar_dia, agendar_hora, reagendar_dia, reagendar_hora, cancelar_confirmar, cancelar_encaixe';

-- Add comment explaining bot_context
COMMENT ON COLUMN conversations.bot_context IS 'Bot conversation context stored as JSON: {name, day, time, intent}';
