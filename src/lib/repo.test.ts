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
}));
vi.mock('./supabase', () => ({
  getSupabase: () => ({
    storage: { from: () => ({ upload: async (path: string) => { h.uploads.push(path); return { error: null }; } }) },
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'upsert', 'update', 'delete', 'eq', 'not', 'order', 'limit', 'single', 'maybeSingle']) {
        builder[m] = () => builder;
      }
      builder.insert = (row: unknown) => { h.inserts.push({ table, row }); return builder; };
      builder.update = (row: unknown) => { h.updates.push(row); return builder; };
      builder.then = (resolve: (v: unknown) => void) => resolve(h.results[table]?.shift() ?? { data: null, error: null });
      return builder;
    },
  }),
}));

beforeEach(() => { h.results = {}; h.inserts = []; h.uploads = []; h.updates = []; });

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
