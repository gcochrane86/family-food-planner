import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { DONER, HONEY, NEXT_WEEK } from '../../test/fixtures';
import type { MealSlot, RecipeDetail } from '../../lib/types';
import ShopList from './ShopList';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const approved = () => {
  const w = JSON.parse(JSON.stringify(NEXT_WEEK));
  w.week.status = 'approved';
  return w;
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-16T19:30:00Z'));
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue({ weekday_dinner_max_min: 30, default_plan_days: 7, shops_per_week: 2, delivery_slots: [], delivery_pass: false, use_nectar: false, adventure: 1 });
  h.repo.listStaples.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); });
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

test('an approved week gives Sunday and Tuesday lists with what each item is for', async () => {
  h.repo.getWeek.mockImplementation(async (_h: string, ws: string) => (ws === '2026-10-19' ? approved() : { week: null, slots: [] }));
  render(<ShopList />, { wrapper: MemoryRouter });
  const sunday = await screen.findByRole('region', { name: 'Sunday delivery' });
  const chicken = within(sunday).getByText(/1.2kg chicken breast or thigh/).closest('label')!;
  expect(chicken).toHaveTextContent('for Mon Almond-Crusted Honey Chilli Chicken');
  const tuesday = screen.getByRole('region', { name: 'Tuesday delivery' });
  // Saturday's doner reheats well, so it's bought for Sunday's leftover lunch too.
  expect(within(tuesday).getByText(/1kg lamb mince/)).toBeInTheDocument();
});

test('ticking an item saves it', async () => {
  h.repo.getWeek.mockImplementation(async (_h: string, ws: string) => (ws === '2026-10-19' ? approved() : { week: null, slots: [] }));
  render(<ShopList />, { wrapper: MemoryRouter });
  await user().click(await screen.findByRole('checkbox', { name: /chicken breast or thigh/ }));
  expect(h.repo.setTick).toHaveBeenCalledWith('w-next', 'sun', 'chicken breast or thigh|g@1200', true);
  expect(screen.getByRole('checkbox', { name: /chicken breast or thigh/ })).toBeChecked();
});

test('a draft week asks you to approve it first', async () => {
  render(<ShopList />, { wrapper: MemoryRouter });
  expect(await screen.findByText("Approve next week's menu to make the list.")).toBeInTheDocument();
});

test('a ticked item un-ticks itself when its quantity changes, so nothing is under-bought', async () => {
  h.repo.getWeek.mockImplementation(async (_h: string, ws: string) => (ws === '2026-10-19' ? approved() : { week: null, slots: [] }));
  // Ticked earlier when the list said 1kg; it now says 1.2kg (e.g. after guests were added).
  h.repo.getTicks.mockResolvedValue([
    { delivery: 'sun', item_key: 'chicken breast or thigh|g@1000', ticked: true },
    { delivery: 'tue', item_key: 'lamb mince|g@1000', ticked: true },
  ]);
  render(<ShopList />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('checkbox', { name: /chicken breast or thigh/ })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /lamb mince/ })).toBeChecked();
});

