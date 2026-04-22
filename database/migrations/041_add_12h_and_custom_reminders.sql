-- Migration 041: Add 12h reminder and custom_reminders to notification_settings

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS reminder_12h_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_12h_template TEXT NOT NULL DEFAULT 'Olá {name}! Sua consulta está chegando — é amanhã às {time}. Até logo! 😊',
  ADD COLUMN IF NOT EXISTS reminder_12h_hours_before INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS custom_reminders JSONB NOT NULL DEFAULT '[]'::jsonb;
