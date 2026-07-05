-- ─────────────────────────────────────────────────────────────────────────
-- SCHEDULE THE 24h SHOWTIME REMINDERS (pg_cron → pg_net → Edge Function)
--
-- The reminder SEND needs HTTP (Resend, whose key lives only in the edge layer),
-- but pg_cron runs SQL — so the hourly job uses pg_net (net.http_post) to invoke
-- the send-showtime-reminders Edge Function, which does the exactly-once claim
-- (bookings.reminded_at CAS) and the sends. This keeps Resend server-side and
-- the API key out of the database (invariant #5), mirroring how the abandoned-
-- reservation sweep is scheduled (20260702170000).
--
-- ── PREREQUISITES (do these ONCE, in the SQL editor / dashboard) ────────────
--   1. Deploy the function:  supabase functions deploy send-showtime-reminders
--   2. pg_net must be enabled — this migration runs CREATE EXTENSION for it.
--   3. Store two Vault secrets so the schedule can authenticate WITHOUT baking
--      the service-role key into source control (the function requires the
--      service-role key as its bearer):
--
--        select vault.create_secret(
--          'https://<PROJECT_REF>.supabase.co', 'project_url');
--        select vault.create_secret(
--          '<SERVICE_ROLE_KEY>', 'service_role_key');
--
--      (Supabase Vault is enabled by default. Re-run create_secret only if the
--      names don't already exist.)
--
-- Until the secrets exist the job will run but log an error each hour (the URL
-- resolves NULL) — harmless, and it starts working the moment they're set.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Extensions (idempotent). pg_cron was already enabled by 20260702170000;
--    repeated here so this migration stands alone. pg_net provides net.http_post.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule hourly — idempotently. cron.unschedule(text) THROWS when the job
--    doesn't exist, so guard it: only unschedule when our stable name is already
--    present. Re-running this migration then never accumulates duplicates.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-showtime-reminders') THEN
    PERFORM cron.unschedule('send-showtime-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'send-showtime-reminders',                -- stable job name (see guard above)
  '0 * * * *',                              -- top of every hour
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/send-showtime-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- The function rejects any caller whose bearer isn't the service-role key.
      'Authorization', 'Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
