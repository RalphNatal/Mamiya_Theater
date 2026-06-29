// SERVICE ROLE KEY — local/admin use only. Never import this file into the app
// or expose the service_role key in any frontend/web bundle.
//
// Provisions (creates or updates) an admin account: sets the email/password
// credentials and ensures public.profiles.role = 'admin'. Credentials are
// shared with the site owner out-of-band (e.g. a password manager or a call) —
// never hardcode them here and never commit them.
//
// Usage:
//   npx tsx scripts/set-admin-password.ts <email> <password> [fullName]
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a local .env file
// (see .env.example). Never commit the real .env file.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2] || process.env.TARGET_EMAIL;
const password = process.argv[3] || process.env.NEW_PASSWORD;
const fullName = process.argv[4] || process.env.TARGET_FULL_NAME || undefined;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (.env).');
  process.exit(1);
}

if (!email || !password) {
  console.error('Usage: npx tsx scripts/set-admin-password.ts <email> <password> [fullName]');
  console.error('(or set TARGET_EMAIL / NEW_PASSWORD / TARGET_FULL_NAME in .env)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(targetEmail: string) {
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find(
      (u) => u.email?.toLowerCase() === targetEmail.toLowerCase(),
    );
    if (match) return match;

    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  const targetEmail = email as string;
  const targetPassword = password as string;

  const existing = await findUserByEmail(targetEmail);
  let userId: string;

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: targetPassword,
      email_confirm: true,
    });
    if (error) {
      console.error('Failed to update existing user:', error.message);
      process.exit(1);
    }
    userId = data.user.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: targetEmail,
      password: targetPassword,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (error) {
      console.error('Failed to create user:', error.message);
      process.exit(1);
    }
    userId = data.user.id;
  }

  // service_role bypasses RLS and is explicitly allowed by
  // trg_prevent_role_self_update, so this direct update is sanctioned.
  const { error: roleError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', userId);

  if (roleError) {
    console.error('User credentials were set, but promoting to admin failed:', roleError.message);
    process.exit(1);
  }

  console.log('Admin account provisioned.');
  console.log('Email:', targetEmail);
  console.log('User id:', userId);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
