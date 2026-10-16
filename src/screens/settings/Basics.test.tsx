import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import Basics from './Basics';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));
beforeEach(() => { h.repo = fakeRepo(); });

test('lists the weekly basics with amounts and delivery', async () => {
  render(<Basics />, { wrapper: MemoryRouter });
  const eggs = await screen.findByRole('group', { name: 'Eggs' });
  expect(within(eggs).getByLabelText('Eggs amount')).toHaveValue('18');
  expect(within(eggs).getByLabelText('Eggs delivery')).toHaveValue('sun');
  expect(within(screen.getByRole('group', { name: 'Whole milk' })).getByLabelText('Whole milk amount')).toHaveValue('3000');
});

test('changing an amount saves it', async () => {
  render(<Basics />, { wrapper: MemoryRouter });
  const amount = await screen.findByLabelText('Eggs amount');
  await userEvent.clear(amount);
  await userEvent.type(amount, '12');
  await userEvent.tab();
  expect(h.repo.saveBasic).toHaveBeenCalledWith(expect.objectContaining({ id: 'b-eggs', qty: 12 }));
});

test('changing the delivery saves it', async () => {
  render(<Basics />, { wrapper: MemoryRouter });
  await userEvent.selectOptions(await screen.findByLabelText('Eggs delivery'), 'split');
  expect(h.repo.saveBasic).toHaveBeenCalledWith(expect.objectContaining({ id: 'b-eggs', delivery: 'split' }));
});

test('adding a basic', async () => {
  render(<Basics />, { wrapper: MemoryRouter });
  await userEvent.type(await screen.findByLabelText('New basic'), 'Bananas');
  await userEvent.type(screen.getByLabelText('New basic amount'), '7');
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(h.repo.saveBasic).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bananas', qty: 7, unit: '', delivery: 'split', household_id: 'h1' }));
  expect(await screen.findByRole('group', { name: 'Bananas' })).toBeInTheDocument();
});

test('removing asks first', async () => {
  render(<Basics />, { wrapper: MemoryRouter });
  const eggs = await screen.findByRole('group', { name: 'Eggs' });
  await userEvent.click(within(eggs).getByRole('button', { name: 'Remove' }));
  expect(h.repo.deleteBasic).not.toHaveBeenCalled();
  await userEvent.click(within(eggs).getByRole('button', { name: 'Remove Eggs' }));
  expect(h.repo.deleteBasic).toHaveBeenCalledWith('b-eggs');
});
