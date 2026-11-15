import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '../../lib/household';
import { fakeRepo, YOU, type FakeRepo } from '../../test/fakeRepo';
import UsualWeek from './UsualWeek';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, prep_days: [6] });
});

const page = () => render(<UsualWeek />, { wrapper: MemoryRouter });

test('Monday shows as an office day for You, Monday to Friday only', async () => {
  page();
  const you = await screen.findByRole('group', { name: 'You' });
  expect(within(you).getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(you).getByRole('button', { name: 'Wed' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(you).queryByRole('button', { name: 'Sat' })).not.toBeInTheDocument();
});

test('toggling Wednesday saves an office day', async () => {
  page();
  const you = await screen.findByRole('group', { name: 'You' });
  await userEvent.click(within(you).getByRole('button', { name: 'Wed' }));
  expect(h.repo.setOffice).toHaveBeenCalledWith(YOU.id, 2, true);
  expect(within(you).getByRole('button', { name: 'Wed' })).toHaveAttribute('aria-pressed', 'true');
});

test('only adults get office days', async () => {
  page();
  await screen.findByRole('group', { name: 'You' });
  expect(screen.queryByRole('group', { name: 'Toddler' })).not.toBeInTheDocument();
});

test('longer prep days: Sunday is on, and Wednesday can be added', async () => {
  page();
  const prep = await screen.findByRole('group', { name: 'Longer prep days' });
  expect(within(prep).getByRole('button', { name: 'Sun' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(prep).getByRole('button', { name: 'Wed' }));
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({ prep_days: [2, 6] }));
});

test("each evening's time to cook saves", async () => {
  page();
  const wed = await screen.findByLabelText('Wednesday (minutes)');
  expect(wed).toHaveValue(60);
  await userEvent.clear(wed);
  await userEvent.type(wed, '120');
  await userEvent.tab();
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({ cooking_minutes: expect.objectContaining({ wed: 120 }) }));
});

test('the weeknight limit is one of 20, 30, 45 or 60 minutes', async () => {
  page();
  const limit = await screen.findByRole('group', { name: 'Weeknight dinners take at most' });
  expect(within(limit).getByRole('button', { name: '30 min' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(limit).getByRole('button', { name: '45 min' }));
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({ weekday_dinner_max_min: 45 }));
});

test('new recipes from Claude: a counter from 0 to 7', async () => {
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'More new recipes' }));
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({ adventure: DEFAULT_SETTINGS.adventure + 1 }));
});
