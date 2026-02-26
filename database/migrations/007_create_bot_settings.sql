-- Migration: Create bot_settings table for bot configuration per clinic
-- Run this in your Supabase SQL Editor

-- Create bot_settings table
CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  
  -- Bot behavior flags
  bot_default_enabled BOOLEAN NOT NULL DEFAULT true,
  working_hours_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Working hours configuration
  working_hours JSONB NOT NULL DEFAULT '{
    "timezone": "America/Sao_Paulo",
    "days": [
      {"day": "mon", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "tue", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "wed", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "thu", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "fri", "enabled": true, "start": "08:00", "end": "18:00"},
      {"day": "sat", "enabled": false, "start": "08:00", "end": "12:00"},
      {"day": "sun", "enabled": false, "start": "08:00", "end": "12:00"}
    ]
  }'::jsonb,
  
  -- Bot messages
  message_welcome TEXT NOT NULL DEFAULT 'Olá! 👋 Bem-vindo à nossa clínica. Como posso te ajudar hoje?',
  message_menu TEXT NOT NULL DEFAULT 'Escolha uma das opções abaixo:
1️⃣ Agendar consulta
2️⃣ Remarcar consulta  
3️⃣ Cancelar consulta
4️⃣ Falar com atendente',
  message_out_of_hours TEXT NOT NULL DEFAULT 'No momento estamos fora do horário de atendimento. Nosso horário é de segunda a sexta, das 8h às 18h. Deixe sua mensagem que retornaremos em breve!',
  message_fallback TEXT NOT NULL DEFAULT 'Desculpe, não entendi sua mensagem. Por favor, escolha uma das opções do menu ou digite "menu" para ver as opções novamente.',
  message_confirm_schedule TEXT NOT NULL DEFAULT '✅ Perfeito! Sua consulta foi agendada. Em breve um atendente entrará em contato para confirmar os detalhes.',
  message_confirm_reschedule TEXT NOT NULL DEFAULT '✅ Entendido! Vou encaminhar sua solicitação de remarcação para nossa equipe. Em breve entraremos em contato.',
  message_confirm_cancel TEXT NOT NULL DEFAULT '✅ Sua solicitação de cancelamento foi recebida. Um atendente entrará em contato para confirmar o cancelamento.',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for clinic_id lookups
CREATE INDEX IF NOT EXISTS idx_bot_settings_clinic_id ON bot_settings(clinic_id);

-- Enable RLS
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Multi-tenant by clinic_id

-- Allow users to view bot settings from their clinic
CREATE POLICY "Users can view bot settings from their clinic"
  ON bot_settings FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow users to insert bot settings for their clinic
CREATE POLICY "Users can insert bot settings for their clinic"
  ON bot_settings FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow users to update bot settings from their clinic
CREATE POLICY "Users can update bot settings from their clinic"
  ON bot_settings FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_bot_settings_updated_at ON bot_settings;
CREATE TRIGGER update_bot_settings_updated_at
  BEFORE UPDATE ON bot_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to get or create bot settings for a clinic
CREATE OR REPLACE FUNCTION get_or_create_bot_settings(p_clinic_id UUID)
RETURNS bot_settings AS $$
DECLARE
  v_settings bot_settings;
BEGIN
  -- Try to get existing settings
  SELECT * INTO v_settings
  FROM bot_settings
  WHERE clinic_id = p_clinic_id;
  
  -- If not found, create with defaults
  IF NOT FOUND THEN
    INSERT INTO bot_settings (clinic_id)
    VALUES (p_clinic_id)
    RETURNING * INTO v_settings;
  END IF;
  
  RETURN v_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE bot_settings IS 'Bot configuration settings per clinic';
COMMENT ON COLUMN bot_settings.bot_default_enabled IS 'Whether bot is enabled by default for new conversations';
COMMENT ON COLUMN bot_settings.working_hours_enabled IS 'Whether to enforce working hours restrictions';
COMMENT ON COLUMN bot_settings.working_hours IS 'JSON configuration of working hours per day';
COMMENT ON COLUMN bot_settings.message_welcome IS 'Welcome message when patient first contacts';
COMMENT ON COLUMN bot_settings.message_menu IS 'Menu message showing available options';
COMMENT ON COLUMN bot_settings.message_out_of_hours IS 'Message sent when contact is outside working hours';
COMMENT ON COLUMN bot_settings.message_fallback IS 'Message sent when bot does not understand user input';
COMMENT ON COLUMN bot_settings.message_confirm_schedule IS 'Confirmation message after scheduling request';
COMMENT ON COLUMN bot_settings.message_confirm_reschedule IS 'Confirmation message after rescheduling request';
COMMENT ON COLUMN bot_settings.message_confirm_cancel IS 'Confirmation message after cancellation request';
