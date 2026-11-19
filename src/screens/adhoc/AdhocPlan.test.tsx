import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { householdPortions } from '../../lib/household';
import type { AdhocMeal } from '../../lib/types';
import AdhocPlan from './AdhocPlan';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const meal = (id: string, recipe_id: string, m: 'lunch' | 'dinner'): AdhocMeal => ({ id, household_id: 'h1', recipe_id, meal: m, portions: 4, created_at: '2026-11-19T08:00:00Z' });

beforeEach(() => { h.repo = fakeRepo(); });

test('shows the ad-hoc meals as lunch and dinner, each opening its recipe', async () => {
  h.repo.listAdhoc.mockResolvedValue({ meals: [meal('m1', 'r-doner', 'lunch'), meal('m2', 'r-honey', 'dinner')], items: [], ticks: new Map() });
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  const lunch = await screen.findByRole('region', { name: 'Lunch' });
  expect(within(lunch).getByRole('link', { name: /Doner/ })).toHaveAttribute('href', '/recipes/r-doner');
  expect(within(screen.getByRole('region', { name: 'Dinner' })).getByRole('link', { name: /Honey Chilli/ })).toBeInTheDocument();
  expect(screen.getByText(/Your weekly plan is kept/)).toBeInTheDocument();
});

test('nothing planned says how to add a meal', async () => {
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  expect(await screen.findByText('Nothing planned yet. Add a meal here or from a recipe.')).toBeInTheDocument();
});

test('a meal can be removed', async () => {
  h.repo.listAdhoc.mockResolvedValue({ meals: [meal('m2', 'r-honey', 'dinner')], items: [], ticks: new Map() });
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: /Remove Almond-Crusted/ }));
  expect(h.repo.removeAdhocMeal).toHaveBeenCalledWith('m2');
  expect(screen.queryByRole('link', { name: /Honey Chilli/ })).not.toBeInTheDocument();
});

test('Add a meal finds a recipe and adds it as dinner, for the household', async () => {
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Add a meal' }));
  await userEvent.type(screen.getByRole('searchbox', { name: 'Find a recipe' }), 'honey');
  await userEvent.click(screen.getByRole('button', { name: /Honey Chilli/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Add as dinner' }));
  const portions = householdPortions(await h.repo.listMembers());
  expect(h.repo.addAdhocMeal).toHaveBeenCalledWith('h1', 'r-honey', 'dinner', portions);
  expect(await screen.findByRole('link', { name: /Honey Chilli/ })).toBeInTheDocument();
});

test('Clear the plan asks first, then clears it', async () => {
  h.repo.listAdhoc.mockResolvedValue({ meals: [meal('m2', 'r-honey', 'dinner')], items: [], ticks: new Map() });
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Clear the plan' }));
  expect(h.repo.clearAdhoc).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Yes, clear it' }));
  expect(h.repo.clearAdhoc).toHaveBeenCalledWith('h1');
  expect(await screen.findByText(/Nothing planned yet/)).toBeInTheDocument();
});
