-- Migration: Add GestãoDS tracking columns
-- Run this in your Supabase SQL Editor

-- Add gestaods_id to appointments to link with GestãoDS appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS gestaods_id TEXT;
CREATE INDEX IF NOT EXISTS idx_appointments_gestaods_id ON appointments(gestaods_id);

-- Add gestaods_id to conversations (patient record) to link with GestãoDS patients
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS gestaods_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cpf TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_gestaods_id ON conversations(gestaods_id);
CREATE INDEX IF NOT EXISTS idx_conversations_cpf ON conversations(cpf);
