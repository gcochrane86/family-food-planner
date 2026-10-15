import { repo } from './repo';

/**
 * A minimal stand-in for supabase-js query builders: every call chains, and awaiting the
 * chain returns the next queued result for that table. Inserts are recorded.
 */
const h = vi.hoisted(() => ({
  results: {} as Record<string, unknown[]>,
  inserts: [] as { table: string; row: unknown }[],
}));
vi.mock('./supabase', () => ({
  getSupabase: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'upsert', 'update', 'delete', 'eq', 'not', 'order', 'limit', 'single', 'maybeSingle']) {
        builder[m] = () => builder;
      }
      builder.insert = (row: unknown) => { h.inserts.push({ table, row }); return builder; };
      builder.then = (resolve: (v: unknown) => void) => resolve(h.results[table]?.shift() ?? { data: null, error: null });
      return builder;
    },
  }),
}));

beforeEach(() => { h.results = {}; h.inserts = []; });

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
