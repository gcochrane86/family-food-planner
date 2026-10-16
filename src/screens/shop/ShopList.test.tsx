import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { NEXT_WEEK } from '../../test/fixtures';
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
  expect(within(tuesday).getByText(/500g lamb mince/)).toBeInTheDocument();
});

test('ticking an item saves it', async () => {
  h.repo.getWeek.mockImplementation(async (_h: string, ws: string) => (ws === '2026-10-19' ? approved() : { week: null, slots: [] }));
  render(<ShopList />, { wrapper: MemoryRouter });
  await user().click(await screen.findByRole('checkbox', { name: /chicken breast or thigh/ }));
  expect(h.repo.setTick).toHaveBeenCalledWith('w-next', 'sun', 'chicken breast or thigh|g', true);
  expect(screen.getByRole('checkbox', { name: /chicken breast or thigh/ })).toBeChecked();
});

test('a draft week asks you to approve it first', async () => {
  render(<ShopList />, { wrapper: MemoryRouter });
  expect(await screen.findByText("Approve next week's menu to make the list.")).toBeInTheDocument();
});
