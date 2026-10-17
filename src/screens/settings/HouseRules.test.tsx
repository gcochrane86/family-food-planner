import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import HouseRules from './HouseRules';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.listRules.mockResolvedValue([
    { id: 'u1', household_id: 'h1', kind: 'avoid', match: 'Ultra-processed ingredients', replacement: null, note: null },
    { id: 'k1', household_id: 'h1', kind: 'prefer', match: 'Sauces in the TM7; meat and vegetables in the oven or on the hob', replacement: null, note: null },
  ] as never);
});

test('Meal specifications: the balance across the week, then how meals are made', async () => {
  render(<HouseRules />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('heading', { level: 1, name: 'Meal specifications' })).toBeInTheDocument();
  const balance = screen.getByRole('region', { name: 'Balance across the week' });
  expect(balance).toHaveTextContent(/2 chicken, 1 fish, 1 red meat and 1 veggie/);
  expect(balance).toHaveTextContent(/0\.5g/);
  const variety = within(balance).getAllByRole('listitem').find((li) => /Flavour variety/.test(li.textContent ?? ''))!;
  expect(variety).toHaveTextContent(/^Coming/);
  const made = screen.getByRole('region', { name: 'How meals are made' });
  expect(made).toHaveTextContent('Ultra-processed ingredients');
  expect(made).toHaveTextContent('Sauces in the TM7');
});
