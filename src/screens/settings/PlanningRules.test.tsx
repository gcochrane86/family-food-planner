import { render, screen, within } from '@testing-library/react';
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
  const packs = list.find((s) => /pack size/.test(s.textContent ?? ''))!;
  expect(packs).toHaveTextContent(/^Coming/);
  expect(packs).toHaveTextContent(/200g bag/);
  const next = list.find((s) => /leftover/i.test(s.textContent ?? '') && /variety/i.test(s.textContent ?? ''))!;
  expect(next).toHaveTextContent(/^Coming/);
  const newRecipes = list.find((s) => /new recipe/i.test(s.textContent ?? ''))!;
  expect(newRecipes).toHaveTextContent(/^Coming/);
  expect(newRecipes).toHaveTextContent(/up to 2 a week/);
});

test('every choice passes these checks, in this order of priority', async () => {
  render(<PlanningRules />, { wrapper: MemoryRouter });
  const checks = within(await screen.findByRole('region', { name: 'Checks, in order of priority' })).getAllByRole('listitem').map((li) => li.textContent);
  expect(checks[0]).toMatch(/Meal rules/);
  expect(checks[1]).toMatch(/2 chicken, 1 fish, 1 red meat and 1 veggie/);
  expect(checks.join(' ')).toMatch(/25 minutes or less \(20 on office days\)/);
  expect(checks.findIndex((c) => /Flavour variety/.test(c ?? ''))).toBeLessThan(checks.findIndex((c) => /Use up leftovers/.test(c ?? '')));
});

test('the page is called Planner', async () => {
  render(<PlanningRules />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('heading', { level: 1, name: 'Planner' })).toBeInTheDocument();
});
