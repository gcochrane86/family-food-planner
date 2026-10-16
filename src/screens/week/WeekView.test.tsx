import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, PARTNER, TODDLER, YOU, type FakeRepo } from '../../test/fakeRepo';
import { BEEF, CHOW, COD, CURRY, DONER, HONEY, PENNE, SALMON, TACOS } from '../../test/fixtures';
import WeekView from './WeekView';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-16T19:30:00Z')); // Friday evening, after the proposal
  h.repo = fakeRepo();
  h.repo.listRecipes.mockResolvedValue([HONEY, DONER, TACOS, SALMON, PENNE, CHOW, BEEF, COD, CURRY]);
  h.repo.listMembers.mockResolvedValue([YOU, PARTNER, TODDLER]);
  h.repo.getSettings.mockResolvedValue({ weekday_dinner_max_min: 30, default_plan_days: 7, shops_per_week: 2, delivery_slots: [], delivery_pass: false, use_nectar: false, adventure: 1 });
});
afterEach(() => { vi.useRealTimers(); });

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const day = (label: RegExp) => screen.getByRole('region', { name: label });

async function openDay(name: string) {
  await user().click(await screen.findByRole('tab', { name: new RegExp(name) }));
}

test('a draft week shows the review banner and can be approved', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  expect(await screen.findByText("Next week's menu is ready")).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Approve week' }));
  expect(h.repo.approveWeek).toHaveBeenCalledWith('w-next');
  expect(await screen.findByText('✓ Approved')).toBeInTheDocument();
});

test('swap offers 3 alternatives and saves the choice as locked', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Tue');
  const tue = day(/Tuesday/);
  await user().click(within(tue).getByRole('button', { name: 'Swap' }));
  const options = within(tue).getAllByRole('button', { name: /^Use / });
  expect(options).toHaveLength(3);
  await user().click(options[0]);
  const saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  const dinner = saved.find((s) => s.date === '2026-10-20' && s.slot === 'dinner')!;
  expect(dinner.locked).toBe(true);
  expect(dinner.recipe_id).not.toBe('r-salmon');
});

test('out tonight on the cook-once dinner sends the next lunch back to its routine', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Mon');
  await user().click(within(day(/Monday/)).getByRole('button', { name: 'Out tonight' }));
  expect(within(day(/Monday/)).getByText('Out tonight')).toBeInTheDocument();
  await openDay('Tue');
  expect(within(day(/Tuesday/)).getByText('Home lunch')).toBeInTheDocument();
  const saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(saved.find((s) => s.date === '2026-10-20' && s.slot === 'lunch')!.mode).toBe('routine');
});

test('guests +2 shows the new portions', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Fri');
  await user().click(within(day(/Friday/)).getByRole('button', { name: 'Add a guest' }));
  await user().click(within(day(/Friday/)).getByRole('button', { name: 'Add a guest' }));
  expect(within(day(/Friday/)).getByText(/5.5 portions · 2 guests/)).toBeInTheDocument();
});

test('the 8pm prep row shows tomorrow’s prep', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Fri');
  const prep = within(day(/Friday/)).getByRole('group', { name: '8pm prep' });
  expect(prep).toHaveTextContent('For Saturday · 15 min');
});

test('the day strip switches days on the phone', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('region', { name: /Monday/ })).toBeInTheDocument();
  await openDay('Wed');
  expect(screen.getByRole('region', { name: /Wednesday/ })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /Monday/ })).not.toBeInTheDocument();
});

test('Monday breakfast is fixed; other days record what you had', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Mon');
  expect(within(day(/Monday/)).getByText(/Overnight oats/)).toBeInTheDocument();
  await openDay('Thu');
  await user().click(within(day(/Thursday/)).getByRole('button', { name: 'Porridge' }));
  expect(within(day(/Thursday/)).getByRole('button', { name: 'Porridge' })).toHaveAttribute('aria-pressed', 'true');
  const saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(saved[0]).toMatchObject({ slot: 'breakfast', routine_choice: 'Porridge' });
});

test('with no plan yet it says when the first menu arrives and can propose one now', async () => {
  h.repo.getWeek.mockResolvedValue({ week: null, slots: [] });
  render(<WeekView />, { wrapper: MemoryRouter });
  expect(await screen.findByText('Your first menu arrives Friday at 7pm')).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Propose now' }));
  expect(h.repo.proposeNow).toHaveBeenCalledWith('2026-10-19');
});

test('on Saturday an unapproved week reminds you of the deadline', async () => {
  vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));
  render(<WeekView />, { wrapper: MemoryRouter });
  expect(await screen.findByText(/Approve by 2pm today for Sunday's delivery/)).toBeInTheDocument();
});
