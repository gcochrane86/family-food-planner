// Today's hour, "Get it out": everything the hour uses, once each with the amounts added up, grouped by where it's
// kept, each with a small cartoon picture (made once per ingredient and reused, like the chopping photos).
import { iconKey } from '../../supabase/functions/_shared/prepCut.ts';
import { formatQty } from './recipes';
import type { RecipeIngredient } from './types';

export type Kept = 'fridge' | 'freezer' | 'cupboard';
export interface GetOutItem { name: string; qty: string; key: string; icon: string | null }
export interface GetOutGroup { where: Kept; items: GetOutItem[] }

// Fresh things whose names would otherwise read as cupboard ones.
const FRIDGE = /spring onion|green bean|runner bean|broad bean|fresh|stir.?fry sauce|pesto|curry paste|garlic paste|ginger paste|stock pot|bell pepper|red pepper|green pepper|yellow pepper|orange pepper|romano pepper|sweet pepper|^peppers?$|mayonnaise|mayo/;
const CUPBOARD = /\boil\b|vinegar|soy|sauce|ketchup|mustard|honey|syrup|sugar|flour|cornflour|cornstarch|salt|black pepper|white pepper|ground pepper|peppercorn|^pepper$|spice|cumin|paprika|turmeric|cinnamon|nutmeg|garam masala|curry powder|chilli flakes|chilli powder|dried|ground|powder|seeds?\b|\bnuts?\b|almond|cashew|peanut|walnut|rice|pasta|spaghetti|penne|noodle|couscous|quinoa|oats|lentil|tin|tinned|canned|chickpea|kidney bean|black bean|baked bean|coconut milk|passata|puree|purée|stock|bouillon|breadcrumb|panko|baking|bicarbonate|cocoa|vanilla|wine|mirin|worcestershire|tortilla|wrap|bread|onion|garlic|potato|shallot|bay lea/;

/** Where something is kept: the freezer if it says frozen, the cupboard for dry goods, tins, bottles and onions,
 *  garlic and potatoes, otherwise the fridge. */
export function keptIn(name: string): Kept {
  const n = name.toLowerCase();
  if (/\bfrozen\b/.test(n)) return 'freezer';
  if (FRIDGE.test(n)) return 'fridge';
  if (CUPBOARD.test(n)) return 'cupboard';
  return 'fridge';
}

const WATER = /^(cold|hot|boiling|warm|tap|ice)?\s*water$|^ice( cube)?$/;

/** Each ingredient once (the same recipe line counted once), amounts in the same unit added up. */
export function getOutList(used: { i: RecipeIngredient; factor: number }[], icons: Record<string, string> = {}): GetOutGroup[] {
  const seen = new Set<RecipeIngredient>();
  const byKey = new Map<string, { name: string; where: Kept; parts: { qty: number | null; unit: string; approx: boolean }[] }>();
  for (const { i, factor } of used) {
    if (seen.has(i)) continue;
    seen.add(i);
    const k = iconKey(i.name);
    if (WATER.test(k.ingredient)) continue;
    const e = byKey.get(k.key) ?? { name: k.ingredient, where: keptIn(i.name), parts: [] };
    e.parts.push({ qty: i.qty === null ? null : i.qty * factor, unit: i.unit, approx: i.qty_approx });
    byKey.set(k.key, e);
  }
  const groups: GetOutGroup[] = (['fridge', 'freezer', 'cupboard'] as const).map((where) => ({ where, items: [] }));
  for (const [key, e] of byKey) {
    const units = new Map<string, { qty: number | null; approx: boolean }>();
    for (const p of e.parts) {
      const u = units.get(p.unit);
      units.set(p.unit, { qty: u ? (u.qty === null || p.qty === null ? (u.qty ?? p.qty) : u.qty + p.qty) : p.qty, approx: (u?.approx ?? false) || p.approx });
    }
    const qty = [...units].map(([unit, u]) => (u.qty === null ? '' : formatQty(u.qty, unit, u.approx))).filter(Boolean).join(' + ');
    groups.find((g) => g.where === e.where)!.items.push({ name: e.name, qty, key, icon: icons[key] ?? null });
  }
  return groups.filter((g) => g.items.length);
}
