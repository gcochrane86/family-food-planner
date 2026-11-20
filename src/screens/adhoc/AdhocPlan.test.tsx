import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { householdPortions } from '../../lib/household';
import type { AdhocMeal } from '../../lib/types';
import { NEXT_WEEK } from '../../test/fixtures';
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

test('removing the last meal (with nothing added) clears the plan, so old ticks and cupboard answers go too', async () => {
  h.repo.listAdhoc.mockResolvedValue({ meals: [meal('m2', 'r-honey', 'dinner')], items: [], ticks: new Map([['cupboard-need|p', true]]) });
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: /Remove Almond-Crusted/ }));
  expect(h.repo.clearAdhoc).toHaveBeenCalledWith('h1');
});

test('Clear the plan is there for added items alone, and an archived recipe keeps its name', async () => {
  h.repo.listAdhoc.mockResolvedValue({ meals: [meal('m1', 'r-honey', 'dinner')], items: [{ id: 'x', household_id: 'h1', name: 'Toothpaste', created_at: '' }], ticks: new Map() });
  h.repo.listRecipes.mockResolvedValue([{ ...(await h.repo.getRecipe('r-honey'))!, status: 'archived' }]);
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('link', { name: /Honey Chilli/ })).toBeInTheDocument();
  expect(screen.getByText('Plus 1 item added on the shop.')).toBeInTheDocument();
  h.repo.listAdhoc.mockResolvedValue({ meals: [], items: [{ id: 'x', household_id: 'h1', name: 'Toothpaste', created_at: '' }], ticks: new Map() });
});

test("From this week adds the ticked meals at the week's portions", async () => {
  h.repo.getWeek.mockResolvedValue(JSON.parse(JSON.stringify(NEXT_WEEK)));
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'From this week' }));
  const week = screen.getByRole('group', { name: 'From this week' });
  // Cooked meals only: Monday's honey chicken and Saturday's doner, not Tuesday's reheated lunch or Sunday's leftovers.
  expect(within(week).getAllByRole('checkbox')).toHaveLength(6);
  await userEvent.click(within(week).getByRole('checkbox', { name: /Mon · Almond-Crusted Honey Chilli Chicken/ }));
  await userEvent.click(within(week).getByRole('checkbox', { name: /Sat · .*Doner/ }));
  await userEvent.click(within(week).getByRole('button', { name: 'Add 2 to the plan' }));
  expect(h.repo.addAdhocMeal).toHaveBeenCalledWith('h1', 'r-honey', 'dinner', 3);
  expect(h.repo.addAdhocMeal).toHaveBeenCalledWith('h1', 'r-doner', 'dinner', 3);
  const dinner = await screen.findByRole('region', { name: 'Dinner' });
  expect(within(dinner).getByRole('link', { name: /Honey Chilli/ })).toBeInTheDocument();
  expect(within(dinner).getByRole('link', { name: /Doner/ })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'From this week' })).not.toBeInTheDocument();
});

test('From this week shows a meal already in the plan as added', async () => {
  h.repo.getWeek.mockResolvedValue(JSON.parse(JSON.stringify(NEXT_WEEK)));
  h.repo.listAdhoc.mockResolvedValue({ meals: [meal('m2', 'r-honey', 'dinner')], items: [], ticks: new Map() });
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'From this week' }));
  const honey = within(screen.getByRole('group', { name: 'From this week' })).getByRole('checkbox', { name: /Mon · Almond-Crusted/ });
  expect(honey).toBeDisabled();
  expect(honey).toBeChecked();
  expect(screen.getByText('Added')).toBeInTheDocument();
});

test('From this week with no plan this week says so', async () => {
  render(<AdhocPlan />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'From this week' }));
  expect(screen.getByText("There's no plan for this week.")).toBeInTheDocument();
});
