import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, PARTNER, TODDLER, YOU, type FakeRepo } from '../../test/fakeRepo';
import { BEEF, CHOW, COD, CURRY, DONER, HONEY, NEXT_WEEK, PENNE, SALMON, TACOS } from '../../test/fixtures';
import type { MealSlot } from '../../lib/types';
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

describe('swipe to swap', () => {
  async function openSwap() {
    render(<WeekView />, { wrapper: MemoryRouter });
    await openDay('Tue');
    await user().click(within(day(/Tuesday/)).getByRole('button', { name: 'Swap' }));
    return screen.getByRole('dialog', { name: "Swap Tuesday's dinner" });
  }
  const top = (stack: HTMLElement) => within(stack).getAllByRole('group', { name: /^Suggestion/ }).at(-1)!;

  test('✓ chooses the top card and saves it as locked', async () => {
    const stack = await openSwap();
    expect(within(stack).getByText(/^1 of \d/)).toBeInTheDocument();
    const title = within(top(stack)).getByRole('heading').textContent;
    await user().click(within(stack).getByRole('button', { name: 'Choose' }));
    const dinner = h.repo.saveSlots.mock.calls.at(-1)![0].find((s) => s.date === '2026-10-20' && s.slot === 'dinner')!;
    expect(dinner.locked).toBe(true);
    expect(dinner.recipe_id).not.toBe('r-salmon');
    expect(screen.queryByRole('dialog', { name: /Swap/ })).not.toBeInTheDocument();
    expect(within(day(/Tuesday/)).getAllByText(title!).length).toBeGreaterThan(0);
  });

  test('✕ skips to the next card', async () => {
    const stack = await openSwap();
    const first = within(top(stack)).getByRole('heading').textContent;
    await user().click(within(stack).getByRole('button', { name: 'Skip' }));
    expect(within(stack).getByText(/^2 of \d/)).toBeInTheDocument();
    expect(within(top(stack)).getByRole('heading').textContent).not.toBe(first);
    expect(h.repo.saveSlots).not.toHaveBeenCalled();
  });

  test('a sideways swipe right chooses; a mostly-vertical drag does nothing', async () => {
    const stack = await openSwap();
    fireEvent.touchStart(top(stack), { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(top(stack), { changedTouches: [{ clientX: 140, clientY: 400 }] });
    await act(async () => { vi.advanceTimersByTime(50); });
    expect(h.repo.saveSlots).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /Swap/ })).toBeInTheDocument();
    fireEvent.touchStart(top(stack), { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(top(stack), { changedTouches: [{ clientX: 280, clientY: 110 }] });
    await vi.waitFor(() => expect(h.repo.saveSlots).toHaveBeenCalled());
  });

  test('after the last card, browse all recipes and pick one', async () => {
    const stack = await openSwap();
    while (within(stack).queryByRole('button', { name: 'Skip' })) await user().click(within(stack).getByRole('button', { name: 'Skip' }));
    await user().click(within(stack).getByRole('button', { name: 'Browse all recipes' }));
    await user().type(within(stack).getByRole('searchbox', { name: 'Search recipes' }), 'tacos');
    await user().click(within(stack).getByRole('button', { name: TACOS.title }));
    const dinner = h.repo.saveSlots.mock.calls.at(-1)![0].find((s) => s.date === '2026-10-20' && s.slot === 'dinner')!;
    expect(dinner.recipe_id).toBe('r-tacos');
  });

  test('search is there from the start: pick exactly the recipe you want, or go back to the suggestions', async () => {
    const stack = await openSwap();
    await user().click(within(stack).getByRole('button', { name: 'Search recipes' }));
    expect(within(stack).getByRole('searchbox', { name: 'Search recipes' })).toHaveFocus();
    await user().click(within(stack).getByRole('button', { name: 'Suggestions' }));
    expect(within(stack).getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    await user().click(within(stack).getByRole('button', { name: 'Search recipes' }));
    await user().type(within(stack).getByRole('searchbox', { name: 'Search recipes' }), 'tacos');
    await user().click(within(stack).getByRole('button', { name: TACOS.title }));
    const dinner = h.repo.saveSlots.mock.calls.at(-1)![0].find((s) => s.date === '2026-10-20' && s.slot === 'dinner')!;
    expect(dinner.recipe_id).toBe('r-tacos');
  });

  test('Escape closes the stack', async () => {
    await openSwap();
    await user().keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /Swap/ })).not.toBeInTheDocument();
  });
});

