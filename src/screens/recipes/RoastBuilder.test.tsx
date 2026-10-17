import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY, TACOS } from '../../test/fixtures';
import { ROAST_PARTS } from '../../test/roastParts';
import RoastBuilder from './RoastBuilder';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-18T09:00:00Z')); // Sunday
  h.repo = fakeRepo();
  h.repo.listRecipes.mockResolvedValue([HONEY, TACOS, ...ROAST_PARTS]);
});
afterEach(() => { vi.useRealTimers(); });
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const sides = () => screen.getByRole('group', { name: 'Sides' });

test('beef starts with the owner\'s sides ticked, and only beef-friendly extras on offer', async () => {
  render(<RoastBuilder />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('button', { name: 'Beef' })).toHaveAttribute('aria-pressed', 'true');
  const on = within(sides()).getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'));
  expect(on).toEqual(['Goose-Fat Roasties', 'Yorkshire Puddings', 'Whipped Mash', 'Honey-Citrus Carrots', 'Bay-Roasted Parsnips', 'Cauliflower Cheese', 'Proper Gravy']);
  expect(within(sides()).getByRole('button', { name: 'Horseradish Cream' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(sides()).queryByRole('button', { name: 'Fresh Mint Sauce' })).not.toBeInTheDocument();
});

test('lamb offers mint sauce and not horseradish', async () => {
  render(<RoastBuilder />, { wrapper: MemoryRouter });
  await user().click(await screen.findByRole('button', { name: 'Lamb' }));
  expect(within(sides()).getByRole('button', { name: 'Fresh Mint Sauce' })).toBeInTheDocument();
  expect(within(sides()).queryByRole('button', { name: 'Horseradish Cream' })).not.toBeInTheDocument();
});

test('the plan is laid out by phase with times, and moves with the serve time', async () => {
  render(<RoastBuilder />, { wrapper: MemoryRouter });
  const countdown = await screen.findByRole('region', { name: 'Service countdown' });
  expect(within(countdown).getByRole('listitem', { name: /12:42 Goose-Fat Roasties: Roast/ })).toHaveTextContent(/Oven [12] · 210°C fan/);
  const serve = screen.getByLabelText('Eat at');
  await user().clear(serve);
  await user().type(serve, '14:00');
  expect(within(screen.getByRole('region', { name: 'Service countdown' })).getByRole('listitem', { name: /13:12 Goose-Fat Roasties: Roast/ })).toBeInTheDocument();
});

test('a warning shows when the ovens are over-full', async () => {
  render(<RoastBuilder />, { wrapper: MemoryRouter });
  await screen.findByRole('region', { name: 'Service countdown' });
  for (let i = 0; i < 30; i++) await user().click(screen.getByRole('button', { name: 'More people' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Too much for the ovens/);
});

test('add to a day saves the roast on that dinner', async () => {
  render(<RoastBuilder />, { wrapper: MemoryRouter });
  await screen.findByRole('region', { name: 'Service countdown' });
  await user().selectOptions(screen.getByRole('combobox', { name: 'Day' }), '2026-10-25');
  await user().click(screen.getByRole('button', { name: 'Add to the week' }));
  expect(h.repo.addRoast).toHaveBeenCalledWith('h1', '2026-10-25', expect.objectContaining({ main: 'beef', people: 6, serve: '13:30' }), 'r-roast-brisket');
  expect(await screen.findByText(/Added to Sunday 25 October/)).toBeInTheDocument();
});
