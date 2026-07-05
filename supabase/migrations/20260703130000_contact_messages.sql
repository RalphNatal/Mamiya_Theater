-- ─────────────────────────────────────────────────────────────────────────
-- CONTACT MESSAGES — enquiries from the public "Send us a Message" form.
--
-- Writes NEVER come from the browser: the contact-message Edge Function
-- (service role) validates the payload, inserts the row, and emails the venue.
-- There is therefore deliberately NO client insert policy — an anon/authenticated
-- client cannot write here directly. Admins may READ the collected messages
-- (a future admin inbox UI); everyone else is blocked by RLS.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  handled    BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON public.contact_messages (created_at DESC);

-- RLS on, no insert policy (service-role Edge Function bypasses RLS to write).
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Admin-only read, mirroring the profiles.role = 'admin' pattern used elsewhere
-- (bookings, payments). Non-admins and anon get nothing.
DROP POLICY IF EXISTS "Admins can view contact messages" ON public.contact_messages;
CREATE POLICY "Admins can view contact messages"
  ON public.contact_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Refresh PostgREST so the new table is exposed immediately.
NOTIFY pgrst, 'reload schema';
