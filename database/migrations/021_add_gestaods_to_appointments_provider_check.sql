-- Migration 021: adiciona 'gestaods' como valor permitido no CHECK constraint de appointments.provider
-- O constraint original ('google', 'manual') não incluía 'gestaods', causando falha ao sincronizar agendamentos.

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_provider_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_provider_check
  CHECK (provider IN ('google', 'manual', 'gestaods'));
