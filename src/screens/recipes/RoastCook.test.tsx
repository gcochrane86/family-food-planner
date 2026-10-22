import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY, TACOS } from '../../test/fixtures';
import { ROAST_PARTS } from '../../test/roastParts';
import type { RecipeDetail } from '../../lib/types';
import RoastCook from './RoastCook';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-25T08:00:00Z'));
  sessionStorage.clear();
  h.repo = fakeRepo();
  h.repo.listRecipes.mockResolvedValue([HONEY, TACOS, ...ROAST_PARTS]);
  h.repo.getRecipe.mockImplementation(async (id: string) => {
    const r = ROAST_PARTS.find((p) => p.id === id)!;
    return { ...r, ingredients: [], steps: id === 'r-roast-ribeye'
      ? [{ id: 's1', recipe_id: id, phase: 'finish', position: 1, at_minute: 0, title: 'Roast', body: 'Roast until the MEATER reads your target.', machine: 'oven', settings: null, timer_minutes: 70, image_path: null }]
      : [] } as unknown as RecipeDetail;
  });
});
afterEach(() => { vi.useRealTimers(); });
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const open = (q: string) => render(
  <MemoryRouter initialEntries={[`/recipes/roast/cook?${q}`]}>
    <Routes>
      <Route path="/recipes/roast/cook" element={<RoastCook />} />
      <Route path="/recipes/roast" element={<p>Builder</p>} />
    </Routes>
  </MemoryRouter>,
);

test('goes through the plan one step at a time, in time order, with what to do', async () => {
  open('main=beef&cut=roast-ribeye&doneness=medium&sides=roast-gravy&people=8&serve=13:30');
  const step = await screen.findByRole('region', { name: /^Step 1 of \d+/ });
  expect(step).toHaveTextContent('Out and about');
  expect(step).toHaveTextContent('11:50');
  expect(step).toHaveTextContent('Roast Rib-Eye of Beef: Roast');
  expect(step).toHaveTextContent(/APO · 180°C · to 58°C|Oven 1 · 180°C fan · to 58°C/);
  expect(step).toHaveTextContent('Roast until the MEATER reads your target.');
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('region', { name: /^Step 2 of/ })).toHaveTextContent('Rest');
  await user().click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('region', { name: /^Step 1 of/ })).toBeInTheDocument();
});

test("a step's timer runs for as long as the step takes", async () => {
  open('main=beef&cut=roast-ribeye&doneness=medium&sides=roast-gravy&people=8&serve=13:30');
  await user().click(await screen.findByRole('button', { name: 'Start 80-min timer' }));
  await act(async () => { vi.advanceTimersByTime(61_000); });
  expect(screen.getByRole('timer', { name: /Roast Rib-Eye of Beef: Roast timer/ })).toHaveTextContent('78:59');
});

test('Close goes back to the builder with the same roast', async () => {
  open('main=beef&sides=roast-gravy&people=8&serve=13:30');
  await user().click(await screen.findByRole('link', { name: 'Close' }));
  expect(screen.getByText('Builder')).toBeInTheDocument();
});
