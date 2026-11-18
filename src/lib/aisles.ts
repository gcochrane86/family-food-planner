// Tidying the shopping list (16 Nov 2026): tap water is never bought, the same thing in different units or names
// (milk in ml and tbsp, the whole-milk basic) is one line, and the list runs in the order you walk the shop.
import { words } from './recipes';

/** The order you walk the shop: fresh, meat and nuts; cheese, pasta and dairy; sauces and seasoning; everything else;
 *  frozen last. */
export const AISLES = ['Fruit, veg, meat & nuts', 'Cheese, pasta & dairy', 'Sauces & seasoning', 'Everything else', 'Frozen'] as const;

const set = (s: string) => new Set(s.split(' '));
const SEASONING = set('oil vinegar extract sauce stock cube gravy tinned canned tin passata powder flake seasoning ketchup mustard mayonnaise mayo soy tamari miso harissa pesto honey syrup sugar flour cornflour bicarbonate baking yeast cocoa chocolate vanilla tahini salt peppercorn paste');
const NUTS = set('almond pistachio walnut cashew peanut hazelnut pecan macadamia nut chia pumpkin sunflower sesame flax flaxseed linseed hemp date raisin sultana desiccated');
const SPICES = set('ground dried seed cumin paprika turmeric cinnamon nutmeg garam masala curry cayenne cardamom saffron allspice anise bay chickpea lentil cannellini kidney borlotti');
const DAIRY = set('milk cheese cheddar parmesan mozzarella halloumi ricotta mascarpone paneer feta gouda brie yoghurt yogurt butter cream creme fraiche kefir egg pasta spaghetti penne fusilli linguine lasagne tagliatelle orzo rigatoni macaroni noodle gnocchi rice couscous quinoa bulgur oat');
const FRESH = set(['onion shallot garlic ginger potato carrot celery leek pepper chilli tomato cucumber courgette aubergine broccoli cauliflower',
  'cabbage kale spinach lettuce rocket salad mushroom pea bean mangetout snap beetroot parsnip swede turnip radish asparagus corn sweetcorn',
  'avocado lemon lime orange apple banana berry berrie strawberrie raspberrie blueberrie grape pear mango pineapple melon kiwi pomegranate fig',
  'plum peach cherry cherrie parsley coriander basil mint dill thyme rosemary sage chive tarragon oregano lemongrass choi fennel edamame sprout',
  'squash okra samphire spring fresh herb',
  'chicken beef pork lamb mince turkey bacon ham chorizo pancetta steak duck venison gammon sausage salmon cod haddock hake tuna prawn mackerel',
  'trout bass bream fish mussel squid scallop crab tofu'].join(' '));
const has = (w: string[], s: Set<string>) => w.some((x) => s.has(x));

/** Which part of the shop an item is in: an index into AISLES. */
export function aisle(name: string): number {
  const w = words(name);
  if (w.includes('frozen') || (w.includes('ice') && w.includes('cream'))) return 4;
  if (w.includes('snap')) return 0; // sugar snap peas
  if (has(w, SEASONING) || (w.includes('coconut') && (w.includes('milk') || w.includes('cream')))) return 2;
  if (has(w, NUTS) && !w.includes('milk')) return 0;
  if (has(w, SPICES) || (w.includes('pepper') && (w.includes('black') || w.includes('white'))) || (w.includes('clove') && !w.includes('garlic'))) return 2;
  if (w.includes('butter') && w.includes('bean')) return 2;
  if (has(w, DAIRY)) return 1;
  if (has(w, FRESH)) return 0;
  return 3;
}

const WATERY = set('water boiling boiled hot cold warm lukewarm tap ice iced freshly just filtered');
/** Water from the tap, kettle or freezer (not tuna in water or coconut water): never bought. */
export const isTapWater = (name: string) => { const w = words(name); return w.includes('water') && w.every((x) => WATERY.has(x)); };

const MILKS = new Set(['whole milk', 'semi skimmed milk', 'skimmed milk', 'full fat milk']);
/** Words that say how it's sold or got ready, not what it is: "pitted dates" are dates. */
const SAME_ANYWAY = new Set(['fresh', 'pitted', 'stoned']);
/** The name lines are matched on: "fresh mint" is mint, pitted dates are dates, and any plain cow's milk is milk. */
export function sameThing(name: string): string {
  const n = words(name).filter((x) => !SAME_ANYWAY.has(x)).join(' ');
  return MILKS.has(n) ? 'milk' : n;
}

/** Units that add up: [what they measure, how many of the base unit]. */
const UNITS: Record<string, [string, number]> = {
  g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], l: ['ml', 1000], litre: ['ml', 1000], litres: ['ml', 1000], tbsp: ['ml', 15], tsp: ['ml', 5],
};
export const measure = (unit: string): [string, number] => UNITS[unit] ?? [`unit:${unit}`, 1];

/** About what one weighs, for things a recipe counts that another weighs (4 dates, 200g dates). */
const GRAMS_EACH: Record<string, number> = {
  'medjool date': 20, date: 8, carrot: 80, courgette: 200, 'cherry tomato': 15,
  'chicken breast': 160, 'boneless skinless chicken thigh': 100, 'whole chicken': 1600,
};
/** Like `measure`, but a count of something with a known weight each is in grams, so it adds up with grams. */
export function measureOf(name: string, unit: string): [string, number] {
  const each = unit === '' ? GRAMS_EACH[sameThing(name)] : undefined;
  return each ? ['g', each] : measure(unit);
}
