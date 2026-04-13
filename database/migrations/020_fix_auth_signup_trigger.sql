-- Repair the auth.users signup trigger so new users can be created reliably.
-- Safe to run in Supabase SQL Editor when signup fails with:
-- "Database error saving new user"

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_clinic_id UUID;
BEGIN
  INSERT INTO public.clinics (name, email)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', NEW.raw_user_meta_data->>'full_name', 'Minha Clínica'),
    NEW.email
  )
  RETURNING id INTO new_clinic_id;

  INSERT INTO public.profiles (id, clinic_id, email, full_name)
  VALUES (
    NEW.id,
    new_clinic_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'clinic_name')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
