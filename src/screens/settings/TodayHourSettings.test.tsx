import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '../../lib/household';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import TodayHourSettings from './TodayHourSettings';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, breakfasts: ['Overnight oats', 'Porridge', 'Eggs'], breakfast_ahead: ['Overnight oats'] });
});

test('saves a new start time', async () => {
  render(<TodayHourSettings />, { wrapper: MemoryRouter });
  const start = await screen.findByLabelText('Starts at');
  expect(start).toHaveValue('17:30');
  await userEvent.clear(start);
  await userEvent.type(start, '18:00');
  await userEvent.tab();
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({ hour_start: '18:00' }));
});

test('each breakfast has a "Made the night before" switch', async () => {
  render(<TodayHourSettings />, { wrapper: MemoryRouter });
  const oats = await screen.findByRole('switch', { name: 'Overnight oats: made the night before' });
  expect(oats).toBeChecked();
  const porridge = screen.getByRole('switch', { name: 'Porridge: made the night before' });
  expect(porridge).not.toBeChecked();
  await userEvent.click(porridge);
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({ breakfast_ahead: ['Overnight oats', 'Porridge'] }));
});

test('sets TM7 bowls to 2', async () => {
  render(<TodayHourSettings />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('radio', { name: '2 bowls' }));
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({ tm7_bowls: 2 }));
});
