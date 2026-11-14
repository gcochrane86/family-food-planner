import { mergePlan, toProposed, type SlotLike } from './slotMerge';
import { applyOut, applySwap, type PlannerInput } from './planner';

const slot = (o: Partial<SlotLike> = {}): SlotLike => ({
  date: '2026-11-16', slot: 'dinner', recipe_id: 'r1', mode: 'cook', portions: 3, guests: 0, locked: false, reason: null, source_date: null, ...o,
});
const input = { householdPortions: 3 } as PlannerInput;
const version = { based_on: 'r1', note: 'Yoghurt tonight', ingredients: [], steps: [] };

test('a swap clears tonight\'s version', () => {
  const slots = [slot({ version })];
  const { next, changed } = mergePlan(slots, applySwap(slots.map(toProposed), '2026-11-16', 'r2', input));
  expect(next[0].recipe_id).toBe('r2');
  expect(next[0].version).toBeNull();
  expect(changed).toHaveLength(1);
});

test('eating out clears it too', () => {
  const slots = [slot({ version })];
  expect(mergePlan(slots, applyOut(slots.map(toProposed), '2026-11-16')).next[0].version).toBeNull();
});

test('a portions change keeps it', () => {
  const slots = [slot({ version })];
  const plan = slots.map(toProposed).map((p) => ({ ...p, portions: 5 }));
  const { next, changed } = mergePlan(slots, plan);
  expect(next[0].version).toBe(version);
  expect(changed[0].portions).toBe(5);
});

test('a slot without a version gets no version key', () => {
  const slots = [slot()];
  const { next } = mergePlan(slots, applySwap(slots.map(toProposed), '2026-11-16', 'r2', input));
  expect('version' in next[0]).toBe(false);
});

test('batch and roast plans still go with their dinner', () => {
  const slots = [slot({ batch: 'make', roast: { main: 'x' } })];
  const { next } = mergePlan(slots, applySwap(slots.map(toProposed), '2026-11-16', 'r2', input));
  expect(next[0].batch).toBeNull();
  expect(next[0].roast).toBeNull();
  const same = mergePlan(slots, slots.map(toProposed).map((p) => ({ ...p, portions: 4 })));
  expect(same.next[0].batch).toBe('make');
});

test("a different dinner puts its prep ahead back to recommended, as the database does", () => {
  const s = { date: '2026-10-21', slot: 'dinner', recipe_id: 'a', mode: 'cook', portions: 3, guests: 0, locked: false, reason: null, source_date: null, prep_ahead: 'on_the_day' };
  const { next } = mergePlan([s] as never, [{ date: '2026-10-21', slot: 'dinner', recipeId: 'b', mode: 'cook', portions: 3, guests: 0, locked: true, reason: null, sourceDate: null }] as never);
  expect((next[0] as { prep_ahead?: string }).prep_ahead).toBe('ahead');
  const same = mergePlan([s] as never, [{ date: '2026-10-21', slot: 'dinner', recipeId: 'a', mode: 'cook', portions: 4, guests: 0, locked: true, reason: null, sourceDate: null }] as never);
  expect((same.next[0] as { prep_ahead?: string }).prep_ahead).toBe('on_the_day');
});
