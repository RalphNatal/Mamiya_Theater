-- ─────────────────────────────────────────────────────────────────────────
-- NEWSLETTER SUBSCRIBERS — emails captured by the footer "Join" form.
--
-- Writes go ONLY through the newsletter-subscribe Edge Function (service role),
-- which lower-cases the address before inserting. The UNIQUE(email) constraint
-- dedupes repeat sign-ups, and the function upserts with ON CONFLICT DO NOTHING
-- so a duplicate is a graceful no-op rather than an error. There is deliberately
-- NO client insert policy; admins may READ the list (a future admin view).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS on, no insert policy (service-role Edge Function bypasses RLS to write).
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- Admin-only read, mirroring the profiles.role = 'admin' pattern used elsewhere
-- (bookings, payments, contact_messages). Non-admins and anon get nothing.
DROP POLICY IF EXISTS "Admins can view subscribers" ON public.subscribers;
CREATE POLICY "Admins can view subscribers"
  ON public.subscribers FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Refresh PostgREST so the new table is exposed immediately.
NOTIFY pgrst, 'reload schema';
