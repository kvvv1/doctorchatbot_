-- Migration 033: Add takeover message settings to bot_settings
-- Allows clinics to configure the default message sent when a human takes over a conversation,
-- and toggle whether to send it at all.

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS message_takeover TEXT NOT NULL DEFAULT 'Olá! Sou um atendente da clínica e estou aqui para te ajudar. 😊',
  ADD COLUMN IF NOT EXISTS takeover_message_enabled BOOLEAN NOT NULL DEFAULT true;
