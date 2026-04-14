-- ============================================================================
-- Migration 022: Create appointment_settings table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointment_settings (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id                UUID NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  default_duration_minutes INTEGER NOT NULL DEFAULT 30,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.appointment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_members_can_read_appointment_settings" ON public.appointment_settings;
CREATE POLICY "clinic_members_can_read_appointment_settings"
  ON public.appointment_settings
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "clinic_members_can_upsert_appointment_settings" ON public.appointment_settings;
CREATE POLICY "clinic_members_can_upsert_appointment_settings"
  ON public.appointment_settings
  FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
    )
  );