describe("Ready for Sainsbury's", () => {
  beforeEach(() => {
    h.repo.getWeek.mockImplementation(async (_h: string, ws: string) => (ws === '2026-10-19' ? approved() : { week: null, slots: [] }));
  });

  test('each delivery can be marked ready, and then says it is waiting for Claude', async () => {
    render(<ShopList />, { wrapper: MemoryRouter });
    const sunday = await screen.findByRole('region', { name: 'Sunday delivery' });
    await user().click(within(sunday).getByRole('button', { name: "Ready for Sainsbury's" }));
    expect(h.repo.requestRun).toHaveBeenCalledWith('w-next', 'sun', false);
    expect(await within(sunday).findByText(/Waiting for Claude. It starts within 15 minutes while your Mac is on/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Tuesday delivery' })).getByRole('button', { name: "Ready for Sainsbury's" })).toBeInTheDocument();
  });

  test('a finished run shows its summary', async () => {
    h.repo.getRuns.mockResolvedValue([{ id: 'r1', plan_week_id: 'w-next', delivery: 'sun', status: 'done', requested_at: '2026-10-17T09:00:00Z', finished_at: '2026-10-17T09:20:00Z', summary: '24 items added; swaps: none' }]);
    render(<ShopList />, { wrapper: MemoryRouter });
    const sunday = await screen.findByRole('region', { name: 'Sunday delivery' });
    expect(within(sunday).getByText(/Basket filled/)).toBeInTheDocument();
    expect(within(sunday).getByText('24 items added; swaps: none')).toBeInTheDocument();
    expect(within(sunday).getByRole('button', { name: 'Fill again (tops up only)' })).toBeInTheDocument();
    expect(within(sunday).queryByRole('button', { name: "Ready for Sainsbury's" })).not.toBeInTheDocument();
  });

  test('after a fill, Empty and refill asks first, then asks Claude to empty the trolley and fill it again', async () => {
    h.repo.getRuns.mockResolvedValue([{ id: 'r1', plan_week_id: 'w-next', delivery: 'sun', status: 'done', requested_at: '2026-10-17T09:00:00Z', finished_at: '2026-10-17T09:20:00Z', summary: '24 items added' }]);
    h.repo.requestRun.mockResolvedValueOnce({ id: 'r1', plan_week_id: 'w-next', delivery: 'sun', status: 'requested', empty_first: true, requested_at: '2026-10-17T10:00:00Z', finished_at: null, summary: null });
    render(<ShopList />, { wrapper: MemoryRouter });
    const sunday = await screen.findByRole('region', { name: 'Sunday delivery' });
    await user().click(within(sunday).getByRole('button', { name: 'Empty and refill' }));
    expect(h.repo.requestRun).not.toHaveBeenCalled();
    const confirm = within(sunday).getByRole('group', { name: 'Empty the trolley?' });
    expect(confirm).toHaveTextContent('removes everything in your Sainsbury\'s trolley, including things you added yourself');
    await user().click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(within(sunday).queryByRole('group', { name: 'Empty the trolley?' })).not.toBeInTheDocument();
    await user().click(within(sunday).getByRole('button', { name: 'Empty and refill' }));
    await user().click(within(sunday).getByRole('button', { name: 'Yes, empty and refill' }));
    expect(h.repo.requestRun).toHaveBeenCalledWith('w-next', 'sun', true);
    expect(await within(sunday).findByText(/Waiting for Claude to empty and refill your trolley/)).toBeInTheDocument();
  });

  test('an empty-and-refill under way says so', async () => {
    h.repo.getRuns.mockResolvedValue([{ id: 'r1', plan_week_id: 'w-next', delivery: 'sun', status: 'filling', empty_first: true, requested_at: '2026-10-17T09:00:00Z', finished_at: null, summary: null }]);
    render(<ShopList />, { wrapper: MemoryRouter });
    const sunday = await screen.findByRole('region', { name: 'Sunday delivery' });
    expect(within(sunday).getByText(/Claude is emptying and refilling your trolley now/)).toBeInTheDocument();
  });

  test('before the first fill there is no Empty and refill', async () => {
    render(<ShopList />, { wrapper: MemoryRouter });
    const sunday = await screen.findByRole('region', { name: 'Sunday delivery' });
    expect(within(sunday).queryByRole('button', { name: 'Empty and refill' })).not.toBeInTheDocument();
  });

  test('a run being filled says so and offers no button', async () => {
    h.repo.getRuns.mockResolvedValue([{ id: 'r1', plan_week_id: 'w-next', delivery: 'sun', status: 'filling', requested_at: '2026-10-17T09:00:00Z', finished_at: null, summary: null }]);
    render(<ShopList />, { wrapper: MemoryRouter });
    const sunday = await screen.findByRole('region', { name: 'Sunday delivery' });
    expect(within(sunday).getByText(/Claude is filling your basket now/)).toBeInTheDocument();
    expect(within(sunday).queryByRole('button', { name: /Sainsbury's|Fill again/ })).not.toBeInTheDocument();
  });

  test('an item with a saved Sainsbury’s product shows it', async () => {
    h.repo.listProducts.mockResolvedValue([{ household_id: 'h1', item_key: 'chicken breast or thigh|g', product_name: "Sainsbury's British Chicken Breast Fillets 640g", product_url: null, pack_size: 640, pack_unit: 'g', price: 5.5, pinned: false }]);
    render(<ShopList />, { wrapper: MemoryRouter });
    const chicken = (await screen.findByText(/1.2kg chicken breast or thigh/)).closest('label')!;
    expect(chicken).toHaveTextContent("Sainsbury's British Chicken Breast Fillets 640g × 2");
  });
});

describe('Check the freezer first', () => {
  const sauce = { name: 'Honey chilli sauce', group: 'The meat', steps: [], makes: 4, freezer_days: 90 };
  const frozenWeek = () => {
    const w = approved();
    w.slots = w.slots.map((s: MealSlot) => (s.slot === 'dinner' && s.date === '2026-10-19' ? { ...s, batch: 'frozen' } : s));
    return w;
  };
  const item = (id: string, portions: number, use_by: string) => ({ id, household_id: 'h1', recipe_id: 'r-honey', name: 'Honey chilli sauce', portions, location: 'freezer' as const, made_on: '2026-09-01', use_by });
  beforeEach(() => {
    h.repo.getWeek.mockImplementation(async (_h: string, ws: string) => (ws === '2026-10-19' ? frozenWeek() : { week: null, slots: [] }));
    h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? { ...HONEY, batch: sauce } : ({ 'r-doner': DONER } as Record<string, RecipeDetail>)[id] ?? null));
    h.repo.listPrepared.mockResolvedValue([item('late', 2, '2026-12-30'), item('soon', 1, '2026-11-01'), item('old', 3, '2026-10-01')]);
  });

  test('asks about each frozen dinner and holds the Sainsbury\'s buttons until answered', async () => {
    render(<ShopList />, { wrapper: MemoryRouter });
    const check = await screen.findByRole('region', { name: 'Check the freezer first' });
    expect(check).toHaveTextContent('Honey chilli sauce · for Mon');
    for (const b of screen.getAllByRole('button', { name: "Ready for Sainsbury's" })) expect(b).toBeDisabled();
    expect(screen.queryByText(/chicken breast or thigh/)).not.toBeInTheDocument();
  });

  test("It's there takes the portion with the soonest in-date use-by, and frees the buttons", async () => {
    render(<ShopList />, { wrapper: MemoryRouter });
    const check = await screen.findByRole('region', { name: 'Check the freezer first' });
    await user().click(within(check).getByRole('button', { name: "It's there" }));
    expect(h.repo.setPreparedPortions).toHaveBeenCalledWith('soon', 0);
    expect(h.repo.saveSlots.mock.calls.at(-1)![0][0]).toMatchObject({ date: '2026-10-19', slot: 'dinner', batch: 'frozen_ok' });
    expect(screen.queryByRole('region', { name: 'Check the freezer first' })).not.toBeInTheDocument();
    for (const b of screen.getAllByRole('button', { name: "Ready for Sainsbury's" })) expect(b).toBeEnabled();
  });

  test('Not there puts the ingredients back on the list and clears that freezer entry', async () => {
    render(<ShopList />, { wrapper: MemoryRouter });
    const check = await screen.findByRole('region', { name: 'Check the freezer first' });
    await user().click(within(check).getByRole('button', { name: 'Not there' }));
    expect(h.repo.saveSlots.mock.calls.at(-1)![0][0]).toMatchObject({ date: '2026-10-19', slot: 'dinner', batch: null });
    for (const id of ['late', 'soon', 'old']) expect(h.repo.setPreparedPortions).toHaveBeenCalledWith(id, 0);
    expect(await screen.findByText(/chicken breast or thigh/)).toBeInTheDocument();
  });
});

describe('freezer check, review fixes', () => {
  const sauce = { name: 'Honey chilli sauce', group: 'The meat', steps: [], makes: 4, freezer_days: 90 };
  const twoFrozen = () => {
    const w = approved();
    w.slots = w.slots.map((s: MealSlot) => (s.slot === 'dinner' && (s.date === '2026-10-19' || s.date === '2026-10-22') ? { ...s, recipe_id: 'r-honey', batch: 'frozen' } : s));
    return w;
  };
  beforeEach(() => {
    h.repo.getWeek.mockImplementation(async (_h: string, ws: string) => (ws === '2026-10-19' ? twoFrozen() : { week: null, slots: [] }));
    h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? { ...HONEY, batch: sauce } : ({ 'r-doner': DONER } as Record<string, RecipeDetail>)[id] ?? null));
    h.repo.listPrepared.mockResolvedValue([{ id: 'p', household_id: 'h1', recipe_id: 'r-honey', name: 'Honey chilli sauce', portions: 2, location: 'freezer' as const, made_on: '2026-10-01', use_by: '2026-12-30' }]);
  });

  test("two It's there answers take two portions, and both dinners stay answered", async () => {
    render(<ShopList />, { wrapper: MemoryRouter });
    const check = await screen.findByRole('region', { name: 'Check the freezer first' });
    await user().click(within(check).getAllByRole('button', { name: "It's there" })[0]);
    await user().click(within(screen.getByRole('region', { name: 'Check the freezer first' })).getByRole('button', { name: "It's there" }));
    expect(h.repo.setPreparedPortions.mock.calls).toEqual([['p', 1], ['p', 0]]);
    expect(screen.queryByRole('region', { name: 'Check the freezer first' })).not.toBeInTheDocument();
  });

  test('if taking the portion fails, the dinner is not marked checked', async () => {
    h.repo.setPreparedPortions.mockRejectedValueOnce(new Error('offline'));
    render(<ShopList />, { wrapper: MemoryRouter });
    const check = await screen.findByRole('region', { name: 'Check the freezer first' });
    await user().click(within(check).getAllByRole('button', { name: "It's there" })[0]);
    expect(h.repo.saveSlots).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
