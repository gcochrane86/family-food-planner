import { repo } from './repo';

/**
 * A minimal stand-in for supabase-js query builders: every call chains, and awaiting the
 * chain returns the next queued result for that table. Inserts are recorded.
 */
const h = vi.hoisted(() => ({
  results: {} as Record<string, unknown[]>,
  inserts: [] as { table: string; row: unknown }[],
  uploads: [] as string[],
  updates: [] as unknown[],
  upserts: [] as unknown[],
  rpcs: [] as { fn: string; args: unknown }[],
}));
vi.mock('./supabase', () => ({
  getSupabase: () => ({
    rpc: async (fn: string, args: unknown) => { h.rpcs.push({ fn, args }); return { data: null, error: null }; },
    storage: { from: () => ({ upload: async (path: string) => { h.uploads.push(path); return { error: null }; } }) },
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'upsert', 'update', 'delete', 'eq', 'not', 'order', 'limit', 'single', 'maybeSingle']) {
        builder[m] = () => builder;
      }
      builder.insert = (row: unknown) => { h.inserts.push({ table, row }); return builder; };
      builder.update = (row: unknown) => { h.updates.push(row); return builder; };
      builder.upsert = (rows: unknown) => { h.upserts.push(rows); return builder; };
      builder.then = (resolve: (v: unknown) => void) => resolve(h.results[table]?.shift() ?? { data: null, error: null });
      return builder;
    },
  }),
}));

beforeEach(() => { h.results = {}; h.inserts = []; h.uploads = []; h.updates = []; h.upserts = []; h.rpcs = []; });

test('adding a staple that is already tracked returns the existing one', async () => {
  h.results.ingredients = [{ data: { id: 'i-oil', name: 'Olive oil' }, error: null }];
  h.results.pantry_items = [{ data: { id: 'p-oil', staple_status: 'low' }, error: null }];
  const staple = await repo.addStaple('h1', 'Olive oil');
  expect(staple).toEqual({ id: 'p-oil', ingredient_id: 'i-oil', name: 'Olive oil', status: 'low' });
  expect(h.inserts).toEqual([]);
});

test('adding a new staple creates it as "have"', async () => {
  h.results.ingredients = [{ data: { id: 'i-oats', name: 'Oats' }, error: null }];
  h.results.pantry_items = [{ data: null, error: null }, { data: { id: 'p-oats' }, error: null }];
  const staple = await repo.addStaple('h1', 'Oats');
  expect(staple).toEqual({ id: 'p-oats', ingredient_id: 'i-oats', name: 'Oats', status: 'have' });
  expect(h.inserts).toEqual([{ table: 'pantry_items', row: { household_id: 'h1', ingredient_id: 'i-oats', staple_status: 'have' } }]);
});

test('replacing a step photo saves it under a new name so phones show the new one', async () => {
  const first = await repo.uploadStepPhoto('h1', 's1', new Blob(['a']));
  await new Promise((r) => setTimeout(r, 2));
  const second = await repo.uploadStepPhoto('h1', 's1', new Blob(['b']));
  expect(first).toMatch(/^h1\/steps\/s1-\d+\.jpg$/);
  expect(second).not.toBe(first);
  expect(h.uploads).toEqual([first, second]);
  expect(h.updates).toEqual([{ image_path: first, image_source: 'own' }, { image_path: second, image_source: 'own' }]);
});

test('saving slots never sends which My Week entry Claude made (only the sync writes that)', async () => {
  await repo.saveSlots([{ id: 'x', plan_week_id: 'w', date: '2026-10-21', slot: 'dinner', recipe_id: 'b', mode: 'cook', portions: 3, guests: 0,
    locked: true, reason: null, source_date: null, routine_choice: null, cooked_at: null, portions_verdict: null, cookidoo_recipe_id: null }]);
  const rows = h.upserts[0] as Record<string, unknown>[];
  expect(rows[0]).not.toHaveProperty('cookidoo_recipe_id');
  expect(rows[0]).not.toHaveProperty('id');
  expect(rows[0]).toMatchObject({ recipe_id: 'b' });
});

test('asking Cookidoo to try again requests a sync for that week', async () => {
  await repo.requestCookidooSync('w-next');
  expect(h.rpcs).toEqual([{ fn: 'request_cookidoo_sync', args: { p_week: 'w-next' } }]);
});

test('a roast on a day the week does not plan (Sunday of a 5-day week) adds that dinner', async () => {
  h.results.plan_weeks = [{ data: { id: 'w1', household_id: 'h1', week_start: '2026-10-19', days: 5, status: 'draft' }, error: null }];
  h.results.meal_slots = [{ data: [{ plan_week_id: 'w1', date: '2026-10-19', slot: 'dinner', mode: 'cook', recipe_id: 'r1', portions: 3, guests: 0, locked: false, reason: null, source_date: null }], error: null }];
  await repo.addRoast('h1', '2026-10-25', { main: 'beef', sides: ['roasties'], people: 8, serve: '13:30' }, 'r-brisket');
  expect(h.upserts.at(-1)).toEqual([expect.objectContaining({
    plan_week_id: 'w1', date: '2026-10-25', slot: 'dinner', mode: 'cook', recipe_id: 'r-brisket', portions: 8, locked: true,
    roast: { main: 'beef', sides: ['roasties'], people: 8, serve: '13:30' },
  })]);
});
