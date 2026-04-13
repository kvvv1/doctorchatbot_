-- Migration 019: Bot states, status fix, appointment_settings trigger, integrations
-- Run this in your Supabase SQL Editor

-- ============================================================
-- 1. Fix conversations.status CHECK — add missing 'waiting_human'
-- ============================================================

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

-- ============================================================
-- 2. Update bot_state comment with all current states
-- ============================================================

COMMENT ON COLUMN conversations.bot_state IS
  'Bot FSM state: menu | agendar_nome | agendar_dia | agendar_hora | agendar_slot_escolha | reagendar_qual | reagendar_dia | reagendar_hora | reagendar_slot_escolha | cancelar_qual | cancelar_confirmar | cancelar_encaixe | atendente | ver_agendamentos | confirmar_presenca';

COMMENT ON COLUMN conversations.bot_context IS
  'Rich bot context (JSONB): { patientPhone, patientName, requestedDay, requestedTime, availableSlots, appointmentId, appointments, waitlistId, intent, retryCount }';

-- ============================================================
-- 3. Ensure appointment_settings table exists (from migration 012)
--    and has all columns the bot relies on.
--    Safe to re-run — uses IF NOT EXISTS / IF NOT EXISTS on columns.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE UNIQUE,
  default_duration_minutes INTEGER DEFAULT 30,
  buffer_time_minutes INTEGER DEFAULT 0,
  max_advance_booking_days INTEGER DEFAULT 90,
  min_advance_booking_hours INTEGER DEFAULT 2,
  allow_overlap BOOLEAN DEFAULT false,
  business_start_time TIME DEFAULT '08:00:00',
  business_end_time TIME DEFAULT '18:00:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;

-- RLS (safe to re-run)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointment_settings'
    AND policyname = 'Users can view their clinic appointment settings'
  ) THEN
    CREATE POLICY "Users can view their clinic appointment settings"
      ON appointment_settings FOR SELECT
      USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointment_settings'
    AND policyname = 'Users can insert their clinic appointment settings'
  ) THEN
    CREATE POLICY "Users can insert their clinic appointment settings"
      ON appointment_settings FOR INSERT
      WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointment_settings'
    AND policyname = 'Users can update their clinic appointment settings'
  ) THEN
    CREATE POLICY "Users can update their clinic appointment settings"
      ON appointment_settings FOR UPDATE
      USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Auto-create default settings for every new clinic
CREATE OR REPLACE FUNCTION create_default_appointment_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO appointment_settings (clinic_id)
  VALUES (NEW.id)
  ON CONFLICT (clinic_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_appointment_settings ON clinics;
CREATE TRIGGER trigger_create_appointment_settings
  AFTER INSERT ON clinics
  FOR EACH ROW
  EXECUTE FUNCTION create_default_appointment_settings();

-- Backfill: create default settings for clinics that don't have them yet
INSERT INTO appointment_settings (clinic_id)
SELECT id FROM clinics
WHERE id NOT IN (SELECT clinic_id FROM appointment_settings)
ON CONFLICT (clinic_id) DO NOTHING;

-- ============================================================
-- 4. Expand clinic_integrations to support gestaods (Fase 3 prep)
-- ============================================================

-- Drop the restrictive CHECK that only allows 'google'
ALTER TABLE clinic_integrations
  DROP CONSTRAINT IF EXISTS calendar_integrations_provider_check;

ALTER TABLE clinic_integrations
  ADD CONSTRAINT clinic_integrations_provider_check
  CHECK (provider IN ('google', 'gestaods'));

-- Add GestãoDS specific columns
ALTER TABLE clinic_integrations
  ADD COLUMN IF NOT EXISTS gestaods_api_token TEXT,
  ADD COLUMN IF NOT EXISTS gestaods_is_dev BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Update table comment
COMMENT ON TABLE clinic_integrations IS
  'External integrations per clinic: google (Calendar OAuth) and gestaods (API token)';

-- ============================================================
-- 5. Index for faster bot queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_conversations_bot_enabled
  ON conversations(clinic_id, bot_enabled)
  WHERE bot_enabled = true;

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_phone_status
  ON appointments(clinic_id, patient_phone, status)
  WHERE status IN ('scheduled', 'confirmed');
