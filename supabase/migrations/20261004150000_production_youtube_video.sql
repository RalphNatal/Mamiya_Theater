-- ─────────────────────────────────────────────────────────────────────────
-- PRODUCTION VIDEO — optional YouTube link shown on the event page.
--
-- productions.youtube_url holds the link exactly as the admin pasted it (watch,
-- youtu.be, shorts, embed, live). The event page extracts the 11-character video
-- id (src/lib/youtube.ts) and embeds a privacy-enhanced youtube-nocookie player.
-- The CHECK only admits YouTube hosts over https, so nothing else can ever be
-- framed from this column. Written through the existing admin write policy on
-- productions; readable by everyone like the other production columns.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS youtube_url text;

ALTER TABLE public.productions DROP CONSTRAINT IF EXISTS productions_youtube_url_check;
ALTER TABLE public.productions ADD CONSTRAINT productions_youtube_url_check
  CHECK (youtube_url IS NULL
         OR youtube_url ~* '^https://((www|m)\.)?(youtube\.com|youtu\.be)/[^\s]+$');

NOTIFY pgrst, 'reload schema';
