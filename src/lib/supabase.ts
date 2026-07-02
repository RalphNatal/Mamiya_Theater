import { createClient } from '@supabase/supabase-js';

// TODO: replace with your Supabase project URL and anon/public key
// (Project Settings → API in the Supabase dashboard)
const SUPABASE_URL = 'https://amwzkqlhskicfbuikzpl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_seBteIAFcchpUip_48uVcw_3BcLPIfx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
