import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, PARTNER, TODDLER, YOU, type FakeRepo } from '../../test/fakeRepo';
import { BEEF, CHOW, COD, CURRY, DONER, HONEY, NEXT_WEEK, PENNE, SALMON, TACOS } from '../../test/fixtures';
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
const day = (label: RegExp) => screen.getByRole('dialog', { name: label });
const tile = async (name: string) => screen.findByRole('button', { name: new RegExp(`^${name}`) });

/** Opens a day's sheet from its tile, closing any day that's already open. */
async function openDay(name: string) {
  if (screen.queryByRole('dialog')) await user().keyboard('{Escape}');
  await user().click(await tile(name));
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
  expect(within(day(/Tuesday/)).getByText('Chicken sandwich on sourdough')).toBeInTheDocument();
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
  const prep = within(day(/Friday/)).getByRole('group', { name: 'Prep tonight' });
  expect(prep).toHaveTextContent('For Saturday · 15 min');
});

test('shows a tile per day with breakfast, lunch and dinner', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  const names = ['Monday 19', 'Tuesday 20', 'Wednesday 21', 'Thursday 22', 'Friday 23', 'Saturday 24', 'Sunday 25'];
  for (const n of names) expect(await tile(n)).toBeInTheDocument();
  const mon = await tile('Monday 19');
  expect(within(mon).getByText(HONEY.title)).toBeInTheDocument();
  expect(within(mon).getByText('Packed lunch')).toBeInTheDocument();
  for (const tag of ['Office', 'Prep tonight', 'Cook once ×2']) expect(within(mon).queryByText(tag)).not.toBeInTheDocument();
});

test('the week tile shows no balance chips', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await screen.findByRole('button', { name: 'Approve week' });
  expect(screen.queryByText('2 chicken')).not.toBeInTheDocument();
});

test('tapping a day opens it with its options, and changes show on its tile', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Monday');
  const mon = day(/Monday 19 October/);
  for (const name of ['Swap', 'Out tonight', 'Mark cooked']) expect(within(mon).getByRole('button', { name })).toBeInTheDocument();
  await user().click(within(mon).getByRole('button', { name: 'Out tonight' }));
  await user().keyboard('{Escape}');
  expect(within(await tile('Monday 19')).getByText('Out tonight', { selector: 'span.dinner' })).toBeInTheDocument();
});

test('portions can be changed in the day', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Tue');
  await user().click(within(day(/Tuesday/)).getByRole('button', { name: 'More portions' }));
  let saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(saved[0]).toMatchObject({ date: '2026-10-20', slot: 'dinner', portions: 3.5 });
  for (let i = 0; i < 8; i++) await user().click(within(day(/Tuesday/)).getByRole('button', { name: 'Fewer portions' }));
  saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(saved[0].portions).toBe(0.5);
  expect(within(day(/Tuesday/)).getByRole('button', { name: 'Fewer portions' })).toBeDisabled();
});

test('Escape closes the day and returns focus to its tile', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Wednesday');
  expect(day(/Wednesday/)).toBeInTheDocument();
  await user().keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await tile('Wednesday 21')).toHaveFocus();
  await openDay('Wednesday');
  await user().click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a 5-day plan shows 5 day tiles and the week tile', async () => {
  h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-19'
    ? { week: { ...NEXT_WEEK.week, days: 5 }, slots: NEXT_WEEK.slots.filter((s) => s.date <= '2026-10-23') }
    : { week: null, slots: [] }));
  render(<WeekView />, { wrapper: MemoryRouter });
  expect(await tile('Friday 23')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Saturday/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Approve week' })).toBeInTheDocument();
});

