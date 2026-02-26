-- ============================================================================
-- TODAS AS MIGRATIONS - Doctor Chat Bot
-- Execute este arquivo completo no Supabase SQL Editor
-- ============================================================================
-- 
-- INSTRUÇÕES:
-- 1. Acesse: https://supabase.com/dashboard (faça login)
-- 2. Selecione seu projeto
-- 3. Vá em "SQL Editor" no menu lateral
-- 4. Clique em "New Query"
-- 5. Copie TODO o conteúdo deste arquivo
-- 6. Cole no editor e clique em "Run"
--
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- MIGRATION 001: CREATE CONVERSATIONS AND MESSAGES TABLES
-- ============================================================================

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

-- ============================================================================
-- MIGRATION 002: ADD BOT_ENABLED AND CREATE QUICK_REPLIES TABLE
-- ============================================================================

-- Add bot_enabled column to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT true;

-- Create quick_replies table
CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'geral',
    'agendamento',
    'informacoes',
    'procedimentos',
    'financeiro',
    'outros'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for quick_replies
CREATE INDEX IF NOT EXISTS idx_quick_replies_clinic_id ON quick_replies(clinic_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_category ON quick_replies(category);

-- Create RLS policies for quick_replies
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

-- Allow users to view quick_replies from their clinic
CREATE POLICY "Users can view quick_replies from their clinic"
  ON quick_replies FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow users to insert quick_replies for their clinic
CREATE POLICY "Users can insert quick_replies for their clinic"
  ON quick_replies FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow users to update quick_replies from their clinic
CREATE POLICY "Users can update quick_replies from their clinic"
  ON quick_replies FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow users to delete quick_replies from their clinic
CREATE POLICY "Users can delete quick_replies from their clinic"
  ON quick_replies FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Function to seed default quick replies for a clinic
CREATE OR REPLACE FUNCTION seed_default_quick_replies(target_clinic_id UUID)
RETURNS void AS $$
BEGIN
  -- Check if clinic already has quick replies
  IF NOT EXISTS (SELECT 1 FROM quick_replies WHERE clinic_id = target_clinic_id) THEN
    -- Insert default quick replies
    INSERT INTO quick_replies (clinic_id, title, content, category) VALUES
      (target_clinic_id, 'inicio', 'Olá! Bem-vindo(a) à nossa clínica. Como posso ajudar você hoje?', 'geral'),
      (target_clinic_id, 'horario', 'Nosso horário de atendimento é de segunda a sexta, das 8h às 18h, e aos sábados das 8h às 12h.', 'informacoes'),
      (target_clinic_id, 'agendar', 'Para agendar sua consulta, preciso de algumas informações. Qual seria sua preferência de dia e horário?', 'agendamento'),
      (target_clinic_id, 'confirmar', 'Sua consulta está confirmada para [DATA] às [HORA]. Aguardamos você!', 'agendamento'),
      (target_clinic_id, 'documentos', 'Por favor, traga um documento com foto (RG ou CNH), carteirinha do convênio (se houver) e exames anteriores.', 'informacoes'),
      (target_clinic_id, 'pagamento', 'Aceitamos dinheiro, PIX, cartão de débito e crédito (Visa, Master, Elo). Também trabalhamos com os principais convênios.', 'financeiro'),
      (target_clinic_id, 'localizacao', 'Nossa clínica está localizada em [ENDEREÇO]. Há estacionamento disponível no local.', 'informacoes'),
      (target_clinic_id, 'atendimento', 'Obrigado por aguardar. Já estou disponível para te atender. Como posso ajudar?', 'geral');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Seed quick replies for existing clinics
DO $$
DECLARE
  clinic_record RECORD;
BEGIN
  FOR clinic_record IN SELECT id FROM clinics LOOP
    PERFORM seed_default_quick_replies(clinic_record.id);
  END LOOP;
END $$;

-- ============================================================================
-- MIGRATION 003: ADD NOTES TO CONVERSATIONS
-- ============================================================================

-- Add notes column to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add index for notes (for search)
CREATE INDEX IF NOT EXISTS idx_conversations_notes ON conversations USING gin(to_tsvector('portuguese', notes));

-- ============================================================================
-- MIGRATION 004: ADD LAST_PATIENT_MESSAGE_AT TO CONVERSATIONS
-- ============================================================================

-- Add column for tracking last patient message timestamp
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_patient_message_at TIMESTAMPTZ;

-- Create index for efficient SLA queries
CREATE INDEX IF NOT EXISTS idx_conversations_last_patient_message_at 
ON conversations(last_patient_message_at DESC);

-- Update existing conversations with last patient message timestamp
UPDATE conversations c
SET last_patient_message_at = (
  SELECT MAX(m.created_at)
  FROM messages m
  WHERE m.conversation_id = c.id
    AND m.sender = 'patient'
)
WHERE EXISTS (
  SELECT 1
  FROM messages m
  WHERE m.conversation_id = c.id
    AND m.sender = 'patient'
);

-- Add comment to document the column
COMMENT ON COLUMN conversations.last_patient_message_at IS 
'Timestamp of the most recent message sent by the patient. Used for SLA tracking and highlighting conversations that need attention.';

-- ============================================================================
-- MIGRATION 005: ADD BOT_STATE AND BOT_CONTEXT TO CONVERSATIONS
-- ============================================================================

-- Add bot_state column to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS bot_state TEXT NOT NULL DEFAULT 'menu';

-- Add bot_context column to conversations table (JSONB for flexible context storage)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS bot_context JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Add index on bot_state for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_bot_state ON conversations(bot_state);

-- Add comment explaining the bot_state values
COMMENT ON COLUMN conversations.bot_state IS 'Current state of the bot conversation: menu, agendar_nome, agendar_dia, agendar_hora, reagendar_dia, reagendar_hora, cancelar_confirmar, cancelar_encaixe';

-- Add comment explaining bot_context
COMMENT ON COLUMN conversations.bot_context IS 'Bot conversation context stored as JSON: {name, day, time, intent}';

-- ============================================================================
-- MIGRATION 006: ADD ZAPI_MESSAGE_ID TO MESSAGES
-- ============================================================================

-- Add zapi_message_id column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS zapi_message_id TEXT;

-- Create unique index on zapi_message_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_zapi_message_id 
ON messages(zapi_message_id) 
WHERE zapi_message_id IS NOT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN messages.zapi_message_id IS 'Z-API message ID for deduplication. Ensures we do not process the same webhook twice.';

-- ============================================================================
-- MIGRATION 007: CREATE BOT_SETTINGS TABLE
-- ============================================================================

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

-- ============================================================================
-- MIGRATION 008: CREATE APPOINTMENTS AND CALENDAR_INTEGRATIONS TABLES
-- ============================================================================

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

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calendar_integrations_updated_at ON calendar_integrations;
CREATE TRIGGER update_calendar_integrations_updated_at
  BEFORE UPDATE ON calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 009: CREATE SUBSCRIPTIONS TABLE
-- ============================================================================

-- Create subscriptions table (one per clinic)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN (
    'inactive',
    'active',
    'trialing',
    'past_due',
    'canceled'
  )),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add optional columns to clinics table for quick reference
