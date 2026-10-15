import type { Recipe, RecipeDetail } from '../lib/types';

const base: Omit<Recipe, 'id' | 'slug' | 'title'> = {
  household_id: 'h1', subtitle: null, kind: 'meal', component_role: null, source: 'own_doc', base_portions: 6,
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
    { phase: 'prep_8pm', position: 1, at_minute: null, title: 'The bulk sauce', body: 'Chop the **garlic** and reduce.', machine: 'tm7', settings: '12 min · Varoma · speed 2', timer_minutes: 12, image_path: null },
    { phase: 'finish', position: 1, at_minute: 0, title: 'Rice on', body: 'Rinse the **rice** and start.', machine: 'tm7', settings: '20 min · 100°C · speed 4', timer_minutes: 20, image_path: null },
    { phase: 'finish', position: 2, at_minute: 20, title: 'Final toss', body: 'Toss with the warm **sauce**.', machine: null, settings: null, timer_minutes: null, image_path: null },
  ],
};

export const DONER: RecipeDetail = {
  ...base, id: 'r-doner', slug: 'lamb-doner', title: 'Gourmet Lamb Doner', prep_minutes: 15, finish_minutes: 40,
  toddler_ok: false, salt_per_portion_g: 2, equipment: ['tm7', 'hy24', 'meater'],
  ingredients: [{ position: 1, group_name: 'The meat', name: 'lamb mince', qty: 1000, unit: 'g', note: '20% fat', qty_approx: false }],
  steps: [{ phase: 'finish', position: 1, at_minute: 0, title: 'The roast', body: 'Roast the **lamb**.', machine: 'hy24', settings: '180°C · rotisserie · 40 min', timer_minutes: 40, image_path: null }],
};

export const TACOS: Recipe = {
  ...base, id: 'r-tacos', slug: 'aubergine-tacos', title: 'Miso Glazed Aubergine Tacos', source: 'hellofresh',
  base_portions: 3, prep_minutes: 25, finish_minutes: 15, equipment: ['apo', 'hob'], tags: ['Veggie'],
  hero_image_path: 'h1/hero/r-tacos.jpg', hero_image_source: 'generated',
};
