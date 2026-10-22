import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import OtherShops from './OtherShops';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const base = { weekday_dinner_max_min: 30, default_plan_days: 7 as const, shops_per_week: 2 as const, delivery_slots: [], delivery_pass: false, use_nectar: false, adventure: 1, breakfasts: [], lunches: [] };
beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue({ ...base, other_shops: [
    { name: 'Fishmonger', buys: ['salmon', 'cod'], day: 3, sometimes: false, weeks: [] },
    { name: 'Farm shop', buys: ['eggs', 'milk'], day: null, sometimes: true, weeks: [] },
  ] });
});

test("lists what each shop sells, and adds and removes ingredients", async () => {
  render(<OtherShops />, { wrapper: MemoryRouter });
  const fish = await screen.findByRole('region', { name: 'Fishmonger' });
  expect(within(fish).getAllByRole('listitem').map((li) => li.textContent?.replace('×', '').trim())).toEqual(['salmon', 'cod']);
  await userEvent.type(within(fish).getByRole('textbox', { name: 'Add an ingredient' }), 'Hake, mussels{Enter}');
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({
    other_shops: [expect.objectContaining({ name: 'Fishmonger', buys: ['salmon', 'cod', 'hake', 'mussels'] }), expect.objectContaining({ name: 'Farm shop' })],
  }));
  await userEvent.click(within(fish).getByRole('button', { name: 'Remove cod' }));
  expect(h.repo.saveSettings).toHaveBeenLastCalledWith('h1', expect.objectContaining({
    other_shops: [expect.objectContaining({ buys: ['salmon', 'hake', 'mussels'] }), expect.objectContaining({ name: 'Farm shop', buys: ['eggs', 'milk'] })],
  }));
  expect(within(fish).queryByText('cod')).not.toBeInTheDocument();
});

test("a shop says when you go, and the last ingredient can't be removed", async () => {
  h.repo.getSettings.mockResolvedValue({ ...base, other_shops: [{ name: 'Farm shop', buys: ['eggs'], day: null, sometimes: true, weeks: [] }] });
  render(<OtherShops />, { wrapper: MemoryRouter });
  const farm = await screen.findByRole('region', { name: 'Farm shop' });
  expect(farm).toHaveTextContent('Only some weeks');
  expect(within(farm).getByRole('button', { name: 'Remove eggs' })).toBeDisabled();
});