test('breakfast shows the planned choice and records what you had', async () => {
  h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-19'
    ? { ...NEXT_WEEK, slots: NEXT_WEEK.slots.map((s) => (s.slot === 'breakfast' && s.date === '2026-10-22' ? { ...s, reason: 'Baked oats' } : s)) }
    : { week: null, slots: [] }));
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Thu');
  const thu = () => day(/Thursday/);
  for (const name of ['Overnight oats', 'Baked oats', 'Eggs & porridge']) expect(within(thu()).getByRole('button', { name })).toBeInTheDocument();
  expect(within(thu()).getByRole('button', { name: 'Baked oats' })).toHaveAttribute('aria-pressed', 'true');
  await user().click(within(thu()).getByRole('button', { name: 'Eggs & porridge' }));
  expect(within(thu()).getByRole('button', { name: 'Eggs & porridge' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(thu()).getByRole('button', { name: 'Baked oats' })).toHaveAttribute('aria-pressed', 'false');
  const saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(saved[0]).toMatchObject({ slot: 'breakfast', routine_choice: 'Eggs & porridge' });
});

test('the night before an overnight-oats morning, the 8pm prep says so', async () => {
  h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-19'
    ? { ...NEXT_WEEK, slots: NEXT_WEEK.slots.map((s) => (s.slot === 'breakfast' && s.date === '2026-10-21' ? { ...s, reason: 'Overnight oats' } : s)) }
    : { week: null, slots: [] }));
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Tue');
  expect(within(day(/Tuesday/)).getByRole('group', { name: 'Prep tonight' })).toHaveTextContent('Overnight oats for Wednesday');
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

test('marking a dinner cooked asks how the portions were and saves the answer', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Tue');
  const tue = () => day(/Tuesday/);
  await user().click(within(tue()).getByRole('button', { name: 'Mark cooked' }));
  let saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(saved[0]).toMatchObject({ date: '2026-10-20', slot: 'dinner' });
  expect(saved[0].cooked_at).toBeTruthy();
  expect(within(tue()).getByText('How were the portions?')).toBeInTheDocument();
  await user().click(within(tue()).getByRole('button', { name: 'About right' }));
  saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(saved[0]).toMatchObject({ slot: 'dinner', portions_verdict: 'right' });
  expect(within(tue()).getByText('✓ Cooked · portions about right')).toBeInTheDocument();
});

test('a failed save only undoes its own change, and later changes still save', async () => {
  h.repo.saveSlots
    .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('offline')), 50)))
    .mockImplementation(async () => {});
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Mon');
  await user().click(within(day(/Monday/)).getByRole('button', { name: 'Keep' }));
  await openDay('Tue');
  await user().click(within(day(/Tuesday/)).getByRole('button', { name: 'Out tonight' }));
  await act(async () => { vi.advanceTimersByTime(200); });
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that change");
  expect(within(day(/Tuesday/)).getByText('Out tonight')).toBeInTheDocument();
  await openDay('Mon');
  expect(within(day(/Monday/)).getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  const last = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(last.find((s) => s.date === '2026-10-20' && s.slot === 'dinner')!.mode).toBe('out');
});

test('two very quick taps both count and save in order', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Fri');
  const add = within(day(/Friday/)).getByRole('button', { name: 'Add a guest' });
  act(() => { fireEvent.click(add); fireEvent.click(add); });
  expect(within(day(/Friday/)).getByText(/2 guests/)).toBeInTheDocument();
  await act(async () => { vi.advanceTimersByTime(50); });
  const guestsSaved = h.repo.saveSlots.mock.calls.map((c) => c[0].find((s) => s.slot === 'dinner')!.guests);
  expect(guestsSaved).toEqual([1, 2]);
});

test('after the portions verdict, asks Have it again and 👍 makes step photos', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Mon');
  const mon = () => day(/Monday/);
  await user().click(within(mon()).getByRole('button', { name: 'Mark cooked' }));
  expect(within(mon()).queryByText('Have it again?')).not.toBeInTheDocument();
  await user().click(within(mon()).getByRole('button', { name: 'About right' }));
  expect(within(mon()).getByText('Have it again?')).toBeInTheDocument();
  await user().click(within(mon()).getByRole('button', { name: '👍 Have it again' }));
  expect(h.repo.rateRecipe).toHaveBeenCalledWith('r-honey', 'up');
  await vi.waitFor(() => expect(h.repo.generateStepPhoto).toHaveBeenCalledTimes(HONEY.steps.length));
  expect(within(mon()).queryByText('Have it again?')).not.toBeInTheDocument();
});

