-- Migration 034: Add convenio_solicita_carteirinha flag to bot_settings
-- When enabled, the bot will ask the patient to send a photo of their health insurance card
-- (carteirinha) after selecting a convenio plan, then transfer to human attendance for review.

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS convenio_solicita_carteirinha BOOLEAN NOT NULL DEFAULT false;
