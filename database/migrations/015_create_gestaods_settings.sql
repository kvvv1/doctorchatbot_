-- Migration: Create gestaods_settings table
-- Stores API tokens and configuration for GestãoDS integration

CREATE TABLE IF NOT EXISTS gestaods_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  api_token TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_interval INTEGER NOT NULL DEFAULT 30, -- In minutes
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE gestaods_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view gestaods_settings from their clinic"
  ON gestaods_settings FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert gestaods_settings for their clinic"
  ON gestaods_settings FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update gestaods_settings from their clinic"
  ON gestaods_settings FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_gestaods_settings_updated_at
  BEFORE UPDATE ON gestaods_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
