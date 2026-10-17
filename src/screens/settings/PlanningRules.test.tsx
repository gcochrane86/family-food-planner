import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import PlanningRules from './PlanningRules';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue({ weekday_dinner_max_min: 25, default_plan_days: 7, shops_per_week: 2, delivery_slots: [], delivery_pass: false, use_nectar: false, adventure: 2, breakfasts: [], lunches: [] });
});

const steps = async () => within(await screen.findByRole('region', { name: 'How the week is built' })).getAllByRole('listitem', { name: /^Step/ });

test('lays out how the week is built, one dinner at a time, each step marked now or coming', async () => {
  render(<PlanningRules />, { wrapper: MemoryRouter });
  const list = await steps();
  const text = list.map((s) => s.textContent);
  expect(text[0]).toMatch(/^NowSet breakfasts and lunches/);
  expect(text.join(' ')).not.toMatch(/cook-once|Cook once|leftovers or freezer night/i);
  expect(text[0]).toMatch(/office days/i);
  expect(text.join(' ')).toMatch(/Fill every night one at a time.*Sunday included/);
  const lunches = list.find((s) => /Leftover lunches/.test(s.textContent ?? ''))!;
  expect(lunches).toHaveTextContent(/^Now/);
  expect(lunches).toHaveTextContent(/reheats well.*next day's lunch/);
  const packs = list.find((s) => /pack size/.test(s.textContent ?? ''))!;
  expect(packs).toHaveTextContent(/^Coming/);
  expect(packs).toHaveTextContent(/200g bag/);
  const next = list.find((s) => /leftover/i.test(s.textContent ?? '') && /variety/i.test(s.textContent ?? ''))!;
  expect(next).toHaveTextContent(/^Coming/);
  const newRecipes = list.find((s) => /new recipe/i.test(s.textContent ?? ''))!;
  expect(newRecipes).toHaveTextContent(/^Coming/);
  expect(newRecipes).toHaveTextContent(/up to 2 a week/);
});

test('every choice passes these checks, in this order of priority, starting with the meal specifications', async () => {
  render(<PlanningRules />, { wrapper: MemoryRouter });
  const checks = within(await screen.findByRole('region', { name: 'Checks, in order of priority' })).getAllByRole('listitem').map((li) => li.textContent);
  expect(checks[0]).toMatch(/Meal specifications/);
  expect(checks[1]).toMatch(/Your day rules/);
  expect(checks[2]).toMatch(/Protein balance: 2 chicken, 1 fish, 1 red meat and 1 veggie/);
  expect(checks.join(' ')).toMatch(/25 minutes or less \(20 on office days\)/);
  const variety = checks.findIndex((c) => /Flavour variety/.test(c ?? ''));
  expect(checks[variety]).toMatch(/^Coming/);
  expect(variety).toBeLessThan(checks.findIndex((c) => /Use up leftovers/.test(c ?? '')));
  expect(checks.at(-1)).toMatch(/Use up leftovers/);
});

test('the page is called Planner specifications', async () => {
  render(<PlanningRules />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('heading', { level: 1, name: 'Planner specifications' })).toBeInTheDocument();
});

describe('your requirements', () => {
  const base = { weekday_dinner_max_min: 30, default_plan_days: 7 as const, shops_per_week: 2 as const, delivery_slots: [], delivery_pass: false, use_nectar: false, adventure: 1, breakfasts: [], lunches: [] };
  beforeEach(() => {
    h.repo.getSettings.mockResolvedValue({ ...base,
      day_rules: [{ weekday: 3, protein: 'fish', note: 'Fishmonger in town' }],
      other_shops: [{ name: 'Fishmonger', buys: ['salmon', 'cod'], day: 3, sometimes: false, weeks: [] }] });
  });

  test('lists your day rules and other shops', async () => {
    render(<PlanningRules />, { wrapper: MemoryRouter });
    const mine = await screen.findByRole('region', { name: 'Your requirements' });
    expect(mine).toHaveTextContent('Thursday: a fish dinner · Fishmonger in town');
    expect(mine).toHaveTextContent('Fishmonger, on Thursday: salmon, cod');
  });

  test('adds a day rule and a some-weeks shop, and removes one', async () => {
    render(<PlanningRules />, { wrapper: MemoryRouter });
    const mine = await screen.findByRole('region', { name: 'Your requirements' });
    const dayForm = within(mine).getByRole('form', { name: 'Add a day rule' });
    await userEvent.selectOptions(within(dayForm).getByRole('combobox', { name: 'Day' }), '6');
    await userEvent.selectOptions(within(dayForm).getByRole('combobox', { name: 'Dinner' }), 'red_meat');
    await userEvent.type(within(dayForm).getByRole('textbox', { name: 'Why (optional)' }), 'Roast day');
    await userEvent.click(within(dayForm).getByRole('button', { name: 'Add' }));
    expect(h.repo.saveSettings.mock.calls.at(-1)![1].day_rules!).toEqual([{ weekday: 3, protein: 'fish', note: 'Fishmonger in town' }, { weekday: 6, protein: 'red_meat', note: 'Roast day' }]);
    const shopForm = within(mine).getByRole('form', { name: 'Add a shop' });
    await userEvent.type(within(shopForm).getByRole('textbox', { name: 'Shop' }), 'Farm shop');
    await userEvent.type(within(shopForm).getByRole('textbox', { name: 'What you buy there' }), 'eggs, milk, butter');
    await userEvent.click(within(shopForm).getByRole('checkbox', { name: 'Only some weeks' }));
    await userEvent.click(within(shopForm).getByRole('button', { name: 'Add' }));
    expect(h.repo.saveSettings.mock.calls.at(-1)![1].other_shops!.at(-1)).toEqual({ name: 'Farm shop', buys: ['eggs', 'milk', 'butter'], day: null, sometimes: true, weeks: [] });
    await userEvent.click(within(mine).getByRole('button', { name: 'Remove Fishmonger' }));
    expect(h.repo.saveSettings.mock.calls.at(-1)![1].other_shops!.map((s: { name: string }) => s.name)).toEqual(['Farm shop']);
  });
});
