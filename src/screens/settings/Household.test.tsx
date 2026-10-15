import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeRepo, TODDLER, type FakeRepo } from '../../test/fakeRepo';
import Household from './Household';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); });

test('shows the household total and the invite code', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  expect(await screen.findByText('Household dinner = 3.0 portions')).toBeInTheDocument();
  expect(screen.getByText('K7Q2XA')).toBeInTheDocument();
});

test('a comma weight saves and updates the total', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  const input = await screen.findByLabelText('Toddler portion weight');
  await userEvent.clear(input);
  await userEvent.type(input, '0,75');
  await userEvent.tab();
  expect(h.repo.saveMember).toHaveBeenCalledWith({ ...TODDLER, portion_weight: 0.75 });
  expect(await screen.findByText('Household dinner = 3.25 portions')).toBeInTheDocument();
});

test('zero is rejected and not saved', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  const input = await screen.findByLabelText('Toddler portion weight');
  await userEvent.clear(input);
  await userEvent.type(input, '0');
  await userEvent.tab();
  expect(screen.getByText('Enter a number between 0.1 and 3')).toBeInTheDocument();
  expect(h.repo.saveMember).not.toHaveBeenCalled();
});

test('a failed save puts the old weight back and shows an error', async () => {
  h.repo.saveMember.mockRejectedValueOnce(new Error('Failed to fetch'));
  render(<Household />, { wrapper: MemoryRouter });
  const input = await screen.findByLabelText('Toddler portion weight');
  await userEvent.clear(input);
  await userEvent.type(input, '1');
  await userEvent.tab();
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save");
  expect(input).toHaveValue('0.5');
  expect(screen.getByText('Household dinner = 3.0 portions')).toBeInTheDocument();
});
