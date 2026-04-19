-- Migration 037: Add waitlist preference fields to conversations
-- Allows patients to specify preferred time window when entering the waitlist.
-- The cron job will match available slots against these preferences.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS waitlist_preferred_time_start TEXT,   -- e.g. "08"  (hour, 24h)
  ADD COLUMN IF NOT EXISTS waitlist_preferred_time_end   TEXT,   -- e.g. "12"  (hour, 24h)
  ADD COLUMN IF NOT EXISTS waitlist_appointment_type     TEXT,   -- 'particular' | 'convenio' (optional filter)
  ADD COLUMN IF NOT EXISTS waitlist_expires_at           TIMESTAMPTZ; -- auto-set to now + 30 days

-- Index to speed up the cron query
CREATE INDEX IF NOT EXISTS idx_conversations_waitlist
  ON conversations (status, clinic_id, waitlist_expires_at)
  WHERE status = 'waitlist';

-- Comments
COMMENT ON COLUMN conversations.waitlist_preferred_time_start IS 'Preferred window start hour (24h string, e.g. "08"). NULL = any time.';
COMMENT ON COLUMN conversations.waitlist_preferred_time_end   IS 'Preferred window end hour (24h string, e.g. "12"). NULL = any time.';
COMMENT ON COLUMN conversations.waitlist_appointment_type     IS 'Type of appointment the patient wants. NULL = any.';
COMMENT ON COLUMN conversations.waitlist_expires_at           IS 'Waitlist entry expires after 30 days. Cron skips expired entries.';
