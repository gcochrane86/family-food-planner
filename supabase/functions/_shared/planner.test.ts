import {
  addDays, alternatives, applyGuests, applyLeftovers, applyOut, applySwap, proposeWeek,
  type PlannerInput, type PlannerRecipe, type ProposedSlot,
} from './planner';

const r = (id: string, protein: PlannerRecipe['protein'], finish: number, extra: Partial<PlannerRecipe> = {}): PlannerRecipe =>
  ({ id, title: id, protein, finishMinutes: finish, reheatsWell: false, basePortions: 4, ...extra });

const LIBRARY: PlannerRecipe[] = [
  r('honey-chilli', 'chicken', 30, { reheatsWell: true, basePortions: 6 }),
  r('chow-mein', 'chicken', 15),
  r('casserole', 'chicken', 15, { reheatsWell: true }),
  r('crispy-thighs', 'chicken', 22),
  r('salmon', 'fish', 20),
  r('cod', 'fish', 25),
  r('fish-pie', 'fish', 35),
  r('beef-stir-fry', 'red_meat', 15),
  r('pork', 'red_meat', 25),
  r('doner', 'red_meat', 40, { reheatsWell: true, basePortions: 6 }),
  r('tacos', 'veggie', 30),
  r('penne', 'veggie', 25),
  r('chickpea-curry', 'veggie', 20, { reheatsWell: true, basePortions: 6 }),
  r('halloumi', 'veggie', 20),
];

const input = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  weekStart: '2026-10-19', days: 7, recipes: LIBRARY, recentRecipeIds: [], officeDays: [0],
  balance: { chicken: 2, fish: 1, red_meat: 1, veggie: 1 }, weekdayMaxMin: 30, householdPortions: 3, seed: 42, ...over,
});

const dinners = (plan: ProposedSlot[]) => plan.filter((s) => s.slot === 'dinner');
const proteinOf = (id: string | null) => LIBRARY.find((x) => x.id === id)?.protein ?? null;
const recipe = (id: string | null) => LIBRARY.find((x) => x.id === id)!;
const dinnerOn = (plan: ProposedSlot[], date: string) => plan.find((s) => s.slot === 'dinner' && s.date === date)!;

