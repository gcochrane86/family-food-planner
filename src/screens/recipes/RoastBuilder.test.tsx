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

test('opened from a planned roast, it starts with that combination', async () => {
  render(<MemoryRouter initialEntries={['/recipes/roast?main=lamb&sides=goose-fat-roasties,mint-sauce&people=8&serve=14:00']}><RoastBuilder /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: 'Lamb' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(sides()).getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'))).toEqual(['Goose-Fat Roasties', 'Fresh Mint Sauce']);
  expect(screen.getByLabelText('Eat at')).toHaveValue('14:00');
  expect(screen.getByText('8')).toBeInTheDocument();
});

test("with no serve time there's no plan, and nothing to add", async () => {
  render(<RoastBuilder />, { wrapper: MemoryRouter });
  await screen.findByRole('region', { name: 'Service countdown' });
  await user().clear(screen.getByLabelText('Eat at'));
  expect(screen.getByRole('button', { name: 'Add to the week' })).toBeDisabled();
});

describe('Christmas dinner', () => {
  test('offers turkey and ham, either or both, with sides that suit them, cooked over three days', async () => {
    render(<RoastBuilder />, { wrapper: MemoryRouter });
    await user().click(await screen.findByRole('tab', { name: 'Christmas dinner' }));
    expect(screen.queryByRole('button', { name: 'Beef' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turkey' })).toHaveAttribute('aria-pressed', 'true');
    await user().click(screen.getByRole('button', { name: 'Ham' }));
    expect(screen.getByRole('button', { name: 'Ham' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sides()).queryByRole('button', { name: 'Fresh Mint Sauce' })).not.toBeInTheDocument();
    expect(within(sides()).getByRole('button', { name: 'Goose-Fat Roasties' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('region', { name: '23 December' })).getByRole('listitem', { name: /18:00 Glazed Ham: Soak the gammon/ })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Christmas Eve' })).getByRole('listitem', { name: /18:00 Roast Turkey Crown: Dry-brine the turkey/ })).toBeInTheDocument();
    // At least one meat stays picked.
    await user().click(screen.getByRole('button', { name: 'Ham' }));
    await user().click(screen.getByRole('button', { name: 'Turkey' }));
    expect(screen.getByRole('button', { name: 'Turkey' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('adds it to Christmas Day with both meats', async () => {
    render(<RoastBuilder />, { wrapper: MemoryRouter });
    await user().click(await screen.findByRole('tab', { name: 'Christmas dinner' }));
    await user().click(screen.getByRole('button', { name: 'Ham' }));
    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveValue('2026-12-25');
    await user().click(screen.getByRole('button', { name: 'Add to the week' }));
    expect(h.repo.addRoast).toHaveBeenCalledWith('h1', '2026-12-25',
      expect.objectContaining({ occasion: 'christmas', main: 'turkey', mains: ['turkey', 'ham'], extras: ['christmas-ham'] }), 'r-christmas-turkey');
  });

  test('opened from a planned Christmas dinner, it starts with that combination', async () => {
    render(<MemoryRouter initialEntries={['/recipes/roast?occasion=christmas&main=turkey&mains=turkey,ham&sides=goose-fat-roasties&people=12&serve=14:00']}><RoastBuilder /></MemoryRouter>);
    expect(await screen.findByRole('tab', { name: 'Christmas dinner' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Ham' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});

describe('beef cuts', () => {
  const cuts = () => screen.getByRole('group', { name: 'Cut' });

  test('beef offers each cut; slow cuts are slow-cooked, and a roasting cut asks how you like it, medium first', async () => {
    render(<RoastBuilder />, { wrapper: MemoryRouter });
    expect(within(await screen.findByRole('group', { name: 'Cut' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Overnight-Braised Brisket', 'Silverside', 'Ribeye']);
    expect(within(cuts()).getByRole('button', { name: 'Overnight-Braised Brisket' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Slow-cooked')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'How do you like it?' })).not.toBeInTheDocument();
    await user().click(within(cuts()).getByRole('button', { name: 'Ribeye' }));
    const how = screen.getByRole('radiogroup', { name: 'How do you like it?' });
    expect(within(how).getByRole('radio', { name: 'Medium' })).toBeChecked();
    expect(within(screen.getByRole('region', { name: 'Out and about' })).getByRole('listitem', { name: /11:50 Roast Rib-Eye of Beef: Roast/ })).toHaveTextContent(/to 58°C/);
    await user().click(within(how).getByRole('radio', { name: 'Well done' }));
    expect(within(screen.getByRole('region', { name: 'Out and about' })).getByRole('listitem', { name: /11:20 Roast Rib-Eye of Beef: Roast/ })).toHaveTextContent(/to 68°C/);
  });

  test('adds the chosen cut and doneness to the day', async () => {
    render(<RoastBuilder />, { wrapper: MemoryRouter });
    await user().click(within(await screen.findByRole('group', { name: 'Cut' })).getByRole('button', { name: 'Ribeye' }));
    await user().click(screen.getByRole('radio', { name: 'Medium rare' }));
    await user().selectOptions(screen.getByRole('combobox', { name: 'Day' }), '2026-10-25');
    await user().click(screen.getByRole('button', { name: 'Add to the week' }));
    expect(h.repo.addRoast).toHaveBeenCalledWith('h1', '2026-10-25', expect.objectContaining({ main: 'beef', cut: 'roast-ribeye', doneness: 'medium_rare' }), 'r-roast-ribeye');
  });
});

test('Cook view opens the plan step by step, with this exact roast', async () => {
  render(<RoastBuilder />, { wrapper: MemoryRouter });
  await user().click(within(await screen.findByRole('group', { name: 'Cut' })).getByRole('button', { name: 'Ribeye' }));
  expect(screen.getByRole('link', { name: 'Cook view' }).getAttribute('href')).toMatch(/^\/recipes\/roast\/cook\?main=beef&sides=.*&cut=roast-ribeye&doneness=medium&prep=08%3A45$/);
});
