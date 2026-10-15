import { readFileSync, existsSync } from 'node:fs';

/** Reads KEY=value lines from .env (no dependency on dotenv). Real environment variables win. */
export function loadEnv(path = '.env') {
  const env = {};
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...process.env };
}
