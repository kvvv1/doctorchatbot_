-- Migration: Add notes field to conversations
-- Run this in your Supabase SQL Editor

-- Add notes column to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add index for notes (for search)
CREATE INDEX IF NOT EXISTS idx_conversations_notes ON conversations USING gin(to_tsvector('portuguese', notes));
