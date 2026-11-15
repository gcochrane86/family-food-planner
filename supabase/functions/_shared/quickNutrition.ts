// A quick snack's nutrition (one portion), worked out from its items with a small table of common snack foods; null
// when an item or unit isn't known, so Claude estimates it instead (get_plan_context nutritionMissing). Rough figures
// for spotting patterns, like every estimate here.
import type { Nutrition } from './balance.ts';

// Per 100g: kcal, protein, fat, saturated fat, carbs, sugars, fibre, salt.
type Food = { per: [number, number, number, number, number, number, number, number]; each?: number; fruit?: number; veg?: number; fat?: boolean; legumes?: boolean };
const FOODS: Record<string, Food> = {
  apple: { per: [52, 0.3, 0.2, 0, 13.8, 10.4, 2.4, 0], each: 182, fruit: 182 },
  banana: { per: [89, 1.1, 0.3, 0.1, 22.8, 12.2, 2.6, 0], each: 118, fruit: 118 },
  pear: { per: [57, 0.4, 0.1, 0, 15, 9.8, 3.1, 0], each: 178, fruit: 178 },
  satsuma: { per: [47, 0.9, 0.2, 0, 12, 9.2, 1.7, 0], each: 74, fruit: 160 },
  clementine: { per: [47, 0.9, 0.2, 0, 12, 9.2, 1.7, 0], each: 74, fruit: 160 },
  orange: { per: [47, 0.9, 0.1, 0, 11.8, 9.4, 2.4, 0], each: 130, fruit: 130 },
  raspberr: { per: [52, 1.2, 0.7, 0, 11.9, 4.4, 6.5, 0], fruit: 80 },
  strawberr: { per: [32, 0.7, 0.3, 0, 7.7, 4.9, 2, 0], each: 12, fruit: 80 },
  blueberr: { per: [57, 0.7, 0.3, 0, 14.5, 10, 2.4, 0], fruit: 80 },
  berries: { per: [45, 1, 0.4, 0, 10, 6, 4, 0], fruit: 80 },
  grape: { per: [69, 0.7, 0.2, 0.1, 18, 15.5, 0.9, 0], each: 5, fruit: 80 },
  date: { per: [282, 2.5, 0.4, 0, 75, 63, 8, 0], each: 7, fruit: 30 },
  almond: { per: [579, 21.2, 49.9, 3.8, 9.1, 4.4, 12.5, 0], each: 1.2, fat: true },
  walnut: { per: [654, 15.2, 65.2, 6.1, 7, 2.6, 6.7, 0], each: 4, fat: true },
  cashew: { per: [553, 18.2, 43.9, 7.8, 30, 5.9, 3.3, 0], each: 1.5, fat: true },
  hazelnut: { per: [628, 15, 61, 4.5, 7, 4.3, 9.7, 0], each: 1.4, fat: true },
  pistachio: { per: [560, 20, 45, 5.9, 18, 7.7, 10.6, 0], each: 0.7, fat: true },
  'mixed nuts': { per: [607, 20, 54, 7, 13, 4, 7, 0], fat: true },
  nuts: { per: [607, 20, 54, 7, 13, 4, 7, 0], fat: true },
  'peanut butter': { per: [588, 25, 50, 10, 13, 9, 6, 1], fat: true },
  'almond butter': { per: [614, 21, 56, 4.2, 9, 4, 10, 0], fat: true },
  'pumpkin seed': { per: [559, 30, 49, 8.7, 11, 1.4, 6, 0], fat: true },
  seeds: { per: [560, 25, 47, 5, 12, 1.5, 8, 0], fat: true },
  chia: { per: [486, 16.5, 30.7, 3.3, 7.7, 0, 34.4, 0], fat: true },
  yoghurt: { per: [97, 9, 5, 3.4, 4, 4, 0, 0.1] },
  yogurt: { per: [97, 9, 5, 3.4, 4, 4, 0, 0.1] },
  'cottage cheese': { per: [98, 11, 4.3, 1.7, 3.4, 2.7, 0, 0.8] },
  cheddar: { per: [416, 25, 34.9, 21.7, 0.1, 0.1, 0, 1.8] },
  cheese: { per: [416, 25, 34.9, 21.7, 0.1, 0.1, 0, 1.8] },
  egg: { per: [143, 12.6, 9.5, 3.1, 0.7, 0.4, 0, 0.36], each: 52 },
  hummus: { per: [166, 7.9, 9.6, 1.4, 10, 0.3, 6, 1.2], fat: true, legumes: true },
  houmous: { per: [166, 7.9, 9.6, 1.4, 10, 0.3, 6, 1.2], fat: true, legumes: true },
  edamame: { per: [121, 11.9, 5.2, 0.6, 8.9, 2.2, 5.2, 0], legumes: true, veg: 80 },
  carrot: { per: [41, 0.9, 0.2, 0, 7.6, 4.7, 2.8, 0.2], each: 61, veg: 80 },
  cucumber: { per: [15, 0.7, 0.1, 0, 3.6, 1.7, 0.5, 0], veg: 80 },
  pepper: { per: [31, 1, 0.3, 0, 6, 4.2, 2.1, 0], each: 160, veg: 80 },
  celery: { per: [14, 0.7, 0.2, 0, 3, 1.3, 1.6, 0.2], each: 40, veg: 80 },
  tomato: { per: [18, 0.9, 0.2, 0, 3.9, 2.6, 1.2, 0], each: 15, veg: 80 },
  avocado: { per: [160, 2, 14.7, 2.1, 8.5, 0.7, 6.7, 0], each: 150, fat: true },
  olive: { per: [115, 0.8, 10.7, 1.4, 6, 0, 3.2, 2.2], each: 4, fat: true },
  oatcake: { per: [450, 10, 19, 4, 57, 2.5, 8, 1.3], each: 10 },
  'rice cake': { per: [387, 8, 3, 0.6, 82, 0.5, 4, 0.1], each: 9 },
  'dark chocolate': { per: [598, 7.8, 42.6, 24.5, 46, 24, 10.9, 0] },
  oats: { per: [389, 16.9, 6.9, 1.2, 66, 1, 10.6, 0] },
  milk: { per: [64, 3.4, 3.6, 2.3, 4.7, 4.7, 0, 0.1] },
  honey: { per: [304, 0.3, 0, 0, 82, 82, 0.2, 0] },
};
const KEYS = Object.keys(FOODS).sort((a, b) => b.length - a.length);
const SPOON: Record<string, number> = { tbsp: 15, tablespoon: 15, tsp: 5, teaspoon: 5, handful: 30 };
const EACH = ['', 'each', 'whole', 'small', 'medium', 'large', 'piece', 'pieces', 'x'];