test('out tonight on the cook-once dinner sends the next lunch back to its routine', async () => {
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Mon');
  await user().click(within(day(/Monday/)).getByRole('button', { name: 'Out tonight' }));
  expect(within(day(/Monday/)).getByRole('button', { name: 'Plan a dinner' })).toBeInTheDocument();
  await openDay('Tue');
  expect(within(day(/Tuesday/)).getByText('Chicken sandwich')).toBeInTheDocument();
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
  const more = within(mon).getByRole('region', { name: 'More options' });
  for (const name of ['Swap', 'Out tonight', 'Add a guest', 'More portions']) expect(within(more).getByRole('button', { name })).toBeInTheDocument();
  expect(within(mon).queryByRole('button', { name: /Mark cooked|Keep/ })).not.toBeInTheDocument();
  expect(within(mon).queryByText(/Prep tonight/)).not.toBeInTheDocument();
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

test('a failed save only undoes its own change, and later changes still save', async () => {
  h.repo.saveSlots
    .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('offline')), 50)))
    .mockImplementation(async () => {});
  render(<WeekView />, { wrapper: MemoryRouter });
  await openDay('Mon');
  await user().click(within(day(/Monday/)).getByRole('button', { name: 'Add a guest' }));
  await openDay('Tue');
  await user().click(within(day(/Tuesday/)).getByRole('button', { name: 'Out tonight' }));
  await act(async () => { vi.advanceTimersByTime(200); });
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that change");
  expect(within(day(/Tuesday/)).getByRole('button', { name: 'Plan a dinner' })).toBeInTheDocument();
  await openDay('Mon');
  expect(within(day(/Monday/)).getByText(/^6(\.0)? portions/)).toBeInTheDocument();
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

describe('the day pop-up', () => {
  test('each meal shows its photo, or a placeholder while there is none', async () => {
    h.repo.listRecipes.mockResolvedValue([HONEY, DONER, TACOS, { ...SALMON, hero_image_path: 'h1/hero/salmon.jpg' }, PENNE, CHOW, BEEF, COD, CURRY,
      { ...TACOS, id: 'r-bo', slug: 'baked-oats', title: 'Baked Oats', kind: 'component', hero_image_path: 'h1/hero/bo.jpg' }]);
    h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-19'
      ? { ...NEXT_WEEK, slots: NEXT_WEEK.slots.map((s) => (s.slot === 'breakfast' && s.date === '2026-10-20' ? { ...s, reason: 'Baked oats' } : s)) }
      : { week: null, slots: [] }));
    render(<WeekView />, { wrapper: MemoryRouter });
    await openDay('Tue');
    const tue = day(/Tuesday/);
    expect(within(tue).getByRole('img', { name: 'Baked oats' })).toHaveAttribute('src', 'https://img.test/h1/hero/bo.jpg');
    expect(within(tue).getByRole('img', { name: SALMON.title })).toHaveAttribute('src', 'https://img.test/h1/hero/salmon.jpg');
    expect(within(tue).getByText(/Photo of Leftover Almond-Crusted Honey Chilli Chicken/)).toBeInTheDocument();
  });

  test('lunch offers leftovers or a sandwich when last night reheats well, and remembers the pick', async () => {
    h.repo.listRecipes.mockResolvedValue([HONEY, DONER, TACOS, SALMON, PENNE, CHOW, { ...BEEF, reheats_well: true }, COD, CURRY]);
    render(<WeekView />, { wrapper: MemoryRouter });
    await openDay('Thu');
    const thu = () => day(/Thursday/);
    const leftover = within(thu()).getByRole('button', { name: /Leftover Soy & Ginger Beef/ });
    const sandwich = within(thu()).getByRole('button', { name: /Chicken sandwich/ });
    expect(leftover).toHaveAttribute('aria-pressed', 'true');
    await user().click(sandwich);
    expect(within(thu()).getByRole('button', { name: /Chicken sandwich/ })).toHaveAttribute('aria-pressed', 'true');
    const saved = h.repo.saveSlots.mock.calls.at(-1)![0];
    expect(saved[0]).toMatchObject({ date: '2026-10-22', slot: 'lunch', routine_choice: 'Chicken sandwich' });
  });

  test('a home lunch offers every lunch option, chicken sandwich first, and saves the pick', async () => {
    render(<WeekView />, { wrapper: MemoryRouter });
    await openDay('Thu');
    const thu = () => day(/Thursday/);
    expect(within(thu()).queryByRole('button', { name: /Leftover/ })).not.toBeInTheDocument();
    for (const name of ['Chicken sandwich', 'Roast beef sandwich', 'Egg sandwich', 'Tuna & sweetcorn sandwich', 'Mexican beef poke bowl']) {
      expect(within(thu()).getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(within(thu()).getByRole('button', { name: /Chicken sandwich/ })).toHaveAttribute('aria-pressed', 'true');
    await user().click(within(thu()).getByRole('button', { name: /Mexican beef poke bowl/ }));
    expect(within(thu()).getByRole('button', { name: /Mexican beef poke bowl/ })).toHaveAttribute('aria-pressed', 'true');
    expect(h.repo.saveSlots.mock.calls.at(-1)![0][0]).toMatchObject({ date: '2026-10-22', slot: 'lunch', routine_choice: 'Mexican beef poke bowl' });
    await user().keyboard('{Escape}');
    expect(within(await tile('Thursday 22')).getByText('Mexican beef poke bowl')).toBeInTheDocument();
  });

  test('an office day shows the packed lunch', async () => {
    render(<WeekView />, { wrapper: MemoryRouter });
    await openDay('Mon');
    expect(within(day(/Monday/)).getByText('Burrito bowl (packed)')).toBeInTheDocument();
  });
});

