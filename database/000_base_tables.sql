-- ============================================================================
-- TABELAS BASE - Doctor Chat Bot
-- Execute ANTES das migrations se as tabelas clinics/profiles não existirem
-- ============================================================================
-- 
-- QUANDO USAR:
-- Se você receber erro "relation clinics does not exist" ao executar
-- as migrations, execute este arquivo PRIMEIRO.
--
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABELA: CLINICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  
  -- Z-API Integration
  zapi_instance_id TEXT,
  zapi_token TEXT,
  zapi_client_token TEXT,
  
  -- Plan and Subscription (populated by migration 009)
  plan TEXT DEFAULT 'starter',
  subscription_status TEXT DEFAULT 'inactive',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_clinics_email ON clinics(email);
CREATE INDEX IF NOT EXISTS idx_clinics_zapi_instance_id ON clinics(zapi_instance_id);

-- Enable RLS
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their clinic"
  ON clinics FOR SELECT
  USING (
    id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their clinic"
  ON clinics FOR UPDATE
  USING (
    id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_clinics_updated_at ON clinics;
CREATE TRIGGER update_clinics_updated_at
  BEFORE UPDATE ON clinics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABELA: PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'doctor', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON profiles(clinic_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can view profiles from their clinic"
  ON profiles FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNÇÃO: AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_clinic_id UUID;
BEGIN
  -- Create a new clinic for the user if they don't have one
  INSERT INTO clinics (name, email)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Clínica'),
    NEW.email
  )
  RETURNING id INTO new_clinic_id;
  
  -- Create profile for the new user
  INSERT INTO profiles (id, clinic_id, email, full_name)
  VALUES (
    NEW.id,
    new_clinic_id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- DADOS DE EXEMPLO (OPCIONAL - APENAS PARA TESTES)
-- ============================================================================
-- Descomente as linhas abaixo se quiser criar dados de teste

/*
-- Criar uma clínica de teste
INSERT INTO clinics (name, email, phone, address, city, state)
VALUES (
  'Clínica Exemplo',
  'contato@clinicaexemplo.com',
  '+55 11 99999-9999',
  'Rua Exemplo, 123',
  'São Paulo',
  'SP'
)
ON CONFLICT DO NOTHING;
*/

-- ============================================================================
-- FIM
-- ============================================================================
-- Agora você pode executar o arquivo all-migrations.sql
-- ============================================================================
