-- Migration 011: Add Multi-Professional Support
-- Cria tabelas para suporte a múltiplos profissionais e recursos

-- Tabela de profissionais
CREATE TABLE IF NOT EXISTS professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    specialty TEXT,
    color TEXT DEFAULT '#0ea5e9', -- Cor padrão (sky-500)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de recursos (salas, equipamentos)
CREATE TABLE IF NOT EXISTS clinic_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('sala', 'equipamento', 'outro')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar campos em appointments para vincular profissionais e recursos
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES clinic_resources(id) ON DELETE SET NULL;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_professionals_clinic_id ON professionals(clinic_id);
CREATE INDEX IF NOT EXISTS idx_professionals_clinic_active ON professionals(clinic_id, is_active);
CREATE INDEX IF NOT EXISTS idx_clinic_resources_clinic_id ON clinic_resources(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_id ON appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_date ON appointments(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_resource_id ON appointments(resource_id);

-- RLS Policies

-- Professionals
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic's professionals"
    ON professionals FOR SELECT
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert professionals for their clinic"
    ON professionals FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their clinic's professionals"
    ON professionals FOR UPDATE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their clinic's professionals"
    ON professionals FOR DELETE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Clinic Resources
ALTER TABLE clinic_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic's resources"
    ON clinic_resources FOR SELECT
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert resources for their clinic"
    ON clinic_resources FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their clinic's resources"
    ON clinic_resources FOR UPDATE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their clinic's resources"
    ON clinic_resources FOR DELETE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );
