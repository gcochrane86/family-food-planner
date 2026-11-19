import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import type { AdhocMeal } from '../../lib/types';
import AdhocShop from './AdhocShop';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const doner: AdhocMeal = { id: 'm1', household_id: 'h1', recipe_id: 'r-doner', meal: 'dinner', portions: 6, created_at: '2026-11-19T08:00:00Z' };
beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.listStaples.mockResolvedValue([]);
});

test("the meals' ingredients and the added items are listed in their aisles", async () => {
  h.repo.listAdhoc.mockResolvedValue({ meals: [doner], items: [{ id: 'x1', household_id: 'h1', name: 'Toothpaste', created_at: '2026-11-19T08:00:00Z' }], ticks: new Map() });
  render(<AdhocShop />);
  const shop = await screen.findByRole('region', { name: 'Ad-hoc shop' });
  expect(within(shop).getByRole('checkbox', { name: '1kg lamb mince' })).toBeInTheDocument();
  expect(within(shop).getByText('for Dinner: Gourmet Lamb Doner')).toBeInTheDocument();
  expect(within(shop).getByRole('heading', { name: 'Toiletries & household' })).toBeInTheDocument();
  expect(within(shop).getByRole('checkbox', { name: 'Toothpaste' })).toBeInTheDocument();
  expect(screen.queryByText(/Sainsbury/)).not.toBeInTheDocument();
});

test('adding an item puts it on the list, and it can be taken off again', async () => {
  render(<AdhocShop />);
  await userEvent.type(await screen.findByLabelText('Add an item'), 'Bin bags');
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(h.repo.addAdhocItem).toHaveBeenCalledWith('h1', 'Bin bags');
  expect(await screen.findByRole('checkbox', { name: 'Bin bags' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove Bin bags' }));
  expect(h.repo.removeAdhocItem).toHaveBeenCalledWith('ai-Bin bags');
  expect(screen.queryByRole('checkbox', { name: 'Bin bags' })).not.toBeInTheDocument();
});

test('ticking a line saves it on the ad-hoc shop, not the week', async () => {
  h.repo.listAdhoc.mockResolvedValue({ meals: [doner], items: [], ticks: new Map() });
  render(<AdhocShop />);
  await userEvent.click(await screen.findByRole('checkbox', { name: '1kg lamb mince' }));
  expect(h.repo.setAdhocTick).toHaveBeenCalledWith('h1', 'lamb mince|g@1000', true);
  expect(h.repo.setTick).not.toHaveBeenCalled();
});

test('the pantry is checked: Need it puts it on the list', async () => {
  h.repo.listStaples.mockResolvedValue([{ id: 'st-lamb', ingredient_id: 'i', name: 'Lamb mince', status: 'have' }]);
  h.repo.listAdhoc.mockResolvedValue({ meals: [doner], items: [], ticks: new Map() });
  render(<AdhocShop />);
  const check = await screen.findByRole('region', { name: 'Check the cupboard' });
  expect(screen.queryByRole('checkbox', { name: '1kg lamb mince' })).not.toBeInTheDocument();
  await userEvent.click(within(check).getByRole('button', { name: 'Need it' }));
  expect(h.repo.setAdhocTick).toHaveBeenCalledWith('h1', 'cupboard-need|st-lamb', true);
  expect(h.repo.setStaple).toHaveBeenCalledWith('st-lamb', 'out');
  expect(await screen.findByRole('checkbox', { name: '1kg lamb mince' })).toBeInTheDocument();
});

test('nothing planned or added says what to do', async () => {
  render(<AdhocShop />);
  expect(await screen.findByText('Add meals on the Plan tab, or add an item.')).toBeInTheDocument();
});

test('removing the last added item (with no meals) clears the ad-hoc ticks too', async () => {
  h.repo.listAdhoc.mockResolvedValue({ meals: [], items: [{ id: 'x1', household_id: 'h1', name: 'Toothpaste', created_at: '' }], ticks: new Map([['extra|x1', true]]) });
  render(<AdhocShop />);
  await userEvent.click(await screen.findByRole('button', { name: 'Remove Toothpaste' }));
  expect(h.repo.clearAdhoc).toHaveBeenCalledWith('h1');
});

test('a tick whose pantry restock fails is undone in the database as well as on screen', async () => {
  h.repo.listStaples.mockResolvedValue([{ id: 'st-lamb', ingredient_id: 'i', name: 'Lamb mince', status: 'out' }]);
  h.repo.listAdhoc.mockResolvedValue({ meals: [doner], items: [], ticks: new Map() });
  h.repo.setStaple.mockRejectedValueOnce(new Error('offline'));
  render(<AdhocShop />);
  await userEvent.click(await screen.findByRole('checkbox', { name: '1kg lamb mince' }));
  expect(await screen.findByText(/couldn't save|Couldn't save/i)).toBeInTheDocument();
  expect(h.repo.setAdhocTick).toHaveBeenLastCalledWith('h1', 'lamb mince|g@1000', false);
  expect(screen.getByRole('checkbox', { name: '1kg lamb mince' })).not.toBeChecked();
});