ALTER TABLE clinics 
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_clinic_id ON subscriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Clinics can only see their own subscription
CREATE POLICY "Users can view their clinic subscription"
  ON subscriptions FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create trigger to update updated_at
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 010: ADD PLAN_KEY TO SUBSCRIPTIONS
-- ============================================================================

-- Add plan_key column to subscriptions table
ALTER TABLE subscriptions 
  ADD COLUMN IF NOT EXISTS plan_key TEXT;

-- Add check constraint to ensure valid plan keys
ALTER TABLE subscriptions
  ADD CONSTRAINT check_plan_key 
  CHECK (plan_key IN ('essencial', 'profissional', 'clinic_pro', 'fundador') OR plan_key IS NULL);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_key ON subscriptions(plan_key);

-- Comment for documentation
COMMENT ON COLUMN subscriptions.plan_key IS 'Plan type: essencial, profissional, clinic_pro, or fundador';

-- ============================================================================
-- MIGRATIONS CONCLUÍDAS
-- ============================================================================
-- Se você chegou até aqui sem erros, todas as migrations foram executadas!
-- Próximos passos:
-- 1. Verificar se todas as tabelas foram criadas
-- 2. Configurar as variáveis de ambiente (.env.local)
-- 3. Testar o sistema
-- ============================================================================
