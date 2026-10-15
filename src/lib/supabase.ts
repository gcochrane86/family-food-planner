import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from './fetchWithTimeout';
import { projectUrl } from './supabaseUrl';

export class MissingConfigError extends Error {
  constructor() {
    super('The app is missing its Supabase settings (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    this.name = 'MissingConfigError';
  }
}

let client: SupabaseClient | null = null;

/** The shared Supabase client. Throws MissingConfigError when the build has no Supabase settings. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new MissingConfigError();
  client = createClient(projectUrl(url), key, {
    auth: { persistSession: true, flowType: 'pkce' },
    global: { fetch: fetchWithTimeout((...args) => fetch(...args), 10_000) },
  });
  return client;
}
