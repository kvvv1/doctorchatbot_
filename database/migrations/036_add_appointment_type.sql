-- Migration: Add appointment_type column to appointments table
-- This tracks whether an appointment is for particular or insurance (convênio)

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS appointment_type TEXT 
CHECK (appointment_type IN ('particular', 'convenio')) 
DEFAULT 'particular';

CREATE INDEX IF NOT EXISTS idx_appointments_appointment_type ON appointments(appointment_type);
