import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '../../lib/household';
import type { MealSlot, PlanWeek } from '../../lib/types';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { NEXT_WEEK } from '../../test/fixtures';
import TodayHour from './TodayHour';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const week = (edit: (s: MealSlot) => MealSlot = (s) => s) => async (_hid: string, ws: string) =>
  (ws === '2026-10-19' ? { week: NEXT_WEEK.week, slots: NEXT_WEEK.slots.map((s) => edit({ ...s })) } : { week: null, slots: [] }) as { week: PlanWeek | null; slots: MealSlot[] };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z')); // Monday: honey chilli chicken tonight, its leftovers for Tuesday's lunch
  sessionStorage.clear();
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
  h.repo.getWeek.mockImplementation(week());
});
afterEach(() => { vi.useRealTimers(); });
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const open = () => render(<TodayHour />, { wrapper: MemoryRouter });

test('the first page shows the hour, the chopping list and what to wash', async () => {
  open();
  expect(await screen.findByRole('heading', { name: "Today's hour · 17:30–18:30" })).toBeInTheDocument();
  const list = screen.getByRole('region', { name: 'Chopping' });
  expect(within(list).getByText('For Almond-Crusted Honey Chilli Chicken')).toBeInTheDocument();
  expect(within(list).getByText(/chicken breast or thigh/)).toBeInTheDocument();
  expect(within(list).getByText(/on its own mat/)).toBeInTheDocument();
  expect(screen.getByText(/To wash: Board, Knife/)).toBeInTheDocument();
  expect(screen.getByText(/minutes hands-on/)).toBeInTheDocument();
});

test('Start goes to the first step, Next steps through, and a timer starts', async () => {
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  expect(screen.getByText('17:30')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Chop everything' })).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Board, knife and bowls into the dishwasher' })).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Start 20-min timer' }));
  expect(screen.getByRole('timer', { name: 'Rice on timer' })).toHaveTextContent('20:00');
});

test("leftovers for tomorrow's lunch are packed after plating up", async () => {
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  while (!screen.queryByRole('heading', { name: 'Plate up' })) await user().click(screen.getByRole('button', { name: 'Next' }));
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: "Pack tomorrow's lunch: Almond-Crusted Honey Chilli Chicken" })).toBeInTheDocument();
});

test("out tonight: no dinner to cook, but tomorrow's night-before breakfast", async () => {
  h.repo.getWeek.mockImplementation(week((s) => (s.date === '2026-10-19' && s.slot === 'dinner' ? { ...s, mode: 'out', recipe_id: null }
    : s.date === '2026-10-20' && s.slot === 'breakfast' ? { ...s, routine_choice: 'Overnight oats' } : s)));
  open();
  expect(await screen.findByText('No dinner to cook tonight')).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Start' }));
  expect(screen.getByRole('heading', { name: 'Make the overnight oats' })).toBeInTheDocument();
});

test('coming back mid-hour keeps your step and your timers', async () => {
  const first = open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  await user().click(screen.getByRole('button', { name: 'Next' }));
  await user().click(screen.getByRole('button', { name: 'Next' }));
  await user().click(screen.getByRole('button', { name: 'Start 20-min timer' }));
  first.unmount();
  open();
  expect(await screen.findByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  expect(screen.getByRole('timer', { name: 'Rice on timer' })).toBeInTheDocument();
});

test("tonight's amounts include the portions for tomorrow's leftovers lunch", async () => {
  open();
  const list = await screen.findByRole('region', { name: 'Chopping' });
  // 3 portions tonight plus 3 for Tuesday's lunch, of a 6-portion recipe: the full 1.2kg.
  expect(within(list).getByText(/1\.2kg chicken breast or thigh/)).toBeInTheDocument();
});
