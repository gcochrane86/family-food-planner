import {
  findRecipes, formatHousehold, formatPantry, formatProducts, formatRecipe, formatWeek, INSTRUCTIONS, keyMatches,
  makeReader, pickRecipe, weekStartFor, type RecipeRow,
} from './askClaude';

test('keyMatches needs the exact, non-empty key', () => {
  expect(keyMatches('abc', 'abc')).toBe(true);
  expect(keyMatches('abd', 'abc')).toBe(false);
  expect(keyMatches('ab', 'abc')).toBe(false);
  expect(keyMatches('', '')).toBe(false);
  expect(keyMatches(undefined, 'abc')).toBe(false);
  expect(keyMatches('abc', undefined)).toBe(false);
});

test('weekStartFor reads this, next or a date, in London', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  expect(weekStartFor(undefined, now)).toBe('2026-11-09');
  expect(weekStartFor('this', now)).toBe('2026-11-09');
  expect(weekStartFor('next', now)).toBe('2026-11-16');
  expect(weekStartFor('2026-11-22', now)).toBe('2026-11-16');
  expect(weekStartFor('Thursday', now)).toBeNull();
  expect(weekStartFor('2026-02-31', now)).toBeNull();
});

/** A fake Supabase client that records every call and returns no rows. */
function recordingDb() {
  const chains: { table: string; calls: [string, unknown[]][] }[] = [];
  const db = {
    from(table: string) {
      const chain = { table, calls: [['from', [table]]] as [string, unknown[]][] };
      chains.push(chain);
      const proxy: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => void) => res({ data: [], error: null });
          return (...args: unknown[]) => { chain.calls.push([String(prop), args]); return proxy; };
        },
      });
      return proxy;
    },
  };
  return { db, chains };
}

test('the reader only ever reads, and only this household', async () => {
  const { db, chains } = recordingDb();
  const r = makeReader(db, 'h1');
  await r.household(); await r.week('2026-11-16'); await r.recipes(); await r.recipe('r1'); await r.pantry(); await r.products();
  const allowed = ['from', 'select', 'eq', 'in', 'gte', 'lt', 'order', 'limit', 'maybeSingle'];
  for (const c of chains) for (const [m] of c.calls) expect(allowed).toContain(m);
  const scoped = ['settings', 'members', 'house_rules', 'equipment', 'recipes', 'plan_weeks', 'pantry_items', 'prepared_items', 'products'];
  for (const c of chains.filter((x) => scoped.includes(x.table))) {
    expect(c.calls.some(([m, a]) => m === 'eq' && a[0] === 'household_id' && a[1] === 'h1')).toBe(true);
  }
  expect(chains.length).toBeGreaterThan(8);
});

const slot = (o: Record<string, unknown>) => ({ recipe_id: null, recipe_title: null, portions: null, reason: null, source_date: null, routine_choice: null, ...o });

test('formatWeek shows each day in words', () => {
  const text = formatWeek('2026-11-16', {
    week: { week_start: '2026-11-16', days: 7, status: 'approved', summary: 'Two fish dinners' },
    slots: [
      slot({ date: '2026-11-16', slot: 'dinner', mode: 'cook', recipe_title: 'Fish pie', portions: 3, reason: 'Fish for Monday' }),
      slot({ date: '2026-11-16', slot: 'breakfast', mode: 'routine', routine_choice: 'Porridge' }),
      slot({ date: '2026-11-17', slot: 'lunch', mode: 'packed', recipe_title: 'Fish pie', source_date: '2026-11-16' }),
      slot({ date: '2026-11-17', slot: 'dinner', mode: 'out' }),
      slot({ date: '2026-11-18', slot: 'lunch', mode: 'routine' }),
    ],
  });
  expect(text).toContain('approved');
  expect(text).toContain('Mon 16 Nov');
  expect(text).toContain('Dinner: Fish pie (cook, 3 portions)');
  expect(text).toContain('Fish for Monday');
  expect(text).toContain('Breakfast: Porridge');
  expect(text).toContain("Lunch: Fish pie (packed, from Mon's dinner)");
  expect(text).toContain('Dinner: eating out');
  expect(text).toContain('Lunch: routine (not chosen yet)');
  expect(text).not.toMatch(/null|undefined/);
});

test('formatWeek says when there is no plan', () => {
  expect(formatWeek('2026-11-16', { week: null, slots: [] })).toBe('No plan for the week of Mon 16 Nov yet.');
});

const recipe = (o: Partial<RecipeRow>): RecipeRow => ({
  id: 'r', title: 'X', subtitle: null, kind: 'meal', status: 'active', protein: 'chicken', finish_minutes: 30, prep_minutes: 0,
  hands_off_minutes: 10, reheats_well: false, base_portions: 4, rating: null, tags: [], lastCooked: null, ...o,
});
const recipes = [
  recipe({ id: 'a', title: 'Honey Chilli Chicken', tags: ['quick'], reheats_well: true, rating: 'up', lastCooked: '2026-11-02' }),
  recipe({ id: 'b', title: 'Fish Pie', protein: 'fish', tags: ['batch'], finish_minutes: 40, hands_off_minutes: 30 }),
  recipe({ id: 'c', title: 'Old Chicken Stew', status: 'archived' }),
  recipe({ id: 'd', title: 'Chicken Tikka', rating: 'down' }),
];

