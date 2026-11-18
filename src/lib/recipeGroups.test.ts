import { recipeGroups, isOnePan } from './recipeGroups';

type R = Parameters<typeof recipeGroups>[0];
const r = (over: Partial<R>): R => ({ kind: 'meal', component_role: null, tags: [], roast: null, snack_ok: false, quick: false, status: 'active', ...over });

test('a weeknight meal is a weeknight dinner', () => {
  expect(recipeGroups(r({ tags: ['chicken', 'weeknight'] }))).toEqual(['weeknight']);
});

test('roast joints and hosting or weekend meals are roasts & centrepieces, not weeknight dinners', () => {
  expect(recipeGroups(r({ kind: 'component', component_role: 'protein', tags: ['Roast'], roast: {} }))).toEqual(['centrepiece']);
  expect(recipeGroups(r({ tags: ['Sunday roast', 'Hosting'] }))).toEqual(['centrepiece']);
  expect(recipeGroups(r({ tags: ['Weekend', 'Make-ahead'] }))).toEqual(['centrepiece']);
});

test('roast trimmings, sauces and other parts are sides & sauces', () => {
  expect(recipeGroups(r({ kind: 'component', component_role: 'veg', tags: ['Roast'], roast: {} }))).toEqual(['sides']);
  expect(recipeGroups(r({ kind: 'component', component_role: 'carb', tags: ['Sunday roast', 'Roast'], roast: {} }))).toEqual(['sides']);
  expect(recipeGroups(r({ kind: 'component', component_role: 'sauce', tags: ['Sauce', 'Packed lunch'] }))).toEqual(['sides']);
  expect(recipeGroups(r({ kind: 'component', component_role: 'protein', tags: ['High protein'] }))).toEqual(['sides']);
});

test('breakfasts and lunches come from their tags, whatever the case', () => {
  expect(recipeGroups(r({ kind: 'component', tags: ['Breakfast'] }))).toEqual(['breakfast']);
  expect(recipeGroups(r({ kind: 'component', tags: ['Lunch', 'Packed'] }))).toEqual(['lunch']);
  expect(recipeGroups(r({ kind: 'component', component_role: 'carb', tags: ['Toddler lunch'] }))).toEqual(['lunch']);
  // A meal that is also a lunch or a brunch shows in both.
  expect(recipeGroups(r({ tags: ['noodles', 'quick', 'lunch'] }))).toEqual(['weeknight', 'lunch']);
  expect(recipeGroups(r({ tags: ['eggs', 'brunch', 'weeknight'] }))).toEqual(['weeknight', 'breakfast']);
});

test('snacks, recipes that can be snacks and quick snacks are snacks & treats', () => {
  expect(recipeGroups(r({ kind: 'snack', tags: ['Snack', 'Bake'] }))).toEqual(['snack']);
  expect(recipeGroups(r({ kind: 'snack', quick: true }))).toEqual(['snack']);
  expect(recipeGroups(r({ kind: 'component', tags: ['Breakfast'], snack_ok: true }))).toEqual(['breakfast', 'snack']);
});

test('every recipe lands in at least one group', () => {
  expect(recipeGroups(r({ tags: [] }))).toEqual(['weeknight']);
  expect(recipeGroups(r({ kind: 'component', tags: [] }))).toEqual(['sides']);
});

test('one-pan covers one-pot, one-tray, foil-bag and one-machine recipes', () => {
  for (const t of ['one-pot', 'One-tray', 'foil-bag style', 'One machine', 'one pan']) expect(isOnePan({ tags: [t] })).toBe(true);
  expect(isOnePan({ tags: ['weeknight', 'chicken'] })).toBe(false);
});
