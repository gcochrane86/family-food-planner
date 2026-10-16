import { buildPlannerInput, DEFAULT_BALANCE, slotRows, weekSeed } from './planInput';
import { proposeWeek } from './planner';

const rows = {
  weekStart: '2026-10-19',
  householdId: 'h1',
  settings: { default_plan_days: 7, weekday_dinner_max_min: 30 },
  members: [
    { id: 'm1', kind: 'adult', portion_weight: 1.25 },
    { id: 'm2', kind: 'adult', portion_weight: 1.25 },
    { id: 'm3', kind: 'child', portion_weight: 0.5 },
  ],
  pattern: [
    { member_id: 'm1', weekday: 0, office: true },
    { member_id: 'm2', weekday: 2, office: false },
    { member_id: 'm3', weekday: 3, office: true },
  ],
  recipes: [
    { id: 'a', title: 'A', kind: 'meal', status: 'active', protein: 'chicken', finish_minutes: 20, reheats_well: true, base_portions: '6.00' },
    { id: 'b', title: 'B', kind: 'meal', status: 'draft', protein: 'fish', finish_minutes: 25, reheats_well: false, base_portions: 4 },
    { id: 'c', title: 'C', kind: 'component', status: 'active', protein: 'chicken', finish_minutes: 10, reheats_well: false, base_portions: 4 },
    { id: 'd', title: 'D', kind: 'meal', status: 'archived', protein: 'veggie', finish_minutes: 10, reheats_well: false, base_portions: 4 },
    { id: 'e', title: 'E', kind: 'meal', status: 'active', protein: null, finish_minutes: 15, reheats_well: false, base_portions: 4 },
  ],
  recentDinnerRecipeIds: ['b', null, 'b'],
};

test('builds the planner input from database rows', () => {
  const input = buildPlannerInput(rows);
  expect(input.weekStart).toBe('2026-10-19');
  expect(input.days).toBe(7);
  expect(input.householdPortions).toBe(3);
  expect(input.officeDays).toEqual([0]); // only adults' office days count
  expect(input.balance).toEqual(DEFAULT_BALANCE);
  expect(input.recentRecipeIds).toEqual(['b']);
  expect(input.recipes.map((r) => r.id)).toEqual(['a', 'b', 'e']); // meals that aren't archived
  expect(input.recipes[0]).toEqual({ id: 'a', title: 'A', protein: 'chicken', finishMinutes: 20, reheatsWell: true, basePortions: 6 });
  expect(input.seed).toBe(weekSeed('h1', '2026-10-19'));
});

test('settings can change the plan length, limit and balance', () => {
  const input = buildPlannerInput({ ...rows, settings: { default_plan_days: 5, weekday_dinner_max_min: 25, balance: { chicken: 1, fish: 2, red_meat: 1, veggie: 1 } } });
  expect(input.days).toBe(5);
  expect(input.weekdayMaxMin).toBe(25);
  expect(input.balance).toEqual({ chicken: 1, fish: 2, red_meat: 1, veggie: 1 });
});

test('the seed is stable for a household and week, and differs between weeks', () => {
  expect(weekSeed('h1', '2026-10-19')).toBe(weekSeed('h1', '2026-10-19'));
  expect(weekSeed('h1', '2026-10-19')).not.toBe(weekSeed('h1', '2026-10-26'));
});

test('slot rows are ready to insert', () => {
  const plan = proposeWeek(buildPlannerInput(rows));
  const out = slotRows('w1', plan);
  expect(out).toHaveLength(21);
  expect(out[0]).toEqual({
    plan_week_id: 'w1', date: '2026-10-19', slot: 'breakfast', recipe_id: null, mode: 'routine', portions: null,
    guests: 0, locked: false, reason: 'Overnight oats (made at Sunday 8pm prep)', source_date: null,
  });
});