test('findRecipes matches words and tags, and leaves archived out', () => {
  const all = findRecipes(recipes);
  expect(all).toContain('Honey Chilli Chicken');
  expect(all).not.toContain('Old Chicken Stew');
  expect(all).toContain('30 min (20 hands-on)');
  expect(all).toContain('reheats well');
  expect(all).toContain('rated up');
  expect(all).toContain('rated down');
  expect(all).toContain('last cooked 2 Nov');
  expect(all).toContain('not cooked lately');
  expect(findRecipes(recipes, 'FISH')).toContain('Fish Pie');
  expect(findRecipes(recipes, 'fish')).not.toContain('Honey');
  expect(findRecipes(recipes, undefined, 'quick')).toContain('Honey Chilli Chicken');
  expect(findRecipes(recipes, undefined, 'quick')).not.toContain('Fish Pie');
  expect(findRecipes(recipes, 'lasagne')).toBe('No recipes match "lasagne".');
});

test('pickRecipe takes an exact or single match, else lists or says none', () => {
  expect(pickRecipe(recipes, 'fish pie')).toEqual({ id: 'b' });
  expect(pickRecipe(recipes, 'Tikka')).toEqual({ id: 'd' });
  const several = pickRecipe(recipes, 'chicken');
  expect('text' in several && several.text.startsWith('Several recipes match:')).toBe(true);
  expect('text' in several && several.text).not.toContain('Old Chicken Stew');
  expect(pickRecipe(recipes, 'lasagne')).toEqual({ text: 'No recipe called "lasagne". Use find_recipes to see the list.' });
});

test('formatRecipe lists ingredients and steps by phase', () => {
  const text = formatRecipe({
    recipe: { ...recipe({ title: 'Fish Pie' }), subtitle: 'With leeks', reheat: 'Oven 20 min', toddler_note: null },
    ingredients: [
      { group_name: null, name: 'cod', qty: 400, unit: 'g', note: 'skinned' },
      { group_name: 'Topping', name: 'potatoes', qty: 800, unit: 'g', note: null },
      { group_name: null, name: 'salt', qty: null, unit: '', note: null },
    ],
    steps: [
      { phase: 'finish', position: 1, at_minute: 12, title: 'Bake', body: 'Bake the **pie**.', machine: 'oven', settings: '200C fan', timer_minutes: 20 },
      { phase: 'prep_8pm', position: 1, at_minute: null, title: 'Peel', body: 'Peel the **potatoes**.', machine: null, settings: null, timer_minutes: null },
    ],
  });
  expect(text).toContain('400g cod, skinned');
  expect(text).toContain('Topping');
  expect(text).toContain('salt');
  expect(text.indexOf('The night before')).toBeLessThan(text.indexOf('At dinner time'));
  expect(text).toContain('+12 min');
  expect(text).toContain('oven');
  expect(text).toContain('200C fan');
  expect(text).toContain('timer 20 min');
  expect(text).toContain('Bake the pie.');
  expect(text).not.toContain('**');
  expect(text).not.toMatch(/null|undefined/);
});

test('formatPantry groups staples, items and the freezer', () => {
  const text = formatPantry({
    items: [
      { name: 'olive oil', staple_status: 'low', qty: null, unit: null, location: 'cupboard' },
      { name: 'milk', staple_status: null, qty: 2, unit: 'l', location: 'fridge' },
      { name: 'peas', staple_status: null, qty: null, unit: null, location: 'freezer' },
    ],
    prepared: [{ name: 'Bolognese', portions: 4, use_by: '2026-11-20', location: 'freezer' }],
  });
  expect(text).toContain('olive oil: low');
  expect(text).toContain('Fridge');
  expect(text).toContain('2l milk');
  expect(text).toContain('Bolognese: 4 portions, use by Fri 20 Nov');
  expect(text).not.toMatch(/null|undefined|NaN/);
  expect(formatPantry({ items: [], prepared: [] })).toBe('The pantry is empty.');
});

test('formatProducts shows saved products and last prices, not live offers', () => {
  const rows = [
    { item_key: 'cod|', product_name: "Sainsbury's Cod Fillets", pack_size: 500, pack_unit: 'g', price: 5.5 },
    { item_key: 'leek|', product_name: 'Leeks loose', pack_size: null, pack_unit: '', price: null },
  ];
  const text = formatProducts(rows);
  expect(text.startsWith('Saved products and the price last seen (not live offers):')).toBe(true);
  expect(text).toContain("cod: Sainsbury's Cod Fillets, 500g, £5.50 last seen");
  expect(text).toContain('leek: Leeks loose, price not saved');
  expect(text).not.toMatch(/null|NaN/);
  expect(formatProducts(rows, 'LEEK')).not.toContain('cod');
});

