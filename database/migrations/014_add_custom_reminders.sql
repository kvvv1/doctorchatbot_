-- Migration: Add custom reminders support
-- Adds dynamic reminder scheduling to notification_settings

-- 1. Add custom_reminders column
ALTER TABLE notification_settings 
ADD COLUMN IF NOT EXISTS custom_reminders JSONB DEFAULT '[]'::jsonb;

-- 2. Add reminder_48h support (it was missing in schema but used in UI)
ALTER TABLE notification_settings 
ADD COLUMN IF NOT EXISTS reminder_48h_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_48h_template TEXT DEFAULT 'Olá {name}! Este é um lembrete de que sua consulta está agendada para daqui a 2 dias ({day}) às {time}. Estamos te esperando!';

-- 3. Update the trigger function to handle dynamic reminders
CREATE OR REPLACE FUNCTION create_appointment_reminders()
RETURNS TRIGGER AS $$
DECLARE
  v_settings notification_settings;
  v_custom_reminder JSONB;
BEGIN
  -- Get notification settings for the clinic
  SELECT * INTO v_settings
  FROM notification_settings
  WHERE clinic_id = NEW.clinic_id;
  
  -- If settings don't exist, use defaults
  IF NOT FOUND THEN
    INSERT INTO notification_settings (clinic_id)
    VALUES (NEW.clinic_id)
    RETURNING * INTO v_settings;
  END IF;
  
  -- A. STANDARD REMINDERS (Fixed Timing)
  
  -- Create 48h reminder
  IF v_settings.reminder_48h_enabled THEN
    INSERT INTO reminders (clinic_id, appointment_id, type, scheduled_for, recipient_phone, message_template)
    VALUES (NEW.clinic_id, NEW.id, 'appointment_48h', NEW.starts_at - INTERVAL '48 hours', NEW.patient_phone, v_settings.reminder_48h_template);
  END IF;

  -- Create 24h reminder
  IF v_settings.reminder_24h_enabled THEN
    INSERT INTO reminders (clinic_id, appointment_id, type, scheduled_for, recipient_phone, message_template)
    VALUES (NEW.clinic_id, NEW.id, 'appointment_24h', NEW.starts_at - INTERVAL '24 hours', NEW.patient_phone, v_settings.reminder_24h_template);
  END IF;
  
  -- Create 2h reminder
  IF v_settings.reminder_2h_enabled THEN
    INSERT INTO reminders (clinic_id, appointment_id, type, scheduled_for, recipient_phone, message_template)
    VALUES (NEW.clinic_id, NEW.id, 'appointment_2h', NEW.starts_at - INTERVAL '2 hours', NEW.patient_phone, v_settings.reminder_2h_template);
  END IF;
  
  -- Create confirmation request (Standard 48h before)
  IF v_settings.confirmation_enabled THEN
    INSERT INTO reminders (clinic_id, appointment_id, type, scheduled_for, recipient_phone, message_template)
    VALUES (NEW.clinic_id, NEW.id, 'confirmation_request', NEW.starts_at - INTERVAL '48 hours', NEW.patient_phone, v_settings.confirmation_template);
  END IF;

  -- B. DYNAMIC CUSTOM REMINDERS
  
  IF v_settings.custom_reminders IS NOT NULL AND jsonb_array_length(v_settings.custom_reminders) > 0 THEN
    FOR v_custom_reminder IN SELECT * FROM jsonb_array_elements(v_settings.custom_reminders)
    LOOP
      IF (v_custom_reminder->>'enabled')::BOOLEAN THEN
        INSERT INTO reminders (
          clinic_id,
          appointment_id,
          type,
          scheduled_for,
          recipient_phone,
          message_template
        )
        VALUES (
          NEW.clinic_id,
          NEW.id,
          'custom_reminder',
          NEW.starts_at - ((v_custom_reminder->>'hours_before')::TEXT || ' hours')::INTERVAL,
          NEW.patient_phone,
          v_custom_reminder->>'template'
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
