-- Migration 031: Fix conversations_status_check constraint
-- The constraint may be missing 'waiting_human' if migration 019 was never run.
-- This is idempotent — safe to run multiple times.

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN (
    'new',
    'in_progress',
    'waiting_patient',
    'waiting_human',
    'scheduled',
    'reschedule',
    'canceled',
    'waitlist',
    'done'
  ));
