-- Migration 047: Schedule send-reminders via pg_cron + pg_net
--
-- Replaces Vercel cron job with Supabase-native scheduling.
-- Runs every 10 minutes calling the /api/cron/send-reminders endpoint.
--
-- Prerequisites (already enabled on Supabase):
--   - pg_cron  (supabase_migrations schema)
--   - pg_net   (net schema)
--
-- BEFORE RUNNING: replace <CRON_SECRET> and <APP_URL> with real values.
--   APP_URL  = https://app.doctorchatbot.com.br
--   CRON_SECRET = valor da variável de ambiente CRON_SECRET do projeto

-- Remove job anterior se existir (idempotente)
SELECT cron.unschedule('send-reminders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-reminders'
);

SELECT cron.schedule(
  'send-reminders',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://app.doctorchatbot.com.br/api/cron/send-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer dcb_2026_cron_xyz123abc456def789'
      ),
      body    := '{}'::jsonb
    );
  $$
);
