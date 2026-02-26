-- Migration: Create reminders and notifications system
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create reminders table for scheduled notifications
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Reminder details
  type TEXT NOT NULL CHECK (type IN (
    'appointment_24h',
    'appointment_2h',
    'appointment_1h',
    'no_response_alert',
    'follow_up',
    'confirmation_request'
  )),
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'sent',
    'failed',
    'canceled'
  )),
  
  -- Message details
  recipient_phone TEXT NOT NULL,
  message_template TEXT NOT NULL,
  message_sent TEXT,
  
  -- Response tracking
  response_received BOOLEAN DEFAULT false,
  response_at TIMESTAMPTZ,
  response_content TEXT,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create notifications table for in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification details
  type TEXT NOT NULL CHECK (type IN (
    'new_conversation',
    'conversation_waiting',
    'no_response_24h',
    'appointment_confirmed',
    'appointment_canceled',
    'low_response_rate'
  )),
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Links and actions
  link TEXT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  
  -- Status
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create notification_settings table for per-clinic preferences
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  
  -- Reminder settings
  reminder_24h_enabled BOOLEAN DEFAULT true,
  reminder_24h_template TEXT DEFAULT 'Olá {name}! Este é um lembrete de que você tem consulta agendada amanhã às {time}. Por favor, confirme sua presença respondendo SIM.',
  
  reminder_2h_enabled BOOLEAN DEFAULT true,
  reminder_2h_template TEXT DEFAULT 'Olá {name}! Lembrete: sua consulta é daqui a 2 horas ({time}). Chegue com 10 minutos de antecedência.',
  
  reminder_1h_enabled BOOLEAN DEFAULT false,
  reminder_1h_template TEXT DEFAULT 'Olá {name}! Sua consulta é às {time} (em 1 hora). Estamos te esperando!',
  
  -- Confirmation settings
  confirmation_enabled BOOLEAN DEFAULT true,
  confirmation_template TEXT DEFAULT 'Olá {name}! Gostaria de confirmar sua consulta marcada para {date} às {time}? Responda SIM para confirmar ou NÃO para cancelar.',
  confirmation_hours_before INTEGER DEFAULT 48,
  
  -- Alert settings
  no_response_alert_enabled BOOLEAN DEFAULT true,
  no_response_alert_hours INTEGER DEFAULT 2,
  
  -- Follow-up settings
  follow_up_enabled BOOLEAN DEFAULT false,
  follow_up_days_after INTEGER DEFAULT 7,
  follow_up_template TEXT DEFAULT 'Olá {name}! Esperamos que esteja tudo bem após sua consulta. Se precisar de algo ou tiver dúvidas, estamos à disposição!',
  
  -- In-app notifications
  notify_new_conversation BOOLEAN DEFAULT true,
  notify_conversation_waiting BOOLEAN DEFAULT true,
  notify_no_response_24h BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reminders_clinic_id ON reminders(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reminders_appointment_id ON reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminders_conversation_id ON reminders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_for ON reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminders_type ON reminders(type);

CREATE INDEX IF NOT EXISTS idx_notifications_clinic_id ON notifications(clinic_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_conversation_id ON notifications(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_settings_clinic_id ON notification_settings(clinic_id);

-- Enable RLS
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reminders
CREATE POLICY "Users can view reminders from their clinic"
  ON reminders FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert reminders for their clinic"
  ON reminders FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update reminders from their clinic"
  ON reminders FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (
    user_id = auth.uid() OR
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (
    user_id = auth.uid() OR
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for notification_settings
CREATE POLICY "Users can view settings from their clinic"
  ON notification_settings FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert settings for their clinic"
  ON notification_settings FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update settings from their clinic"
  ON notification_settings FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_reminders_updated_at ON reminders;
CREATE TRIGGER update_reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_settings_updated_at ON notification_settings;
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to create reminders when appointment is created
CREATE OR REPLACE FUNCTION create_appointment_reminders()
RETURNS TRIGGER AS $$
DECLARE
  v_settings notification_settings;
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
  
  -- Create 24h reminder
  IF v_settings.reminder_24h_enabled THEN
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
      'appointment_24h',
      NEW.starts_at - INTERVAL '24 hours',
      NEW.patient_phone,
      v_settings.reminder_24h_template
    );
  END IF;
  
  -- Create 2h reminder
  IF v_settings.reminder_2h_enabled THEN
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
      'appointment_2h',
      NEW.starts_at - INTERVAL '2 hours',
      NEW.patient_phone,
      v_settings.reminder_2h_template
    );
  END IF;
  
  -- Create 1h reminder
  IF v_settings.reminder_1h_enabled THEN
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
      'appointment_1h',
      NEW.starts_at - INTERVAL '1 hour',
      NEW.patient_phone,
      v_settings.reminder_1h_template
    );
  END IF;
  
  -- Create confirmation request
  IF v_settings.confirmation_enabled THEN
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
      'confirmation_request',
      NEW.starts_at - (v_settings.confirmation_hours_before || ' hours')::INTERVAL,
      NEW.patient_phone,
      v_settings.confirmation_template
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic reminder creation
DROP TRIGGER IF EXISTS trigger_create_appointment_reminders ON appointments;
CREATE TRIGGER trigger_create_appointment_reminders
  AFTER INSERT ON appointments
  FOR EACH ROW
  WHEN (NEW.status = 'scheduled')
  EXECUTE FUNCTION create_appointment_reminders();

-- Function to cancel reminders when appointment is canceled
CREATE OR REPLACE FUNCTION cancel_appointment_reminders()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('canceled', 'completed') AND OLD.status != NEW.status THEN
    UPDATE reminders
    SET status = 'canceled', updated_at = NOW()
    WHERE appointment_id = NEW.id
      AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic reminder cancellation
DROP TRIGGER IF EXISTS trigger_cancel_appointment_reminders ON appointments;
CREATE TRIGGER trigger_cancel_appointment_reminders
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION cancel_appointment_reminders();

-- Function to get pending reminders (for cron job)
CREATE OR REPLACE FUNCTION get_pending_reminders()
RETURNS TABLE (
  id UUID,
  clinic_id UUID,
  appointment_id UUID,
  conversation_id UUID,
  type TEXT,
  recipient_phone TEXT,
  message_template TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.clinic_id,
    r.appointment_id,
    r.conversation_id,
    r.type,
    r.recipient_phone,
    r.message_template
  FROM reminders r
  WHERE r.status = 'pending'
    AND r.scheduled_for <= NOW()
    AND r.retry_count < 3
  ORDER BY r.scheduled_for ASC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_pending_reminders() TO authenticated;

-- Create view for reminder statistics
CREATE OR REPLACE VIEW reminder_stats AS
SELECT
  clinic_id,
  type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE response_received = true) as confirmed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE response_received = true) / 
    NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0),
    2
  ) as confirmation_rate
FROM reminders
GROUP BY clinic_id, type;

-- Grant access to the view
GRANT SELECT ON reminder_stats TO authenticated;

COMMENT ON TABLE reminders IS 'Scheduled reminders and notifications to be sent via WhatsApp';
COMMENT ON TABLE notifications IS 'In-app notifications for clinic users';
COMMENT ON TABLE notification_settings IS 'Per-clinic notification preferences and templates';