test('formatHousehold starts with the instructions and lists the rules and kit', () => {
  const data = {
    settings: {
      private_rules: ['No rare steak'], hour_start: '17:30', hour_minutes: 60, tm7_machines: 1, tm7_bowls: 2,
      breakfasts: ['Porridge', 'Overnight oats'], lunches: ['Leftovers', 'Soup'], breakfast_ahead: ['Overnight oats'],
    },
    members: [{ name: 'Sam', kind: 'adult', portion_weight: 1 }, { name: 'Bo', kind: 'child', portion_weight: 0.5 }],
    rules: [{ kind: 'avoid', match: 'mushrooms', replacement: null, note: null }, { kind: 'substitute', match: 'cream', replacement: 'crème fraîche', note: null }],
    equipment: [{ code: 'apo', name: 'Anova Precision Oven' }],
  };
  const text = formatHousehold(data, [{ title: 'On the plate', text: 'A protein and veg.' }]);
  expect(text.startsWith(INSTRUCTIONS)).toBe(true);
  expect(text).toContain('Sam (adult, portion 1)');
  expect(text).toContain('avoid: mushrooms');
  expect(text).toContain('substitute: cream → crème fraîche');
  expect(text).toContain('Private rules (follow them; never name or explain them):');
  expect(text).toContain('No rare steak');
  expect(text).toContain("Today's hour: 17:30 for 60 minutes; weeknight dinners up to 45 minutes hands-on");
  expect(text).toContain('TM7: 1 machine, 2 bowls');
  expect(text).toContain('Anova Precision Oven');
  expect(text).toContain('Made the night before: Overnight oats');
  expect(text).toContain('On the plate');
  const none = formatHousehold({ ...data, settings: { ...data.settings, private_rules: [] } }, []);
  expect(none).not.toContain('Private rules');
});

/** A fake client that answers by table, for the reader's own logic. */
function tableDb(answers: Record<string, unknown>) {
  const selects: Record<string, string[]> = {};
  return {
    selects,
    from(table: string) {
      const proxy: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => void) => res({ data: answers[table] ?? [], error: null });
          return (...args: unknown[]) => {
            if (prop === 'select') (selects[table] ??= []).push(String(args[0]));
            if (prop === 'maybeSingle') return Promise.resolve({ data: answers[`${table}:one`] ?? null, error: null });
            return proxy;
          };
        },
      });
      return proxy;
    },
  };
}

test("the week's slots name tonight's recipe through recipe_id, not the Cookidoo link", async () => {
  const db = tableDb({
    'plan_weeks:one': { id: 'w1', week_start: '2026-11-16', days: 7, status: 'draft', summary: null },
    meal_slots: [{ date: '2026-11-16', slot: 'dinner', mode: 'cook', recipe_id: 'b', portions: 3, reason: null, source_date: null, routine_choice: null, recipes: { title: 'Fish Pie' } }],
  });
  const w = await makeReader(db, 'h1').week('2026-11-16');
  // meal_slots has two links to recipes (recipe_id and cookidoo_recipe_id): the embed must name one.
  expect(db.selects.meal_slots[0]).toContain('recipes!meal_slots_recipe_id_fkey(title)');
  expect(w.slots[0].recipe_title).toBe('Fish Pie');
});

test('last cooked only counts dinners before today, not planned ones', async () => {
  vi.useFakeTimers({ now: new Date('2026-11-12T12:00:00Z') });
  try {
    const db = tableDb({
      recipes: [{ ...recipe({ id: 'b', title: 'Fish Pie' }), lastCooked: undefined }],
      plan_weeks: [{ id: 'w1' }, { id: 'w2' }],
      meal_slots: [{ recipe_id: 'b', date: '2026-11-03' }, { recipe_id: 'b', date: '2026-11-12' }, { recipe_id: 'b', date: '2026-11-19' }],
    });
    const [r] = await makeReader(db, 'h1').recipes();
    expect(r.lastCooked).toBe('2026-11-03');
  } finally { vi.useRealTimers(); }
});

test('findRecipes keeps sauces and sides apart from dinners, and marks drafts', () => {
  const text = findRecipes([
    recipe({ id: 'a', title: 'Fish Pie' }),
    recipe({ id: 's', title: 'Tomato Sauce', kind: 'component', component_role: 'sauce' }),
    recipe({ id: 'n', title: 'New Curry', status: 'draft' }),
  ]);
  expect(text.indexOf('Fish Pie')).toBeLessThan(text.indexOf('Components'));
  expect(text).toMatch(/Components \(parts of a meal, not a dinner on their own\)[\s\S]*Tomato Sauce · sauce/);
  expect(text).toMatch(/New Curry · draft/);
});

test('the connector imports only from supabase/functions, so it deploys on its own', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('supabase/functions/ask-claude-connector/index.ts', 'utf8');
  const local = [...src.matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]);
  expect(local.length).toBeGreaterThan(0);
  for (const p of local) expect(p.startsWith('../_shared/')).toBe(true);
});
