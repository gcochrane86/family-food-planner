// Pure parts of the basket watcher (scripts/basketWatch.ts), kept apart so they can be tested.

/** How long a request Claude already tried waits before another go, so a fill that keeps failing doesn't loop. */
export const RETRY_MS = 10 * 60 * 1000;

/** Whether to start Claude now, and for which waiting requests ("run:<id>" or "fresh:<id>"). */
export function decide({ waiting, running, tried, now }: {
  waiting: string[]; running: boolean; tried: Map<string, number>; now: number;
}): { start: false } | { start: true; ids: string[] } {
  if (running) return { start: false };
  const ids = waiting.filter((id) => { const t = tried.get(id); return t === undefined || now - t >= RETRY_MS; });
  return ids.length ? { start: true, ids } : { start: false };
}

/** The scheduled task's instructions, without its front matter: the same steps the Friday task follows. */
export function fillPrompt(skill: string): string {
  const m = skill.match(/^---\n[\s\S]*?\n---\n/);
  return (m ? skill.slice(m[0].length) : skill).trim();
}

export type Job = 'basket' | 'cookidoo';

/** Which Claude task handles a waiting request: "run:"/"fresh:" are Sainsbury's, "cookidoo:"/"cookidoo-fresh:" Cookidoo. */
export function jobFor(id: string): Job {
  return id.startsWith('cookidoo') ? 'cookidoo' : 'basket';
}

/** Both tasks drive the same Chrome, so one runs at a time: the kind of the first waiting request, with all of its kind. */
export function nextJob(ids: string[]): { job: Job; ids: string[] } {
  const job = jobFor(ids[0]);
  return { job, ids: ids.filter((id) => jobFor(id) === job) };
}
