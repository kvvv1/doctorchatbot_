-- Migration 046: Align notification reminders with the Notifications UI.
--
-- This migration makes the Notifications screen the source of truth for:
--   1. 48h / 24h / 12h / 2h reminders
--   2. automatic reminder rebuild after reschedule
--   3. immediate interactive confirmation tracking
--   4. syncing upcoming appointments when settings change

-- Ensure the reminders table exists (created by migration 010; guard for fresh deployments)
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'canceled')),
  recipient_phone TEXT NOT NULL,
  message_template TEXT NOT NULL,
  message_sent TEXT,
  response_received BOOLEAN DEFAULT false,
  response_at TIMESTAMPTZ,
  response_content TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS zapi_message_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_reminders_zapi_message_id
  ON reminders(zapi_message_id);

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS reminder_48h_hours_before NUMERIC(5,2) NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS reminder_24h_hours_before NUMERIC(5,2) NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS reminder_2h_hours_before NUMERIC(5,2) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS appointment_confirmed_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appointment_confirmed_template TEXT NOT NULL DEFAULT 'Ola {name}! Sua consulta foi agendada para {date} as {time}. Use os botoes abaixo para confirmar ou cancelar, se precisar.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notification_settings'
      AND column_name = 'confirmation_enabled'
  ) THEN
    EXECUTE $sql$
      UPDATE notification_settings
      SET
        appointment_confirmed_enabled = COALESCE(confirmation_enabled, appointment_confirmed_enabled),
        appointment_confirmed_template = COALESCE(NULLIF(confirmation_template, ''), appointment_confirmed_template)
    $sql$;
  END IF;
END$$;

ALTER TABLE reminders
  DROP CONSTRAINT IF EXISTS reminders_type_check;

ALTER TABLE reminders
  ADD CONSTRAINT reminders_type_check CHECK (type IN (
    'appointment_48h',
    'appointment_24h',
    'appointment_12h',
    'appointment_2h',
    'appointment_1h',
    'appointment_created_confirmation',
    'custom_reminder',
    'no_response_alert',
    'follow_up',
    'confirmation_request'
  ));

CREATE OR REPLACE FUNCTION hours_to_interval(hours_value NUMERIC)
RETURNS INTERVAL AS $$
BEGIN
  RETURN make_interval(secs => GREATEST(ROUND(COALESCE(hours_value, 0) * 3600)::INTEGER, 0));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION schedule_appointment_notification_reminders(
  target_appointment_id UUID,
  reset_existing BOOLEAN DEFAULT true
)
RETURNS VOID AS $$
DECLARE
  v_appointment appointments%ROWTYPE;
  v_settings notification_settings%ROWTYPE;
  v_custom_reminder JSONB;
