import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import type { PantryEntry, PreparedItem } from '../../lib/types';
import Pantry from './Pantry';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const frozen = (over: Partial<PreparedItem>): PreparedItem => ({
  id: 'p1', household_id: 'h1', recipe_id: 'r-katsu', name: 'Katsu curry paste', portions: 3, location: 'freezer', made_on: '2026-10-17', use_by: '2027-01-15', ...over,
});
const entry = (over: Partial<PantryEntry>): PantryEntry => ({ id: 'e1', name: 'Cumin', location: 'cupboard', qty: null, unit: null, staple: 'have', ...over });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));
  localStorage.clear();
  h.repo = fakeRepo();
  h.repo.listPrepared.mockResolvedValue([frozen({}), frozen({ id: 'p2', name: 'Honey chilli sauce', portions: 1, made_on: '2026-06-01', use_by: '2026-09-01' })]);
  h.repo.listPantry.mockResolvedValue([
    entry({}), entry({ id: 'e2', name: 'Tahini', staple: 'out' }),
    entry({ id: 'e3', name: 'Basmati rice', staple: null, qty: 1, unit: 'kg' }),
    entry({ id: 'e4', name: 'Greek yoghurt', location: 'fridge', staple: null, qty: 500, unit: 'g' }),
  ]);
});
afterEach(() => { vi.useRealTimers(); });
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

test('three tabs, with the freezer first: out-of-date items first, then the rest with portions and when they were made', async () => {
  render(<Pantry />, { wrapper: MemoryRouter });
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Freezer', 'Fridge', 'Cupboard']);
  expect(screen.getByRole('tab', { name: 'Freezer' })).toHaveAttribute('aria-selected', 'true');
  const rows = await screen.findAllByRole('listitem');
  expect(rows[0]).toHaveTextContent(/Honey chilli sauce.*use or bin/);
  expect(rows[1]).toHaveTextContent('Katsu curry paste · 3 portions · made 17 Oct');
});

test('− takes one out; the last one asks first', async () => {
  render(<Pantry />, { wrapper: MemoryRouter });
  await user().click(await screen.findByRole('button', { name: 'One fewer Katsu curry paste' }));
  expect(h.repo.setPreparedPortions).toHaveBeenCalledWith('p1', 2);
  await user().click(screen.getByRole('button', { name: 'One fewer Honey chilli sauce' }));
  expect(h.repo.setPreparedPortions).not.toHaveBeenCalledWith('p2', 0);
  const ask = screen.getByRole('alertdialog', { name: 'Used the last one?' });
  await user().click(within(ask).getByRole('button', { name: "Yes, it's gone" }));
  expect(h.repo.setPreparedPortions).toHaveBeenCalledWith('p2', 0);
  expect(screen.queryByText('Honey chilli sauce')).not.toBeInTheDocument();
});

test('+ Add to freezer saves the name, portions and a use-by from how long it keeps', async () => {
  render(<Pantry />, { wrapper: MemoryRouter });
  await user().click(await screen.findByRole('button', { name: '+ Add to freezer' }));
  const form = screen.getByRole('form', { name: 'Add to freezer' });
  await user().type(within(form).getByRole('textbox', { name: 'Name' }), 'Chicken stock');
  await user().clear(within(form).getByRole('spinbutton', { name: 'Portions' }));
  await user().type(within(form).getByRole('spinbutton', { name: 'Portions' }), '4');
  expect(within(form).getByRole('spinbutton', { name: 'Keeps for (days)' })).toHaveValue(90);
  await user().click(within(form).getByRole('button', { name: 'Add' }));
  expect(h.repo.addPrepared).toHaveBeenCalledWith('h1', { recipe_id: null, name: 'Chicken stock', portions: 4, location: 'freezer', made_on: '2026-10-17', use_by: '2027-01-15' });
});

test('the cupboard shows staples with have / low / out, and your own items with their amount', async () => {
  render(<Pantry />, { wrapper: MemoryRouter });
  await user().click(await screen.findByRole('tab', { name: 'Cupboard' }));
  const tahini = screen.getByRole('group', { name: 'Tahini' });
  expect(within(tahini).getByRole('button', { name: 'out' })).toHaveAttribute('aria-pressed', 'true');
  await user().click(within(screen.getByRole('group', { name: 'Cumin' })).getByRole('button', { name: 'low' }));
  expect(h.repo.setStaple).toHaveBeenCalledWith('e1', 'low');
  expect(screen.getByText(/1 kg/)).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Remove Basmati rice' }));
  expect(h.repo.removePantryItem).toHaveBeenCalledWith('e3');
  expect(screen.queryByText('Greek yoghurt')).not.toBeInTheDocument();
});

test("We're out of… marks a staple out, or removes your own item", async () => {
  render(<Pantry />, { wrapper: MemoryRouter });
  await screen.findAllByRole('listitem');
  const search = screen.getByRole('searchbox', { name: "We're out of…" });
  await user().type(search, 'cum');
  await user().click(screen.getByRole('button', { name: 'Out of Cumin' }));
  expect(h.repo.setStaple).toHaveBeenCalledWith('e1', 'out');
  await user().clear(search);
  await user().type(search, 'yog');
  await user().click(screen.getByRole('button', { name: 'Out of Greek yoghurt' }));
  expect(h.repo.removePantryItem).toHaveBeenCalledWith('e4');
});

test('+ Add to the fridge saves the name, amount and unit', async () => {
  render(<Pantry />, { wrapper: MemoryRouter });
  await user().click(await screen.findByRole('tab', { name: 'Fridge' }));
  await user().click(screen.getByRole('button', { name: '+ Add to fridge' }));
  const form = screen.getByRole('form', { name: 'Add to fridge' });
  await user().type(within(form).getByRole('textbox', { name: 'Name' }), 'Feta');
  await user().type(within(form).getByRole('textbox', { name: 'Amount' }), '200');
  await user().type(within(form).getByRole('textbox', { name: 'Unit' }), 'g');
  await user().click(within(form).getByRole('button', { name: 'Add' }));
  expect(h.repo.addPantryItem).toHaveBeenCalledWith('h1', 'Feta', 'fridge', 200, 'g');
});

test("while the phone's kept copy is showing, the − / + and have / low / out buttons wait for the fresh numbers", async () => {
  localStorage.setItem('ffp.pantry.h1', JSON.stringify({ prepared: [frozen({})], pantry: [entry({})] }));
  h.repo.listPrepared.mockReturnValue(new Promise(() => {}));
  render(<Pantry />, { wrapper: MemoryRouter });
  expect(screen.getByRole('button', { name: 'One fewer Katsu curry paste' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'One more Katsu curry paste' })).toBeDisabled();
  await user().click(screen.getByRole('tab', { name: 'Cupboard' }));
  expect(within(screen.getByRole('group', { name: 'Cumin' })).getByRole('button', { name: 'low' })).toBeDisabled();
});
