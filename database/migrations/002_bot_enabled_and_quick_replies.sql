-- Migration: Add bot_enabled to conversations and create quick_replies table
-- Run this in your Supabase SQL Editor

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

-- Create trigger to auto-seed quick replies for new clinics
CREATE OR REPLACE FUNCTION auto_seed_quick_replies_for_new_clinic()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_quick_replies(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_seed_quick_replies
AFTER INSERT ON clinics
FOR EACH ROW
EXECUTE FUNCTION auto_seed_quick_replies_for_new_clinic();
