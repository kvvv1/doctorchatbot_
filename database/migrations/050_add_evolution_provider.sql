-- ============================================================================
-- MIGRATION 050: Add Evolution API as a supported WhatsApp provider
-- ============================================================================
--
-- Allows `whatsapp_instances.provider` to hold 'evolution' in addition to 'zapi'.
-- Existing rows are untouched; new Evolution instances use provider = 'evolution'.
--
-- Column semantics for Evolution rows:
--   instance_id  → Evolution instance name (e.g. "cliente1")
--   token        → Evolution API key used in `apikey` header
--   client_token → Optional; used to validate the `apikey` echoed back in webhooks
-- ============================================================================

-- Drop the old CHECK constraint that only permitted 'zapi'
ALTER TABLE whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_provider_check;

-- Re-add the constraint allowing both providers
ALTER TABLE whatsapp_instances
  ADD CONSTRAINT whatsapp_instances_provider_check
  CHECK (provider IN ('zapi', 'evolution'));
