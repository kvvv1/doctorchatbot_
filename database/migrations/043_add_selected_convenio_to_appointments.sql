-- Migration 043: Add selected_convenio column to appointments
-- Stores the insurance plan name selected by the patient during the bot flow.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS selected_convenio TEXT;

COMMENT ON COLUMN appointments.selected_convenio IS
  'Name of the insurance plan selected by the patient (e.g. "Unimed", "Bradesco"). Null for particular appointments.';
