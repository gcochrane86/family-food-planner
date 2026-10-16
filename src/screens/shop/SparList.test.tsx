import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import SparList from './SparList';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));
beforeEach(() => { h.repo = fakeRepo(); });

test('adding an item shows it in the list', async () => {
  render(<SparList />);
  await userEvent.type(await screen.findByLabelText('Add to the Spar list'), 'Coriander');
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(h.repo.addQuick).toHaveBeenCalledWith('h1', 'Coriander');
  expect(await screen.findByRole('checkbox', { name: 'Coriander' })).toBeInTheDocument();
});

test('an empty name cannot be added', async () => {
  render(<SparList />);
  await userEvent.type(await screen.findByLabelText('Add to the Spar list'), '   ');
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
});

test('a very long name is trimmed to 80 characters', async () => {
  render(<SparList />);
  await userEvent.type(await screen.findByLabelText('Add to the Spar list'), 'x'.repeat(90));
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(h.repo.addQuick).toHaveBeenCalledWith('h1', 'x'.repeat(80));
});

test('ticking marks it done, and Clear done removes done items', async () => {
  h.repo.listQuick.mockResolvedValue([
    { id: 'q1', household_id: 'h1', name: 'Milk', note: null, done: false, created_at: '2026-10-16T08:00:00Z' },
    { id: 'q2', household_id: 'h1', name: 'Limes', note: null, done: false, created_at: '2026-10-16T08:01:00Z' },
  ]);
  render(<SparList />);
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Milk' }));
  expect(h.repo.setQuickDone).toHaveBeenCalledWith('q1', true);
  expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Clear done' }));
  expect(h.repo.clearQuickDone).toHaveBeenCalledWith('h1');
  expect(screen.queryByRole('checkbox', { name: 'Milk' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Limes' })).toBeInTheDocument();
});