describe('proposeWeek', () => {
  const plan = proposeWeek(input());
  const cooked = dinners(plan).filter((s) => s.mode === 'cook');

  test('plans breakfast, lunch and dinner for all 7 days', () => {
    expect(plan).toHaveLength(21);
    expect(new Set(plan.map((s) => s.date)).size).toBe(7);
  });

  test('weekday dinners fit the time limit, and the office day is quick', () => {
    for (const s of cooked.filter((x) => x.date <= '2026-10-23')) expect(recipe(s.recipeId).finishMinutes).toBeLessThanOrEqual(30);
    expect(recipe(dinnerOn(plan, '2026-10-19').recipeId).finishMinutes).toBeLessThanOrEqual(20);
  });

  test('never the same protein two nights running', () => {
    const seq = dinners(plan).map((s) => proteinOf(s.recipeId));
    for (let i = 1; i < seq.length; i++) if (seq[i] && seq[i - 1]) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  test('meets the balance targets', () => {
    const count = (p: string) => cooked.filter((s) => proteinOf(s.recipeId) === p).length;
    expect(count('chicken')).toBeGreaterThanOrEqual(2);
    expect(count('fish')).toBeGreaterThanOrEqual(1);
    expect(count('red_meat')).toBeGreaterThanOrEqual(1);
    expect(count('veggie')).toBeGreaterThanOrEqual(1);
  });

  test('no recipe twice in a week', () => {
    const ids = cooked.map((s) => s.recipeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('one cook-once dinner Mon–Thu feeds the next day’s lunch', () => {
    const big = cooked.filter((s) => (s.portions ?? 0) >= 6);
    expect(big).toHaveLength(1);
    expect(big[0].date >= '2026-10-19' && big[0].date <= '2026-10-22').toBe(true);
    const lunch = plan.find((s) => s.slot === 'lunch' && s.date === addDays(big[0].date, 1))!;
    expect(['reheat', 'packed']).toContain(lunch.mode);
    expect(lunch.sourceDate).toBe(big[0].date);
    expect(lunch.recipeId).toBe(big[0].recipeId);
  });

  test('Sunday dinner uses things up because the shop arrives that evening', () => {
    expect(dinnerOn(plan, '2026-10-25').mode).toBe('leftovers');
  });

  test('Monday is an office day: overnight oats and a packed lunch', () => {
    expect(plan.find((s) => s.slot === 'breakfast' && s.date === '2026-10-19')!.reason).toMatch(/Overnight oats/);
    expect(plan.find((s) => s.slot === 'lunch' && s.date === '2026-10-19')!.mode).toBe('packed');
  });

  test('every dinner explains itself', () => {
    for (const s of dinners(plan)) expect(s.reason).toBeTruthy();
  });

  test('the same seed gives the same week; a different seed changes it', () => {
    expect(proposeWeek(input())).toEqual(plan);
    const other = proposeWeek(input({ seed: 7 }));
    expect(dinners(other).map((s) => s.recipeId)).not.toEqual(dinners(plan).map((s) => s.recipeId));
  });

  test('recently eaten recipes are avoided when there is a choice', () => {
    const recent = ['salmon', 'beef-stir-fry', 'chow-mein'];
    const p = proposeWeek(input({ recentRecipeIds: recent }));
    expect(dinners(p).some((s) => recent.includes(s.recipeId ?? ''))).toBe(false);
  });

  test('a 5-day plan covers Monday to Friday only', () => {
    const p = proposeWeek(input({ days: 5 }));
    expect(new Set(p.map((s) => s.date))).toEqual(new Set(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']));
  });
});

test('a thin library still fills every night and says which rule it relaxed', () => {
  const thin = [r('only-chicken', 'chicken', 20), r('chicken-2', 'chicken', 20), r('the-fish', 'fish', 20), r('veg', 'veggie', 20)];
  const p = proposeWeek(input({ recipes: thin, recentRecipeIds: ['the-fish'] }));
  const d = dinners(p).filter((s) => s.date !== '2026-10-25');
  for (const s of d) expect(['cook', 'leftovers']).toContain(s.mode);
  expect(d.filter((s) => s.mode === 'cook').length).toBeGreaterThanOrEqual(4);
  expect(d.map((s) => s.reason).join(' ')).toMatch(/no red meat recipe|made recently|repeat/i);
});

test('an empty library gives leftovers nights with a clear reason', () => {
  const p = proposeWeek(input({ recipes: [] }));
  expect(dinnerOn(p, '2026-10-20').mode).toBe('leftovers');
  expect(dinnerOn(p, '2026-10-20').reason).toMatch(/No recipe fits/);
});

describe('changing the plan', () => {
  const base = proposeWeek(input());
  const bigDate = dinners(base).find((s) => (s.portions ?? 0) >= 6)!.date;

  test('alternatives offers 3 options that are not already in the week, each with a reason', () => {
    const date = '2026-10-20';
    const alts = alternatives(base, date, input());
    expect(alts).toHaveLength(3);
    const used = dinners(base).filter((s) => s.date !== date).map((s) => s.recipeId);
    for (const a of alts) {
      expect(used).not.toContain(a.recipeId);
      expect(a.reason).toBeTruthy();
    }
  });

  test('swapping locks the new choice', () => {
    const alt = alternatives(base, '2026-10-21', input())[0];
    const p = applySwap(base, '2026-10-21', alt.recipeId, input());
    expect(dinnerOn(p, '2026-10-21')).toMatchObject({ recipeId: alt.recipeId, mode: 'cook', locked: true });
  });

  test('out tonight on the cook-once dinner sends the next lunch back to its routine', () => {
    const p = applyOut(base, bigDate);
    expect(dinnerOn(p, bigDate)).toMatchObject({ mode: 'out', recipeId: null });
    const lunch = p.find((s) => s.slot === 'lunch' && s.date === addDays(bigDate, 1))!;
    expect(lunch.sourceDate).toBeNull();
    expect(lunch.recipeId).toBeNull();
    expect(['routine', 'packed']).toContain(lunch.mode);
  });

  test('a leftovers night works the same way', () => {
    const p = applyLeftovers(base, bigDate);
    expect(dinnerOn(p, bigDate)).toMatchObject({ mode: 'leftovers', recipeId: null });
  });

  test('guests add 1.25 portions each', () => {
    const date = '2026-10-23';
    const before = dinnerOn(base, date).portions!;
    const p = applyGuests(base, date, 2, input());
    expect(dinnerOn(p, date)).toMatchObject({ guests: 2, portions: before + 2.5 });
  });

  test('changes never alter the original plan', () => {
    const copy = JSON.parse(JSON.stringify(base));
    applyOut(base, bigDate); applyGuests(base, '2026-10-23', 2, input()); applySwap(base, '2026-10-21', 'cod', input());
    expect(base).toEqual(copy);
  });
});

test('the rules hold across 200 different weeks', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const i = input({ seed, officeDays: seed % 3 === 0 ? [0, 2] : [0] });
    const plan = proposeWeek(i);
    const d = dinners(plan);
    const cooked = d.filter((s) => s.mode === 'cook');
    const seq = d.map((s) => proteinOf(s.recipeId));
    for (let k = 1; k < seq.length; k++) if (seq[k] && seq[k - 1]) expect({ seed, k, p: seq[k] }).not.toEqual({ seed, k, p: seq[k - 1] });
    for (const s of cooked) {
      const idx = Math.round((Date.parse(s.date) - Date.parse(i.weekStart)) / 86_400_000);
      const limit = idx >= 5 ? Infinity : i.officeDays.includes(idx) ? 20 : 30;
      expect({ seed, date: s.date, ok: recipe(s.recipeId).finishMinutes <= limit }).toEqual({ seed, date: s.date, ok: true });
    }
    for (const p of ['chicken', 'fish', 'red_meat', 'veggie'] as const) {
      expect({ seed, p, ok: cooked.filter((s) => proteinOf(s.recipeId) === p).length >= i.balance[p] }).toEqual({ seed, p, ok: true });
    }
    expect(cooked.filter((s) => (s.portions ?? 0) >= 6).length).toBeLessThanOrEqual(1);
  }
});
