import { makePlanner } from './askClaudePlan';
import { tableDb } from './testDb';

const NOW = new Date('2026-11-13T19:00:00Z'); // Friday evening in London: next week starts 2026-11-16
const RECIPES = [
  { id: 'r1', slug: 'thai-green-curry', title: 'Thai Green Curry', kind: 'meal', status: 'active' },
  { id: 'r2', slug: 'fish-pie', title: 'Classic Fish Pie', kind: 'meal', status: 'active' },
  { id: 'r3', slug: 'fish-tacos', title: 'Fish Tacos', kind: 'meal', status: 'active' },
];
const deps = (save = vi.fn(async () => ({ added: 0 }))) => ({
  context: vi.fn(async () => ({ week: { start: '2026-11-16' } }) as never),
  loadInput: vi.fn(async () => ({ days: 5 }) as never),
  save,
});
const world = (o: Record<string, unknown> = {}) => tableDb({ recipes: RECIPES, 'settings:one': { data: { adventure: 1 } }, 'week_plan_requests:single': { id: 'new-req' }, ...o });
const plan = (dinners: { date: string; recipe: string }[], extra = {}) => ({ week: 'next', summary: 'A good week.', dinners: dinners.map((d) => ({ ...d, reason: 'Because' })), ...extra });

test('the context explains how to plan, then gives the week as JSON', async () => {
  const d = deps();
  const out = await makePlanner(world(), 'h1', NOW, d).context({});
  expect(d.context).toHaveBeenCalledWith(expect.anything(), 'h1', '2026-11-16');
  expect(out).toMatch(/Meal specifications/);
  expect(out).toMatch(/save_week_plan/);
  expect(out).toContain('"start": "2026-11-16"');
});

test('dinners can be named by title; the plan is saved through a new planning request', async () => {
  const d = deps();
  const db = world();
  const out = await makePlanner(db, 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'thai green curry' }, { date: '2026-11-17', recipe: 'fish-pie' }]));
  const insert = db.writes().find((w) => w.table === 'week_plan_requests' && w.method === 'insert');
  expect(insert?.payload).toMatchObject({ household_id: 'h1', week_start: '2026-11-16', status: 'planning', replace: true });
  expect(d.save).toHaveBeenCalledWith(db, 'h1', 'new-req', '2026-11-16', expect.objectContaining({ dinners: [
    { date: '2026-11-16', recipe: 'thai-green-curry', reason: 'Because' }, { date: '2026-11-17', recipe: 'fish-pie', reason: 'Because' },
  ] }));
  expect(out).toMatch(/Saved a draft for the week of Mon 16 Nov/);
  expect(out).toMatch(/Mon 16 Nov: Thai Green Curry/);
  expect(out).toMatch(/approve it in the app/i);
});

test('an open request for that week is taken over, not doubled', async () => {
  const d = deps();
  const db = world({ 'week_plan_requests:one': { id: 'open-req', status: 'requested' } });
  await makePlanner(db, 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }]));
  expect(db.writes().some((w) => w.table === 'week_plan_requests' && w.method === 'insert')).toBe(false);
  expect(db.writes().find((w) => w.table === 'week_plan_requests' && w.method === 'update')?.payload).toMatchObject({ status: 'planning', replace: true });
  expect(d.save).toHaveBeenCalledWith(db, 'h1', 'open-req', '2026-11-16', expect.anything());
});

test('nothing is written for an ambiguous title, a past week, or an approved week', async () => {
  for (const [db, args, says] of [
    [world(), plan([{ date: '2026-11-16', recipe: 'fish' }]), /Several recipes match/],
    [world(), { ...plan([{ date: '2026-11-02', recipe: 'fish-pie' }]), week: '2026-11-02' }, /has passed/],
    [world({ 'plan_weeks:one': { status: 'approved' } }), plan([{ date: '2026-11-16', recipe: 'fish-pie' }]), /already approved/],
  ] as const) {
    const d = deps();
    expect(await makePlanner(db, 'h1', NOW, d).save(args as never)).toMatch(says);
    expect(db.writes()).toEqual([]);
    expect(d.save).not.toHaveBeenCalled();
  }
});

test("when saving fails, the request is closed with why and Claude is told", async () => {
  const d = deps(vi.fn(async () => { throw new Error('That week was approved while planning, so it was left as it is.'); }));
  const db = world();
  const out = await makePlanner(db, 'h1', NOW, d).save(plan([{ date: '2026-11-16', recipe: 'fish-pie' }]));
  expect(out).toMatch(/Couldn't save the week: That week was approved while planning/);
  expect(db.writes().find((w) => w.table === 'week_plan_requests' && w.method === 'update')?.payload).toMatchObject({ status: 'failed' });
});
