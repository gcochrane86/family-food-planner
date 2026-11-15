import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeRepo, TODDLER, YOU, type FakeRepo } from '../../test/fakeRepo';
import Household from './Household';
import { TACOS } from '../../test/fixtures';
import { validateSettings } from '../../lib/household';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
const auth = vi.hoisted(() => ({ refresh: vi.fn(async () => {}) }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1', refresh: auth.refresh }) }));

beforeEach(() => { h.repo = fakeRepo(); auth.refresh.mockClear(); });

test('joining another household asks first, then switches', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Join another household' }));
  expect(screen.getByText(/You'll leave this household/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Their invite code'), 'abcd234567');
  await userEvent.click(screen.getByRole('button', { name: 'Leave and join' }));
  expect(h.repo.joinHousehold).toHaveBeenCalledWith('ABCD234567');
  expect(auth.refresh).toHaveBeenCalled();
});

test('a wrong code when switching households says so and stays put', async () => {
  h.repo.joinHousehold.mockResolvedValueOnce(null);
  render(<Household />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Join another household' }));
  await userEvent.type(screen.getByLabelText('Their invite code'), 'ABCD234567');
  await userEvent.click(screen.getByRole('button', { name: 'Leave and join' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No household has that code.');
  expect(auth.refresh).not.toHaveBeenCalled();
});

test('shows the household total and the invite code', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  expect(await screen.findByText('Household dinner = 3.0 portions')).toBeInTheDocument();
  expect(screen.getByText('K7Q2XA')).toBeInTheDocument();
});

test('a comma weight saves and updates the total', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  const input = await screen.findByLabelText('Toddler portion weight');
  await userEvent.clear(input);
  await userEvent.type(input, '0,75');
  await userEvent.tab();
  expect(h.repo.saveMember).toHaveBeenCalledWith({ ...TODDLER, portion_weight: 0.75 });
  expect(await screen.findByText('Household dinner = 3.25 portions')).toBeInTheDocument();
});

test('renaming a person saves the new name', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  const name = await screen.findByLabelText('Toddler name');
  await userEvent.clear(name);
  await userEvent.type(name, ' Ellie ');
  await userEvent.tab();
  expect(h.repo.saveMember).toHaveBeenCalledWith({ ...TODDLER, name: 'Ellie' });
  expect(await screen.findByLabelText('Ellie portion weight')).toBeInTheDocument();
});

test('an empty name is not saved', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  const name = await screen.findByLabelText('Toddler name');
  await userEvent.clear(name);
  await userEvent.tab();
  expect(screen.getByText('Enter a name')).toBeInTheDocument();
  expect(h.repo.saveMember).not.toHaveBeenCalled();
});

test('zero is rejected and not saved', async () => {
  render(<Household />, { wrapper: MemoryRouter });
  const input = await screen.findByLabelText('Toddler portion weight');
  await userEvent.clear(input);
  await userEvent.type(input, '0');
  await userEvent.tab();
  expect(screen.getByText('Enter a number between 0.1 and 3')).toBeInTheDocument();
  expect(h.repo.saveMember).not.toHaveBeenCalled();
});

test('a failed save puts the old weight back and shows an error', async () => {
  h.repo.saveMember.mockRejectedValueOnce(new Error('Failed to fetch'));
  render(<Household />, { wrapper: MemoryRouter });
  const input = await screen.findByLabelText('Toddler portion weight');
  await userEvent.clear(input);
  await userEvent.type(input, '1');
  await userEvent.tab();
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save");
  expect(input).toHaveValue('0.5');
  expect(screen.getByText('Household dinner = 3.0 portions')).toBeInTheDocument();
});

test("each person's daily targets save when a box is left; an empty box clears that target", async () => {
  render(<Household />, { wrapper: MemoryRouter });
  const protein = await screen.findByLabelText('You daily protein (g)');
  await userEvent.type(protein, '90');
  await userEvent.tab();
  expect(h.repo.saveMember).toHaveBeenLastCalledWith(expect.objectContaining({ id: YOU.id, targets: { protein_g: 90 } }));
  await userEvent.clear(protein);
  await userEvent.tab();
  expect(h.repo.saveMember).toHaveBeenLastCalledWith(expect.objectContaining({ id: YOU.id, targets: {} }));
});

test("a target that can't be saved goes back to what was saved, and a typo says so", async () => {
  h.repo.saveMember.mockRejectedValueOnce(new Error('offline'));
  render(<Household />, { wrapper: MemoryRouter });
  const protein = await screen.findByLabelText('You daily protein (g)');
  await userEvent.type(protein, '90');
  await userEvent.tab();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(protein).toHaveValue('');
  const fat = screen.getByLabelText('You daily fat (g)');
  await userEvent.type(fat, 'abc');
  await userEvent.tab();
  expect(screen.getByText('Enter a number of 0 or more, or leave it empty.')).toBeInTheDocument();
});

describe("each person's meal partners", () => {
  const egg = { ...TACOS, id: 'r-egg', slug: 'boiled-egg', title: 'Boiled egg', kind: 'snack' as const, toddler_ok: true, status: 'active' as const };
  const nuts = { ...TACOS, id: 'r-nuts', slug: 'apple-almonds', title: 'Apple & almonds', kind: 'snack' as const, toddler_ok: false, status: 'active' as const };
  beforeEach(() => {
    h.repo.listRecipes.mockResolvedValue([TACOS, egg, nuts]);
    h.repo.getSettings.mockResolvedValue({ ...validateSettings({}), breakfasts: ['Overnight oats'], lunches: ['Chicken sandwich'],
      meal_partners: { 'Overnight oats': { [YOU.id]: [{ recipe: 'boiled-egg', qty: 2 }] } } });
  });

  test('listed per person, added and removed', async () => {
    render(<Household />, { wrapper: MemoryRouter });
    expect(await screen.findByText('With Overnight oats: 2 × Boiled egg')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('You partner meal'), 'Chicken sandwich');
    await userEvent.selectOptions(screen.getByLabelText('You partner snack'), 'apple-almonds');
    await userEvent.clear(screen.getByLabelText('You partner how many'));
    await userEvent.type(screen.getByLabelText('You partner how many'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Add a partner for You' }));
    expect(h.repo.saveMealPartners).toHaveBeenLastCalledWith('h1', {
      'Overnight oats': { [YOU.id]: [{ recipe: 'boiled-egg', qty: 2 }] }, 'Chicken sandwich': { [YOU.id]: [{ recipe: 'apple-almonds', qty: 1 }] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Remove Boiled egg with Overnight oats for You' }));
    expect(h.repo.saveMealPartners).toHaveBeenLastCalledWith('h1', {
      'Chicken sandwich': { [YOU.id]: [{ recipe: 'apple-almonds', qty: 1 }] },
    });
  });

  test("removing a person removes their meal partners", async () => {
    render(<Household />, { wrapper: MemoryRouter });
    await screen.findByText('With Overnight oats: 2 × Boiled egg');
    const removes = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(removes[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove You' }));
    expect(h.repo.saveMealPartners).toHaveBeenLastCalledWith('h1', {});
  });

  test("the toddler is only offered toddler-friendly snacks", async () => {
    render(<Household />, { wrapper: MemoryRouter });
    const snack = await screen.findByLabelText('Toddler partner snack');
    expect(within(snack).queryByRole('option', { name: 'Apple & almonds' })).not.toBeInTheDocument();
    expect(within(snack).getByRole('option', { name: 'Boiled egg' })).toBeInTheDocument();
  });
});
