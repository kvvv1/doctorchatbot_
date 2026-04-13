-- ============================================================================
-- Migration 023: Add missing columns to appointment_settings
-- buffer_time_minutes, min_advance_booking_hours, max_advance_booking_days
-- were referenced in code but never added to the table in production.
-- Safe to re-run (uses ADD COLUMN IF NOT EXISTS).
-- ============================================================================

ALTER TABLE public.appointment_settings
  ADD COLUMN IF NOT EXISTS buffer_time_minutes       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_advance_booking_hours INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_advance_booking_days  INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS allow_overlap             BOOLEAN NOT NULL DEFAULT false;
