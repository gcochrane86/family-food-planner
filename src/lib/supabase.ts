import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class MissingConfigError extends Error {
  constructor() {
    super('The app is missing its Supabase settings (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
}

let client: SupabaseClient | null = null;

/** The shared Supabase client. Throws MissingConfigError when the build has no Supabase settings. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new MissingConfigError();
  client = createClient(url, key, { auth: { persistSession: true, flowType: 'pkce' } });
  return client;
}