test('👎 Not for us makes no photos', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Tue');
  const tue = () => day(/Tuesday/);
  await user().click(within(tue()).getByRole('button', { name: 'Mark cooked' }));
  await user().click(within(tue()).getByRole('button', { name: 'About right' }));
  await user().click(within(tue()).getByRole('button', { name: '👎 Not for us' }));
  expect(h.repo.rateRecipe).toHaveBeenCalledWith('r-salmon', 'down');
  expect(h.repo.generateStepPhoto).not.toHaveBeenCalled();
  expect(within(tue()).getByText(/won't be suggested again/)).toBeInTheDocument();
});

test('a recipe that is already rated is not asked about again', async () => {
  h.repo.listRecipes.mockResolvedValue([HONEY, DONER, TACOS, { ...SALMON, rating: 'up' }, PENNE, CHOW, BEEF, COD, CURRY]);
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Tue');
  await user().click(within(day(/Tuesday/)).getByRole('button', { name: 'Mark cooked' }));
  await user().click(within(day(/Tuesday/)).getByRole('button', { name: 'About right' }));
  expect(within(day(/Tuesday/)).queryByText('Have it again?')).not.toBeInTheDocument();
});

test('the day sheet sits above the bottom nav', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Mon');
  const overlay = day(/Monday/).parentElement!;
  expect(overlay.parentElement).toBe(document.body);
  expect(overlay.className).toContain('z-30');
});

describe('Cookidoo on the week tile', () => {
  const approved = { ...NEXT_WEEK, week: { ...NEXT_WEEK.week, status: 'approved' as const, approved_at: '2026-10-16T19:00:00Z' } };
  const run = (status: 'requested' | 'filling' | 'done' | 'failed', summary: string | null = null) =>
    ({ id: 'c1', plan_week_id: 'w-next', status, requested_at: '2026-10-16T19:00:00Z', started_at: null, finished_at: null, summary });
  const cases: [Parameters<typeof run>, RegExp][] = [
    [['requested'], /Cookidoo: waiting for Claude/],
    [['filling'], /Cookidoo: sending…/],
    [['done'], /✓ In Cookidoo/],
    [['failed', 'Cookidoo was signed out'], /Cookidoo didn't sync: Cookidoo was signed out/],
  ];
  for (const [args, text] of cases) {
    test(`shows ${args[0]}`, async () => {
      h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-19' ? approved : { week: null, slots: [] }));
      h.repo.getCookidooRun.mockResolvedValue(run(...args));
      render(<WeekView />, { wrapper: MemoryRouter });
      expect(await screen.findByText(text)).toBeInTheDocument();
    });
  }
  test("a sync that didn't finish can be tried again", async () => {
    h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-19' ? approved : { week: null, slots: [] }));
    h.repo.getCookidooRun.mockResolvedValue(run('failed', 'Cookidoo was signed out'));
    render(<WeekView />, { wrapper: MemoryRouter });
    await user().click(await screen.findByRole('button', { name: 'Try again' }));
    expect(h.repo.requestCookidooSync).toHaveBeenCalledWith('w-next');
    expect(await screen.findByText(/Cookidoo: waiting for Claude/)).toBeInTheDocument();
  });

  test('a draft week shows nothing about Cookidoo, and approving says it is waiting', async () => {
    render(<WeekView />, { wrapper: MemoryRouter });
    await screen.findByRole('button', { name: 'Approve week' });
    expect(screen.queryByText(/Cookidoo/)).not.toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Approve week' }));
    expect(await screen.findByText(/Cookidoo: waiting for Claude/)).toBeInTheDocument();
  });
});
