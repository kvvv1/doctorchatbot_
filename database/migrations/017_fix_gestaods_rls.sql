-- Migration: Final Definite Fix for Gestaods RLS
-- Using 'user_id' as confirmed by existing project patterns

-- 1. Redefine the function to use user_id
CREATE OR REPLACE FUNCTION public.get_my_clinic_id()
RETURNS uuid AS $$
BEGIN
    RETURN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Clean up ALL previous variations
DROP POLICY IF EXISTS "Manage gestaods_settings" ON gestaods_settings;
DROP POLICY IF EXISTS "Users can view gestaods_settings from their clinic" ON gestaods_settings;
DROP POLICY IF EXISTS "Users can insert gestaods_settings for their clinic" ON gestaods_settings;
DROP POLICY IF EXISTS "Users can update gestaods_settings from their clinic" ON gestaods_settings;

-- 3. Re-create the simplified policy using our improved function
CREATE POLICY "Manage gestaods_settings" ON gestaods_settings
  FOR ALL
  TO authenticated
  USING (clinic_id = get_my_clinic_id())
  WITH CHECK (clinic_id = get_my_clinic_id());

-- 4. Enable RLS
ALTER TABLE gestaods_settings ENABLE ROW LEVEL SECURITY;
