-- Migration 012: Create Working Hours and Time Off Tables
-- Gerencia horários de funcionamento e folgas

-- Tabela de horários de funcionamento
CREATE TABLE IF NOT EXISTS working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    professional_id UUID REFERENCES professionals(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Domingo, 6 = Sábado
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Constraint para garantir que end_time > start_time
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Tabela de folgas e feriados
CREATE TABLE IF NOT EXISTS time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    professional_id UUID REFERENCES professionals(id) ON DELETE CASCADE,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    reason TEXT,
    is_recurring BOOLEAN DEFAULT false, -- Para feriados anuais
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Constraint para garantir que end_date >= start_date
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Tabela de configurações da agenda (buffer time, duração padrão, etc.)
CREATE TABLE IF NOT EXISTS appointment_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE UNIQUE,
    default_duration_minutes INTEGER DEFAULT 30,
    buffer_time_minutes INTEGER DEFAULT 0, -- Tempo entre consultas
    max_advance_booking_days INTEGER DEFAULT 90, -- Máximo de dias para agendar com antecedência
    min_advance_booking_hours INTEGER DEFAULT 2, -- Mínimo de horas de antecedência
    allow_overlap BOOLEAN DEFAULT false,
    business_start_time TIME DEFAULT '08:00:00',
    business_end_time TIME DEFAULT '18:00:00',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_working_hours_clinic ON working_hours(clinic_id);
CREATE INDEX IF NOT EXISTS idx_working_hours_professional ON working_hours(professional_id);
CREATE INDEX IF NOT EXISTS idx_working_hours_day ON working_hours(clinic_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_time_off_clinic ON time_off(clinic_id);
CREATE INDEX IF NOT EXISTS idx_time_off_professional ON time_off(professional_id);
CREATE INDEX IF NOT EXISTS idx_time_off_dates ON time_off(start_date, end_date);

-- RLS Policies

-- Working Hours
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic's working hours"
    ON working_hours FOR SELECT
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert working hours for their clinic"
    ON working_hours FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their clinic's working hours"
    ON working_hours FOR UPDATE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their clinic's working hours"
    ON working_hours FOR DELETE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Time Off
ALTER TABLE time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic's time off"
    ON time_off FOR SELECT
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert time off for their clinic"
    ON time_off FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their clinic's time off"
    ON time_off FOR UPDATE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their clinic's time off"
    ON time_off FOR DELETE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Appointment Settings
ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic's appointment settings"
    ON appointment_settings FOR SELECT
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert appointment settings for their clinic"
    ON appointment_settings FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their clinic's appointment settings"
    ON appointment_settings FOR UPDATE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
    );