/** The food a name means, by the longest table word in it ("greek yoghurt" → yoghurt). */
export function quickFood(name: string): string | null {
  const n = name.trim().toLowerCase();
  return KEYS.find((k) => n.includes(k)) ?? null;
}

const grams = (f: Food, qty: number, unit: string): number | null => {
  const u = unit.trim().toLowerCase().replace(/s$/, '');
  if (u === 'g' || u === 'ml') return qty;
  if (u === 'kg' || u === 'l') return qty * 1000;
  if (SPOON[u]) return qty * SPOON[u];
  if (EACH.includes(u) || EACH.includes(unit.trim().toLowerCase())) return f.each ? qty * f.each : null;
  return null;
};

export function quickNutrition(items: { name: string; qty: number | null; unit: string }[]): Nutrition | null {
  if (!items.length) return null;
  const t = { kcal: 0, protein_g: 0, fat_g: 0, sat_fat_g: 0, carbs_g: 0, sugars_g: 0, fibre_g: 0, salt_g: 0, fruit: 0, veg: 0 };
  let fat = false, legumes = false;
  for (const it of items) {
    const key = quickFood(it.name);
    if (!key || it.qty == null || !(it.qty > 0)) return null;
    const f = FOODS[key];
    const g = grams(f, it.qty, it.unit ?? '');
    if (g == null) return null;
    const [kcal, p, fa, sat, c, s, fi, salt] = f.per.map((v) => (v * g) / 100);
    t.kcal += kcal; t.protein_g += p; t.fat_g += fa; t.sat_fat_g += sat; t.carbs_g += c; t.sugars_g += s; t.fibre_g += fi; t.salt_g += salt;
    if (f.fruit) t.fruit += g / f.fruit;
    if (f.veg) t.veg += g / f.veg;
    fat ||= !!f.fat; legumes ||= !!f.legumes;
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    protein_g: r1(t.protein_g), fibre_g: r1(t.fibre_g), veg_portions: r1(t.veg), fruit_portions: r1(t.fruit),
    healthy_fat: fat, oily_fish: false, legumes, red_meat: false, processed_meat: false,
    kcal: Math.round(t.kcal), fat_g: r1(t.fat_g), sat_fat_g: r1(t.sat_fat_g), carbs_g: r1(t.carbs_g), sugars_g: r1(t.sugars_g), salt_g: Math.round(t.salt_g * 100) / 100,
  };
}
