import { render, screen } from '@testing-library/react';
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

test('Meal specifications describe one meal: what it is made of, then how it is made', async () => {
  render(<HouseRules />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('heading', { level: 1, name: 'Meal specifications' })).toBeInTheDocument();
  const meal = screen.getByRole('region', { name: 'What makes a meal' });
  expect(meal).toHaveTextContent(/a protein, vegetables, a simple carb and a sauce made from scratch/i);
  expect(meal).toHaveTextContent(/0\.5g/);
  expect(meal).toHaveTextContent(/30 minutes on the night/);
  expect(screen.queryByText(/2 chicken|Flavour variety|a week/)).not.toBeInTheDocument();
  const made = screen.getByRole('region', { name: 'How it is made' });
  expect(made).toHaveTextContent('Ultra-processed ingredients');
  expect(made).toHaveTextContent('Sauces in the TM7');
});

test('How it is made groups the rules as Always, Swap and Never, in that order', async () => {
  h.repo.listRules.mockResolvedValue([
    { id: 'n1', household_id: 'h1', kind: 'avoid', match: 'Ultra-processed ingredients', replacement: null, note: null },
    { id: 's1', household_id: 'h1', kind: 'substitute', match: 'Yoghurt', replacement: 'Greek yoghurt', note: 'Always Greek' },
    { id: 'a2', household_id: 'h1', kind: 'prefer', match: 'Real sourdough', replacement: null, note: null },
    { id: 'a1', household_id: 'h1', kind: 'prefer', match: 'Cook from scratch', replacement: null, note: null },
  ] as never);
  render(<HouseRules />, { wrapper: MemoryRouter });
  const made = await screen.findByRole('region', { name: 'How it is made' });
  const headings = [...made.querySelectorAll('h3')].map((h3) => h3.textContent);
  expect(headings).toEqual(['Always', 'Swap', 'Never']);
  const always = screen.getByRole('list', { name: 'Always' });
  expect([...always.querySelectorAll('li')].map((li) => li.textContent?.replace('Remove', ''))).toEqual(['Cook from scratch', 'Real sourdough']);
  expect(screen.getByRole('list', { name: 'Swap' })).toHaveTextContent('Yoghurt → Greek yoghurt');
  expect(screen.getByRole('list', { name: 'Never' })).toHaveTextContent('Ultra-processed ingredients');
});
