import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import StartFresh from './StartFresh';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); });

test('says what goes and what stays, asks first, then starts fresh and shows the follow-up', async () => {
  render(<StartFresh />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('heading', { level: 1, name: 'Start fresh' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'What goes' })).toHaveTextContent(/plans.*shopping list.*Spar list.*Sainsbury's trolley.*My Week/s);
  expect(screen.getByRole('region', { name: 'What stays' })).toHaveTextContent(/recipes.*pantry/s);
  await userEvent.click(screen.getByRole('button', { name: 'Start fresh' }));
  expect(h.repo.startFresh).not.toHaveBeenCalled();
  const ask = screen.getByRole('alertdialog', { name: 'Start fresh?' });
  await userEvent.click(within(ask).getByRole('button', { name: 'Yes, start fresh' }));
  expect(h.repo.startFresh).toHaveBeenCalledWith('h1');
  const status = await screen.findByRole('status');
  expect(status).toHaveTextContent(/plans and lists are cleared/);
  expect(status).toHaveTextContent(/Sainsbury's trolley: waiting for Claude/);
  expect(status).toHaveTextContent(/Cookidoo My Week: waiting for Claude/);
});

test('shows how the last start-fresh went', async () => {
  h.repo.getFreshStart.mockResolvedValue({ id: 'f1', household_id: 'h1', requested_at: '2026-10-18T09:00:00Z', my_week: [], trolley_status: 'done', cookidoo_status: 'failed', summary: 'Cookidoo was signed out' });
  render(<StartFresh />, { wrapper: MemoryRouter });
  const status = await screen.findByRole('status');
  expect(status).toHaveTextContent(/Sainsbury's trolley: emptied/);
  expect(status).toHaveTextContent(/Cookidoo My Week: couldn't finish/);
  expect(status).toHaveTextContent('Cookidoo was signed out');
});
