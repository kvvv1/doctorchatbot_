-- Migration: Create conversations and messages tables
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_phone TEXT NOT NULL,
  patient_name TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',
    'in_progress',
    'waiting_patient',
    'scheduled',
    'reschedule',
    'canceled',
    'waitlist',
    'done'
  )),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('patient', 'human', 'bot')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_clinic_id ON conversations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_patient_phone ON conversations(patient_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_patient_name ON conversations(patient_name);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Create RLS (Row Level Security) policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow users to see conversations from their clinic only
CREATE POLICY "Users can view conversations from their clinic"
  ON conversations FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow users to insert conversations for their clinic
CREATE POLICY "Users can insert conversations for their clinic"
  ON conversations FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow users to update conversations from their clinic
CREATE POLICY "Users can update conversations from their clinic"
  ON conversations FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow users to view messages from their clinic's conversations
CREATE POLICY "Users can view messages from their clinic"
  ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE clinic_id IN (
        SELECT clinic_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Allow users to insert messages to their clinic's conversations
CREATE POLICY "Users can insert messages to their clinic"
  ON messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE clinic_id IN (
        SELECT clinic_id FROM profiles WHERE id = auth.uid()
      )
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
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing (optional)
-- Make sure you have a clinic_id from your clinics table
-- Replace 'YOUR_CLINIC_ID' with an actual UUID from your clinics table

/*
INSERT INTO conversations (clinic_id, patient_phone, patient_name, status, last_message_at, last_message_preview)
VALUES
  ('YOUR_CLINIC_ID', '+5511999999999', 'Maria Silva', 'new', NOW(), 'Olá, gostaria de agendar uma consulta'),
  ('YOUR_CLINIC_ID', '+5511888888888', 'João Santos', 'in_progress', NOW() - INTERVAL '10 minutes', 'Pode ser na terça-feira?'),
  ('YOUR_CLINIC_ID', '+5511777777777', 'Ana Costa', 'scheduled', NOW() - INTERVAL '1 hour', 'Confirmado para 15/02 às 14h');

-- Get the conversation IDs for inserting messages
DO $$
DECLARE
  conv1_id UUID;
  conv2_id UUID;
  conv3_id UUID;
BEGIN
  SELECT id INTO conv1_id FROM conversations WHERE patient_name = 'Maria Silva' LIMIT 1;
  SELECT id INTO conv2_id FROM conversations WHERE patient_name = 'João Santos' LIMIT 1;
  SELECT id INTO conv3_id FROM conversations WHERE patient_name = 'Ana Costa' LIMIT 1;

  INSERT INTO messages (conversation_id, sender, content)
  VALUES
    (conv1_id, 'patient', 'Olá, gostaria de agendar uma consulta'),
    (conv1_id, 'bot', 'Olá! Claro, posso te ajudar. Qual especialidade você procura?'),
    (conv2_id, 'patient', 'Bom dia! Preciso remarcar minha consulta'),
    (conv2_id, 'human', 'Bom dia! Claro, quando você prefere?'),
    (conv2_id, 'patient', 'Pode ser na terça-feira?'),
    (conv3_id, 'patient', 'Quero agendar consulta'),
    (conv3_id, 'bot', 'Perfeito! Qual dia você prefere?'),
    (conv3_id, 'patient', 'Quarta-feira, 21/02'),
    (conv3_id, 'human', 'Confirmado para 15/02 às 14h. Até lá!');
END $$;
*/
