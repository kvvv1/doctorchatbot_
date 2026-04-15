-- Migration 032: Add profile_picture_url to conversations
-- Stores the WhatsApp profile picture URL for each patient conversation

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
