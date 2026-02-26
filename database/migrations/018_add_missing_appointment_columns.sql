-- Migration 018: Add missing columns and fix nullability in appointments table
-- Run this in your Supabase SQL Editor

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS description TEXT;

-- Ensure conversation_id is nullable (it was reported as NOT NULL in some environments)
ALTER TABLE appointments ALTER COLUMN conversation_id DROP NOT NULL;

-- If ends_at is empty for old records, we can set a default (e.g., starts_at + 30 minutes)
UPDATE appointments SET ends_at = starts_at + interval '30 minutes' WHERE ends_at IS NULL;

-- Make ends_at NOT NULL after cleanup
ALTER TABLE appointments ALTER COLUMN ends_at SET NOT NULL;
