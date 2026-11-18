// The household's standard ingredient names: the names already in its recipes and pantry. A new recipe uses them
// wherever it means the same thing (so the shopping list and the cupboard check match it up), with any detail
// ("pitted", "extra virgin") in the ingredient's note. Pure, for the app and the Edge Functions.

/** Words that say how it's sold or got ready, not what it is. */
const SAME_ANYWAY = new Set(['fresh', 'pitted', 'stoned']);

const wordsOf = (name: string) => name.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean)
  .map((w) => (w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

/** What a name is, for matching: case, plurals and "fresh" or "pitted" don't count. */
export function nameKey(name: string): string {
  return wordsOf(name).filter((w) => !SAME_ANYWAY.has(w)).join(' ');
}

/** Each name once, in the spelling used most, alphabetical. */
export function standardNames(names: string[]): string[] {
  const counts = new Map<string, Map<string, number>>();
  for (const n of names.map((x) => x.trim()).filter(Boolean)) {
    const k = nameKey(n);
    const spellings = counts.get(k) ?? new Map<string, number>();
    spellings.set(n, (spellings.get(n) ?? 0) + 1);
    counts.set(k, spellings);
  }
  return [...counts.values()].map((sp) => [...sp].sort((a, b) => b[1] - a[1])[0][0])
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** A recipe's names against the list: `like` are new names that look like a standard one (the same last word), which
 *  the household should see before saving; `fresh` are all names not on the list. `confirmed` are new names the
 *  household said are different. */
export function checkNames(names: string[], standard: string[], confirmed: string[]): { like: { name: string; like: string[] }[]; fresh: string[] } {
  const known = new Set(standard.map(nameKey));
  const ok = new Set(confirmed.map(nameKey));
  const fresh = [...new Set(names.filter((n) => !known.has(nameKey(n))))];
  const like = fresh.filter((n) => !ok.has(nameKey(n))).map((name) => {
    const w = nameKey(name).split(' ');
    const shared = (s: string) => nameKey(s).split(' ').filter((x) => w.includes(x)).length;
    const near = standard.filter((s) => nameKey(s).split(' ').at(-1) === w.at(-1))
      .map((s, i) => ({ s, i, n: shared(s) })).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 3).map((x) => x.s);
    return { name, like: near };
  }).filter((x) => x.like.length);
  return { like, fresh };
}
