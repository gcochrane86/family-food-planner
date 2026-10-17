import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import PlanningRules from './PlanningRules';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue({ weekday_dinner_max_min: 25, default_plan_days: 7, shops_per_week: 2, delivery_slots: [], delivery_pass: false, use_nectar: false, adventure: 1, breakfasts: [], lunches: [] });
});

test('lists the rules the Friday menu follows now, with your own settings in them', async () => {
  render(<PlanningRules />, { wrapper: MemoryRouter });
  const now = await screen.findByRole('region', { name: 'The rules it follows now' });
  const rules = within(now).getAllByRole('listitem').map((li) => li.textContent);
  expect(rules[0]).toMatch(/2 chicken, 1 fish, 1 red meat and 1 veggie/);
  expect(rules.join(' ')).toMatch(/25 minutes or less \(20 on office days\)/);
  expect(rules.join(' ')).toMatch(/Cook once, eat twice/);
  expect(rules.join(' ')).toMatch(/last two weeks/);
  expect(rules.join(' ')).toMatch(/rated 👎/);
});

test('shows what is coming next separately', async () => {
  render(<PlanningRules />, { wrapper: MemoryRouter });
  const next = await screen.findByRole('region', { name: 'Coming next' });
  expect(next).toHaveTextContent(/Flavour variety/);
  expect(next).toHaveTextContent(/Using up packs/);
  expect(next).toHaveTextContent(/never at the expense of variety/);
});
