import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import Staples from './Staples';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); });

test('tapping a staple moves it to the next status and saves', async () => {
  render(<Staples />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Paprika · Have' }));
  expect(h.repo.setStaple).toHaveBeenCalledWith('p-paprika', 'low');
  expect(screen.getByRole('button', { name: 'Paprika · Low' })).toBeInTheDocument();
});

test('a failed save puts the status back and shows an error', async () => {
  h.repo.setStaple.mockRejectedValueOnce(new Error('Failed to fetch'));
  render(<Staples />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Paprika · Have' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save");
  expect(screen.getByRole('button', { name: 'Paprika · Have' })).toBeInTheDocument();
});

test('adding a staple saves it to the list', async () => {
  h.repo.addStaple.mockResolvedValueOnce({ id: 'p-oats', ingredient_id: 'i3', name: 'Porridge oats', status: 'have' });
  render(<Staples />, { wrapper: MemoryRouter });
  await userEvent.type(await screen.findByLabelText('Add a staple'), 'Porridge oats');
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(h.repo.addStaple).toHaveBeenCalledWith('h1', 'Porridge oats');
  expect(await screen.findByRole('button', { name: 'Porridge oats · Have' })).toBeInTheDocument();
});