describe("How was last night's dinner?", () => {
  // Friday 16 Oct, 10am: last night is Thursday 15th, in "this week", while the screen shows next week.
  const THIS_WEEK = {
    week: { ...NEXT_WEEK.week, id: 'w-this', week_start: '2026-10-12', status: 'approved' as const },
    slots: [{ ...NEXT_WEEK.slots.find((s) => s.slot === 'dinner' && s.date === '2026-10-19')!, id: 'thu-dinner', plan_week_id: 'w-this', date: '2026-10-15', portions: 3 }],
  };
  function weeks(thu: Partial<MealSlot> = {}) {
    h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-12'
      ? { ...THIS_WEEK, slots: THIS_WEEK.slots.map((s) => ({ ...s, ...thu })) }
      : start === '2026-10-19' ? JSON.parse(JSON.stringify(NEXT_WEEK)) : { week: null, slots: [] }));
  }
  beforeEach(() => { vi.setSystemTime(new Date('2026-10-16T09:00:00Z')); localStorage.clear(); });

  test("asks about last night's dinner even while next week is showing", async () => {
    weeks();
    render(<WeekView />, { wrapper: MemoryRouter });
    expect(await screen.findByText("How was last night's Almond-Crusted Honey Chilli Chicken?")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Next week' })).toBeInTheDocument();
  });

  test('the answers save to that dinner, and 👍 makes step photos', async () => {
    weeks();
    render(<WeekView />, { wrapper: MemoryRouter });
    const card = await screen.findByRole('region', { name: /How was last night/ });
    await user().click(within(card).getByRole('button', { name: 'About right' }));
    await vi.waitFor(() => expect(h.repo.saveSlots).toHaveBeenCalled());
    const saved = h.repo.saveSlots.mock.calls.at(-1)![0][0];
    expect(saved).toMatchObject({ date: '2026-10-15', slot: 'dinner', plan_week_id: 'w-this', portions_verdict: 'right' });
    expect(saved.cooked_at).toBeTruthy();
    await user().click(within(card).getByRole('button', { name: '👍 Have it again' }));
    expect(h.repo.rateRecipe).toHaveBeenCalledWith('r-honey', 'up');
    await vi.waitFor(() => expect(h.repo.generateStepPhoto).toHaveBeenCalled());
    expect(await screen.findByText(/Thanks/)).toBeInTheDocument();
  });

  test('× hides it, and it stays hidden next time', async () => {
    weeks();
    const { unmount } = render(<WeekView />, { wrapper: MemoryRouter });
    const card = await screen.findByRole('region', { name: /How was last night/ });
    await user().click(within(card).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: /How was last night/ })).not.toBeInTheDocument();
    unmount();
    render(<WeekView />, { wrapper: MemoryRouter });
    await screen.findByRole('heading', { name: 'Next week' });
    expect(screen.queryByRole('region', { name: /How was last night/ })).not.toBeInTheDocument();
  });

  test('not asked when already answered, or when you were out', async () => {
    h.repo.listRecipes.mockResolvedValue([{ ...HONEY, rating: 'up' }, DONER, TACOS, SALMON, PENNE, CHOW, BEEF, COD, CURRY]);
    weeks({ portions_verdict: 'right' });
    const { unmount } = render(<WeekView />, { wrapper: MemoryRouter });
    await screen.findByRole('heading', { name: 'Next week' });
    expect(screen.queryByRole('region', { name: /How was last night/ })).not.toBeInTheDocument();
    unmount();
    weeks({ mode: 'out' });
    render(<WeekView />, { wrapper: MemoryRouter });
    await screen.findByRole('heading', { name: 'Next week' });
    expect(screen.queryByRole('region', { name: /How was last night/ })).not.toBeInTheDocument();
  });
});

