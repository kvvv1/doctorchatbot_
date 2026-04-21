-- Migration 040: Add per appointment-type duration to appointment_settings
-- Clinics can now set different durations for "particular" and "convenio" consultations.

ALTER TABLE appointment_settings
  ADD COLUMN IF NOT EXISTS particular_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS convenio_duration_minutes INTEGER;

COMMENT ON COLUMN appointment_settings.particular_duration_minutes IS
  'Duration in minutes for "particular" (private-pay) appointments. Falls back to default_duration_minutes when NULL.';

COMMENT ON COLUMN appointment_settings.convenio_duration_minutes IS
  'Duration in minutes for "convenio" (insurance) appointments. Falls back to default_duration_minutes when NULL.';