BEGIN
  SELECT *
    INTO v_appointment
  FROM appointments
  WHERE id = target_appointment_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT *
    INTO v_settings
  FROM notification_settings
  WHERE clinic_id = v_appointment.clinic_id;

  IF NOT FOUND THEN
    INSERT INTO notification_settings (clinic_id)
    VALUES (v_appointment.clinic_id)
    RETURNING * INTO v_settings;
  END IF;

  IF reset_existing THEN
    UPDATE reminders
    SET status = 'canceled', updated_at = NOW()
    WHERE appointment_id = target_appointment_id
      AND status IN ('pending', 'failed')
      AND type IN (
        'appointment_48h',
        'appointment_24h',
        'appointment_12h',
        'appointment_2h',
        'custom_reminder',
        'confirmation_request'
      );
  END IF;

  IF v_appointment.status NOT IN ('scheduled', 'confirmed') THEN
    RETURN;
  END IF;

  IF v_settings.reminder_48h_enabled THEN
    INSERT INTO reminders (
      clinic_id,
      appointment_id,
      conversation_id,
      type,
      scheduled_for,
      recipient_phone,
      message_template,
      metadata
    )
    VALUES (
      v_appointment.clinic_id,
      v_appointment.id,
      v_appointment.conversation_id,
      'appointment_48h',
      v_appointment.starts_at - hours_to_interval(v_settings.reminder_48h_hours_before),
      v_appointment.patient_phone,
      v_settings.reminder_48h_template,
      jsonb_build_object('managed', true, 'channel', 'notifications')
    );
  END IF;

  IF v_settings.reminder_24h_enabled THEN
    INSERT INTO reminders (
      clinic_id,
      appointment_id,
      conversation_id,
      type,
      scheduled_for,
      recipient_phone,
      message_template,
      metadata
    )
    VALUES (
      v_appointment.clinic_id,
      v_appointment.id,
      v_appointment.conversation_id,
      'appointment_24h',
      v_appointment.starts_at - hours_to_interval(v_settings.reminder_24h_hours_before),
      v_appointment.patient_phone,
      v_settings.reminder_24h_template,
      jsonb_build_object('managed', true, 'channel', 'notifications')
    );
  END IF;

  IF v_settings.reminder_12h_enabled THEN
    INSERT INTO reminders (
      clinic_id,
      appointment_id,
      conversation_id,
      type,
      scheduled_for,
      recipient_phone,
      message_template,
      metadata
    )
    VALUES (
      v_appointment.clinic_id,
      v_appointment.id,
      v_appointment.conversation_id,
      'appointment_12h',
      v_appointment.starts_at - hours_to_interval(v_settings.reminder_12h_hours_before),
      v_appointment.patient_phone,
      v_settings.reminder_12h_template,
      jsonb_build_object('managed', true, 'channel', 'notifications', 'interactive', true)
    );
  END IF;

  IF v_settings.reminder_2h_enabled THEN
    INSERT INTO reminders (
      clinic_id,
      appointment_id,
      conversation_id,
      type,
      scheduled_for,
      recipient_phone,
      message_template,
      metadata
    )
    VALUES (
      v_appointment.clinic_id,
      v_appointment.id,
      v_appointment.conversation_id,
      'appointment_2h',
      v_appointment.starts_at - hours_to_interval(v_settings.reminder_2h_hours_before),
      v_appointment.patient_phone,
      v_settings.reminder_2h_template,
      jsonb_build_object('managed', true, 'channel', 'notifications')
    );
  END IF;

  IF v_settings.custom_reminders IS NOT NULL AND jsonb_array_length(v_settings.custom_reminders) > 0 THEN
    FOR v_custom_reminder IN
      SELECT *
      FROM jsonb_array_elements(v_settings.custom_reminders)
    LOOP
      IF COALESCE((v_custom_reminder->>'enabled')::BOOLEAN, false) THEN
        INSERT INTO reminders (
          clinic_id,
          appointment_id,
          conversation_id,
          type,
          scheduled_for,
          recipient_phone,
          message_template,
          metadata
        )
        VALUES (
          v_appointment.clinic_id,
          v_appointment.id,
          v_appointment.conversation_id,
          'custom_reminder',
          v_appointment.starts_at - hours_to_interval((v_custom_reminder->>'hours_before')::NUMERIC),
          v_appointment.patient_phone,
          COALESCE(v_custom_reminder->>'template', ''),
          jsonb_build_object(
            'managed', true,
            'channel', 'notifications',
            'label', COALESCE(v_custom_reminder->>'label', 'Lembrete personalizado')
          )
        );
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_appointment_reminders()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM schedule_appointment_notification_reminders(NEW.id, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_appointment_reminders ON appointments;
CREATE TRIGGER trigger_create_appointment_reminders
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION create_appointment_reminders();

CREATE OR REPLACE FUNCTION refresh_appointment_reminders()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('canceled', 'completed', 'no_show') THEN
    UPDATE reminders
    SET status = 'canceled', updated_at = NOW()
    WHERE appointment_id = NEW.id
      AND status IN ('pending', 'failed');

    RETURN NEW;
  END IF;

  IF OLD.starts_at IS DISTINCT FROM NEW.starts_at
    OR OLD.ends_at IS DISTINCT FROM NEW.ends_at
    OR OLD.patient_phone IS DISTINCT FROM NEW.patient_phone
    OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
    OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM schedule_appointment_notification_reminders(NEW.id, true);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cancel_appointment_reminders ON appointments;
DROP TRIGGER IF EXISTS trigger_refresh_appointment_reminders ON appointments;
CREATE TRIGGER trigger_refresh_appointment_reminders
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION refresh_appointment_reminders();

CREATE OR REPLACE FUNCTION refresh_future_appointment_reminders_for_clinic(target_clinic_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_appointment_id UUID;
  v_total INTEGER := 0;
BEGIN
  FOR v_appointment_id IN
    SELECT id
    FROM appointments
    WHERE clinic_id = target_clinic_id
      AND starts_at > NOW()
      AND status IN ('scheduled', 'confirmed')
  LOOP
    PERFORM schedule_appointment_notification_reminders(v_appointment_id, true);
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION refresh_future_appointment_reminders_for_clinic(UUID) TO authenticated;
