// Bits shared by the household's CLIs (cookidoo.ts). Runs on the owner's Mac with the service key from .env.
import { createClient } from '@supabase/supabase-js';
// @ts-expect-error plain JS helper
import { loadEnv } from './env.mjs';

export const [command, ...rest] = process.argv.slice(2);
export const arg = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
export const fail = (msg: string): never => { console.error(msg); process.exit(1); };
export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const env = loadEnv();
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
export const db = createClient(new URL(env.VITE_SUPABASE_URL.trim()).origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) fail(`${what}: ${r.error.message}`);
  return r.data as T;
}

export async function stdin(): Promise<string> {
  if (process.stdin.isTTY) fail('Pipe the JSON in, e.g. npm run -s cookidoo -- record-day --run <id> < day.json');
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

export function read<T>(parser: (text: string) => T, text: string): T {
  try { return parser(text); } catch (e) { return fail((e as Error).message); }
}
