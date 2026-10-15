import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeRepo, YOU, type FakeRepo } from '../../test/fakeRepo';
import WeekPattern from './WeekPattern';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); });

test('Monday shows as an office day for You', async () => {
  render(<WeekPattern />, { wrapper: MemoryRouter });
  const you = await screen.findByRole('group', { name: 'You' });
  expect(within(you).getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(you).getByRole('button', { name: 'Wed' })).toHaveAttribute('aria-pressed', 'false');
});

test('toggling Wednesday saves an office day', async () => {
  render(<WeekPattern />, { wrapper: MemoryRouter });
  const you = await screen.findByRole('group', { name: 'You' });
  await userEvent.click(within(you).getByRole('button', { name: 'Wed' }));
  expect(h.repo.setOffice).toHaveBeenCalledWith(YOU.id, 2, true);
  expect(within(you).getByRole('button', { name: 'Wed' })).toHaveAttribute('aria-pressed', 'true');
});

test('only adults get office days', async () => {
  render(<WeekPattern />, { wrapper: MemoryRouter });
  await screen.findByRole('group', { name: 'You' });
  expect(screen.queryByRole('group', { name: 'Toddler' })).not.toBeInTheDocument();
});
