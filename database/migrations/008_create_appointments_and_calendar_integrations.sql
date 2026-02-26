-- Migration: Create appointments and calendar_integrations tables
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  patient_phone TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'confirmed',
    'canceled',
    'completed',
    'no_show'
  )),
  description TEXT,
  provider TEXT DEFAULT 'google' CHECK (provider IN ('google', 'manual')),
  provider_reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create calendar_integrations table (1 per clinic)
CREATE TABLE IF NOT EXISTS calendar_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google' CHECK (provider = 'google'),
  is_connected BOOLEAN NOT NULL DEFAULT false,
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_calendar_id TEXT DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_conversation_id ON appointments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_phone ON appointments(patient_phone);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_provider_reference_id ON appointments(provider_reference_id);
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_clinic_id ON calendar_integrations(clinic_id);

-- Create RLS (Row Level Security) policies
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;

-- Appointments policies
CREATE POLICY "Users can view appointments from their clinic"
  ON appointments FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert appointments for their clinic"
  ON appointments FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update appointments from their clinic"
  ON appointments FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete appointments from their clinic"
  ON appointments FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Calendar integrations policies
CREATE POLICY "Users can view calendar integrations from their clinic"
  ON calendar_integrations FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert calendar integrations for their clinic"
  ON calendar_integrations FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update calendar integrations from their clinic"
  ON calendar_integrations FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete calendar integrations from their clinic"
  ON calendar_integrations FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_integrations_updated_at
  BEFORE UPDATE ON calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