describe('review fixes', () => {
  test('the lunch tile and the day agree after last night changes', async () => {
    h.repo.listRecipes.mockResolvedValue([HONEY, DONER, TACOS, SALMON, PENNE, CHOW, { ...BEEF, reheats_well: true }, COD, CURRY]);
    render(<WeekView />, { wrapper: MemoryRouter });
    expect(within(await tile('Thursday 22')).getByText('Leftovers')).toBeInTheDocument();
    await openDay('Wed');
    await user().click(within(day(/Wednesday/)).getByRole('button', { name: 'Out tonight' }));
    await user().keyboard('{Escape}');
    expect(within(await tile('Thursday 22')).getByText('Chicken sandwich')).toBeInTheDocument();
    await openDay('Thu');
    expect(within(day(/Thursday/)).queryByRole('button', { name: /Leftover/ })).not.toBeInTheDocument();
  });

  test('a failed save after switching weeks only undoes that week', async () => {
    h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-19' ? JSON.parse(JSON.stringify(NEXT_WEEK))
      : start === '2026-10-12' ? { week: { ...NEXT_WEEK.week, id: 'w-this', week_start: '2026-10-12', status: 'approved' }, slots: [] } : { week: null, slots: [] }));
    h.repo.saveSlots.mockImplementationOnce(() => new Promise((_r, reject) => setTimeout(() => reject(new Error('offline')), 50)));
    render(<WeekView />, { wrapper: MemoryRouter });
    await openDay('Mon');
    await user().click(within(day(/Monday/)).getByRole('button', { name: 'Add a guest' }));
    await user().keyboard('{Escape}');
    await user().click(screen.getByRole('tab', { name: 'This week' }));
    await act(async () => { vi.advanceTimersByTime(200); });
    await user().click(screen.getByRole('tab', { name: 'Next week' }));
    expect(within(await tile('Monday 19')).getByText(HONEY.title)).toBeInTheDocument();
  });

  test('the swap screen takes focus, and gives it back when closed', async () => {
    render(<WeekView />, { wrapper: MemoryRouter });
    await openDay('Tue');
    const swap = within(day(/Tuesday/)).getByRole('button', { name: 'Swap' });
    await user().click(swap);
    expect(screen.getByRole('button', { name: 'Choose' })).toHaveFocus();
    await user().keyboard('{Escape}');
    expect(within(day(/Tuesday/)).getByRole('button', { name: 'Swap' })).toHaveFocus();
  });
});

describe('feedback card failures', () => {
  const THIS_WEEK = {
    week: { ...NEXT_WEEK.week, id: 'w-this', week_start: '2026-10-12', status: 'approved' as const },
    slots: [{ ...NEXT_WEEK.slots.find((s) => s.slot === 'dinner' && s.date === '2026-10-19')!, id: 'thu-dinner', plan_week_id: 'w-this', date: '2026-10-15', portions: 3 }],
  };
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-16T09:00:00Z')); localStorage.clear();
    h.repo.getWeek.mockImplementation(async (_hid: string, start: string) => (start === '2026-10-12' ? JSON.parse(JSON.stringify(THIS_WEEK))
      : start === '2026-10-19' ? JSON.parse(JSON.stringify(NEXT_WEEK)) : { week: null, slots: [] }));
  });

  test('a 👍 that fails to save is not thanked and can be tried again', async () => {
    h.repo.rateRecipe.mockRejectedValueOnce(new Error('offline'));
    render(<WeekView />, { wrapper: MemoryRouter });
    const card = await screen.findByRole('region', { name: /How was last night/ });
    await user().click(within(card).getByRole('button', { name: 'About right' }));
    await user().click(within(card).getByRole('button', { name: '👍 Have it again' }));
    await vi.waitFor(() => expect(h.repo.rateRecipe).toHaveBeenCalled());
    expect(screen.queryByText(/Thanks/)).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '👍 Have it again' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('a portions answer that fails to save is cleared', async () => {
    h.repo.saveSlots.mockRejectedValueOnce(new Error('offline'));
    render(<WeekView />, { wrapper: MemoryRouter });
    const card = await screen.findByRole('region', { name: /How was last night/ });
    await user().click(within(card).getByRole('button', { name: 'About right' }));
    await vi.waitFor(() => expect(within(card).getByRole('button', { name: 'About right' })).toHaveAttribute('aria-pressed', 'false'));
  });
});
