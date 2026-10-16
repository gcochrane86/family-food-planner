import type { MealSlot, PlanWeek, Recipe, RecipeDetail } from '../lib/types';

const base: Omit<Recipe, 'id' | 'slug' | 'title'> = {
  household_id: 'h1', subtitle: null, kind: 'meal', component_role: null, source: 'own_doc', protein: 'chicken', base_portions: 6,
  reheats_well: true, freezes_well: false, toddler_ok: true, toddler_note: null, salt_per_portion_g: null,
  prep_minutes: 15, finish_minutes: 30, hands_off_minutes: 20, tags: [], equipment: ['tm7', 'hy24'], reheat: null,
  hero_image_path: null, hero_image_source: null, status: 'active',
};

export const HONEY: RecipeDetail = {
  ...base, id: 'r-honey', slug: 'honey-chilli-chicken', title: 'Almond-Crusted Honey Chilli Chicken',
  subtitle: 'with peppers & basmati rice', toddler_note: 'Set aside a toddler portion before the chilli sauce goes on.',
  reheat: 'Reheat the chicken in the HY basket for 4 min at 200°C.',
  ingredients: [
    { position: 1, group_name: 'The meat', name: 'chicken breast or thigh', qty: 1200, unit: 'g', note: '10mm batons', qty_approx: false },
    { position: 2, group_name: 'The carb', name: 'basmati rice', qty: 400, unit: 'g', note: null, qty_approx: false },
  ],
  steps: [
    { id: 's-sauce', phase: 'prep_8pm', position: 1, at_minute: null, title: 'The bulk sauce', body: 'Chop the **garlic** and reduce.', machine: 'tm7', settings: '12 min · Varoma · speed 2', timer_minutes: 12, image_path: null },
    { id: 's-rice', phase: 'finish', position: 1, at_minute: 0, title: 'Rice on', body: 'Rinse the **rice** and start.', machine: 'tm7', settings: '20 min · 100°C · speed 4', timer_minutes: 20, image_path: null },
    { id: 's-toss', phase: 'finish', position: 2, at_minute: 20, title: 'Final toss', body: 'Toss with the warm **sauce**.', machine: null, settings: null, timer_minutes: null, image_path: null },
  ],
};

export const DONER: RecipeDetail = {
  ...base, id: 'r-doner', slug: 'lamb-doner', title: 'Gourmet Lamb Doner', protein: 'red_meat', prep_minutes: 15, finish_minutes: 40,
  toddler_ok: false, salt_per_portion_g: 2, equipment: ['tm7', 'hy24', 'meater'],
  ingredients: [{ position: 1, group_name: 'The meat', name: 'lamb mince', qty: 1000, unit: 'g', note: '20% fat', qty_approx: false }],
  steps: [{ phase: 'finish', position: 1, at_minute: 0, title: 'The roast', body: 'Roast the **lamb**.', machine: 'hy24', settings: '180°C · rotisserie · 40 min', timer_minutes: 40, image_path: null }],
};

export const TACOS: Recipe = {
  ...base, id: 'r-tacos', slug: 'aubergine-tacos', title: 'Miso Glazed Aubergine Tacos', source: 'hellofresh', protein: 'veggie',
  base_portions: 3, prep_minutes: 25, finish_minutes: 15, equipment: ['apo', 'hob'], tags: ['Veggie'],
  hero_image_path: 'h1/hero/r-tacos.jpg', hero_image_source: 'generated',
};

const meal = (id: string, title: string, protein: Recipe['protein'], finish: number): Recipe =>
  ({ ...base, id, slug: id, title, protein, finish_minutes: finish, prep_minutes: 0, reheats_well: false, base_portions: 4 });
export const SALMON = meal('r-salmon', 'Varoma Salmon', 'fish', 20);
export const PENNE = meal('r-penne', 'Creamy Veggie Penne', 'veggie', 25);
export const CHOW = meal('r-chow', 'Chicken Chow Mein', 'chicken', 15);
export const BEEF = meal('r-beef', 'Soy & Ginger Beef', 'red_meat', 20);
export const COD = meal('r-cod', 'Baked Cod', 'fish', 25);
export const CURRY = meal('r-curry', 'Chickpea & Spinach Curry', 'veggie', 25);

const slot = (date: string, kind: MealSlot['slot'], over: Partial<MealSlot> = {}): MealSlot => ({
  id: `${date}-${kind}`, plan_week_id: 'w-next', date, slot: kind, recipe_id: null, mode: 'routine', portions: null, guests: 0,
  locked: false, reason: null, source_date: null, routine_choice: null, cooked_at: null, portions_verdict: null, ...over,
});

/** Next week (from Fri 16 Oct 2026): Monday's honey chilli chicken is cooked for 6 and feeds Tuesday's lunch. */
export const NEXT_WEEK: { week: PlanWeek; slots: MealSlot[] } = {
  week: { id: 'w-next', household_id: 'h1', week_start: '2026-10-19', days: 7, status: 'draft', proposed_at: '2026-10-16T18:00:00Z', approved_at: null },
  slots: [
    slot('2026-10-19', 'breakfast', { reason: 'Overnight oats (made at Sunday 8pm prep)' }),
    slot('2026-10-19', 'lunch', { mode: 'packed', reason: 'Packed lunch' }),
    slot('2026-10-19', 'dinner', { recipe_id: 'r-honey', mode: 'cook', portions: 6, reason: "Cook once, eat twice: extra portions for Tuesday's lunch" }),
    slot('2026-10-20', 'breakfast'),
    slot('2026-10-20', 'lunch', { recipe_id: 'r-honey', mode: 'reheat', source_date: '2026-10-19', reason: 'Leftover Almond-Crusted Honey Chilli Chicken' }),
    slot('2026-10-20', 'dinner', { recipe_id: 'r-salmon', mode: 'cook', portions: 3, reason: 'Fish · 20 min' }),
    slot('2026-10-21', 'breakfast'),
    slot('2026-10-21', 'lunch', { reason: 'Home lunch' }),
    slot('2026-10-21', 'dinner', { recipe_id: 'r-beef', mode: 'cook', portions: 3, reason: 'Red meat · 20 min' }),
    slot('2026-10-22', 'breakfast'),
    slot('2026-10-22', 'lunch', { reason: 'Home lunch' }),
    slot('2026-10-22', 'dinner', { recipe_id: 'r-penne', mode: 'cook', portions: 3, reason: 'Veggie · 25 min' }),
    slot('2026-10-23', 'breakfast'),
    slot('2026-10-23', 'lunch', { reason: 'Home lunch' }),
    slot('2026-10-23', 'dinner', { recipe_id: 'r-chow', mode: 'cook', portions: 3, reason: 'Chicken · 15 min' }),
    slot('2026-10-24', 'breakfast'),
    slot('2026-10-24', 'lunch', { reason: 'Home lunch' }),
    slot('2026-10-24', 'dinner', { recipe_id: 'r-doner', mode: 'cook', portions: 3, reason: 'Red meat: a weekend cook (40 min)' }),
    slot('2026-10-25', 'breakfast'),
    slot('2026-10-25', 'lunch', { reason: 'Home lunch' }),
    slot('2026-10-25', 'dinner', { mode: 'leftovers', reason: 'Use it up: the shop arrives 7–8pm' }),
  ],
};
