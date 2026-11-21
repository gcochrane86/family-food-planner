import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import RecipeLibrary from './RecipeLibrary';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); localStorage.clear(); });

test('lists every recipe as a link to its card', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('link', { name: /Almond-Crusted Honey Chilli Chicken/ })).toHaveAttribute('href', '/recipes/r-honey');
  expect(screen.getByRole('link', { name: /Gourmet Lamb Doner/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Miso Glazed Aubergine Tacos/ })).toBeInTheDocument();
});

const mix = async () => {
  const base = (await h.repo.listRecipes())[0];
  h.repo.listRecipes.mockResolvedValue([
    { ...base, id: 'r-pesto', title: 'Pesto Chicken', kind: 'meal', tags: ['chicken', 'one-pot', 'weeknight'] },
    { ...base, id: 'r-curry', title: 'Chickpea Curry', kind: 'meal', tags: ['Freezes well'] },
    { ...base, id: 'r-lamb', title: 'Roast Leg of Lamb', kind: 'component', component_role: 'protein', tags: ['Roast'] },
    { ...base, id: 'r-gravy', title: 'Proper Gravy', kind: 'component', component_role: 'sauce', tags: ['Roast'] },
    { ...base, id: 'r-oats', title: 'Overnight Oats', kind: 'component', component_role: null, tags: ['Breakfast'] },
    { ...base, id: 'r-poke', title: 'Salmon Poke Bowl', kind: 'component', component_role: null, tags: ['Lunch'] },
    { ...base, id: 'r-balls', title: 'Energy Balls', kind: 'snack', tags: ['Snack'] },
  ]);
};
const shownTitles = () => screen.queryAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/recipes/r-')).map((a) => a.textContent ?? '');

test('the total count shows at the top, and how many a group or search leaves', async () => {
  await mix();
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Pesto Chicken/ });
  expect(screen.getByText('7 recipes')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /^Weeknight dinners/ }));
  expect(screen.getByText('2 of 7 recipes')).toBeInTheDocument();
});

test('each group chip shows how many recipes it has', async () => {
  await mix();
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Pesto Chicken/ });
  for (const [label, n] of [['All', 7], ['Weeknight dinners', 2], ['Roasts & centrepieces', 1], ['Sides & sauces', 1], ['Breakfasts', 1], ['Lunches', 1], ['Snacks & treats', 1]] as const)
    expect(screen.getByRole('button', { name: `${label} ${n}` })).toBeInTheDocument();
});

test('a group shows only its recipes, one group at a time, and All shows everything again', async () => {
  await mix();
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Pesto Chicken/ });
  await userEvent.click(screen.getByRole('button', { name: /^Roasts & centrepieces/ }));
  expect(shownTitles()).toEqual([expect.stringMatching(/Roast Leg of Lamb/)]);
  await userEvent.click(screen.getByRole('button', { name: /^Sides & sauces/ }));
  expect(shownTitles()).toEqual([expect.stringMatching(/Proper Gravy/)]);
  expect(screen.getByRole('button', { name: /^Roasts & centrepieces/ })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(screen.getByRole('button', { name: /^All/ }));
  expect(shownTitles()).toHaveLength(7);
});

test('One-pan appears under Weeknight dinners and narrows it', async () => {
  await mix();
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Pesto Chicken/ });
  expect(screen.queryByRole('button', { name: /^One-pan/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /^Weeknight dinners/ }));
  await userEvent.click(screen.getByRole('button', { name: 'One-pan 1' }));
  expect(shownTitles()).toEqual([expect.stringMatching(/Pesto Chicken/)]);
  await userEvent.click(screen.getByRole('button', { name: /^Breakfasts/ }));
  expect(screen.queryByRole('button', { name: /^One-pan/ })).not.toBeInTheDocument();
  expect(shownTitles()).toEqual([expect.stringMatching(/Overnight Oats/)]);
});

test('missing photos are offered with the count and cost, and only made after confirming', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  expect(await screen.findByText(/2 recipes have no photo yet/)).toHaveTextContent('about £0.05');
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  expect(h.repo.generateHero).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Make 2 photos' }));
  expect(h.repo.generateHero).toHaveBeenCalledTimes(2);
  expect(h.repo.generateHero).toHaveBeenCalledWith('r-honey');
  expect(h.repo.generateHero).toHaveBeenCalledWith('r-doner');
  expect(await screen.findByText('All recipes have photos.')).toBeInTheDocument();
});

test('making photos stops at the first failure and says why', async () => {
  h.repo.generateHero.mockRejectedValueOnce(new Error('Google quota reached'));
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Make photos' }));
  await userEvent.click(screen.getByRole('button', { name: 'Make 2 photos' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Stopped after 0 of 2: Google quota reached');
  expect(h.repo.generateHero).toHaveBeenCalledTimes(1);
});

test('an empty library says so', async () => {
  h.repo.listRecipes.mockResolvedValueOnce([]);
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  expect(await screen.findByText('No recipes yet')).toBeInTheDocument();
});

test('photos carry no "AI photo" label', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Miso Glazed Aubergine Tacos/ });
  expect(screen.queryByText(/AI photo/)).not.toBeInTheDocument();
});

test('search narrows the list by title, ignoring case, and works with the filters', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Honey Chilli/ });
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'lamb');
  expect(screen.getByRole('link', { name: /Lamb Doner/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Honey Chilli/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /^Snacks & treats/ }));
  expect(screen.getByText('No recipes match.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /^All/ }));
  await userEvent.clear(screen.getByRole('searchbox', { name: 'Search recipes' }));
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'TACOS');
  expect(screen.getByRole('link', { name: /Tacos/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Lamb Doner/ })).not.toBeInTheDocument();
});

test('library cards ask for small photos', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Miso Glazed Aubergine Tacos/ });
  expect(h.repo.heroUrl).toHaveBeenCalledWith('h1/hero/r-tacos.jpg', 600);
});

test('coming back to Recipes shows the list at once while it refreshes', async () => {
  const first = render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Miso Glazed Aubergine Tacos/ });
  first.unmount();
  h.repo.listRecipes.mockReturnValue(new Promise(() => {}));
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  expect(screen.getByRole('link', { name: /Miso Glazed Aubergine Tacos/ })).toBeInTheDocument();
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
});

test('recipe cards show just the photo, title and times', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  const card = await screen.findByRole('link', { name: /Miso Glazed Aubergine Tacos/ });
  expect(card).not.toHaveTextContent(/Your recipe|written by Claude|HelloFresh|From your Cookidoo|From the web|draft|Toddler OK/i);
  expect(card).toHaveTextContent(/min dinner/);
});

test('Snacks & treats lists snack recipes, recipes that can be snacks and quick snacks', async () => {
  const base = (await h.repo.listRecipes())[0];
  h.repo.listRecipes.mockResolvedValue([
    { ...base, id: 'r-meal', title: 'Fish pie', kind: 'meal' },
    { ...base, id: 'r-oats', title: 'Baked oats', kind: 'component', snack_ok: true },
    { ...base, id: 'r-hummus', title: 'Beetroot hummus', kind: 'snack' },
    { ...base, id: 'r-apple', title: 'Apple & almonds', kind: 'snack', quick: true },
  ]);
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Fish pie/ });
  await userEvent.click(screen.getByRole('button', { name: /^Snacks & treats/ }));
  expect(screen.queryByRole('link', { name: /Fish pie/ })).not.toBeInTheDocument();
  for (const t of [/Baked oats/, /Beetroot hummus/, /Apple & almonds/]) expect(screen.getByRole('link', { name: t })).toBeInTheDocument();
});

test('a quick snack is a name, one portion of items and whether the toddler can have it', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Add a recipe' }));
  await userEvent.click(screen.getByRole('button', { name: /Quick snack/ }));
  const form = screen.getByRole('form', { name: 'Add a quick snack' });
  await userEvent.type(within(form).getByLabelText('Name'), 'Apple & almonds');
  await userEvent.type(within(form).getByLabelText('Item 1'), 'apple');
  await userEvent.type(within(form).getByLabelText('Item 1 amount'), '1');
  await userEvent.click(within(form).getByRole('button', { name: 'Add an item' }));
  await userEvent.type(within(form).getByLabelText('Item 2'), 'almonds');
  await userEvent.type(within(form).getByLabelText('Item 2 amount'), '30');
  await userEvent.type(within(form).getByLabelText('Item 2 unit'), 'g');
  await userEvent.click(within(form).getByRole('checkbox', { name: 'OK for the toddler' }));
  await userEvent.click(within(form).getByRole('button', { name: 'Save quick snack' }));
  expect(h.repo.addQuickSnack).toHaveBeenCalledWith('h1', { title: 'Apple & almonds', toddler_ok: false,
    items: [{ name: 'apple', qty: 1, unit: '' }, { name: 'almonds', qty: 30, unit: 'g' }] });
  expect(await screen.findByRole('link', { name: /Apple & almonds/ })).toBeInTheDocument();
});

test('Easy tonight shows weeknight dinners the cupboard and the Spar can cover, and adds the Spar things to the Spar list', async () => {
  await mix();
  h.repo.listIngredientNames.mockResolvedValue({
    'r-pesto': ['chicken breast', 'basil', 'paprika', 'water'],
    'r-curry': ['halloumi', 'onion'],
  });
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Pesto Chicken/ });
  await userEvent.click(screen.getByRole('button', { name: /^Easy tonight/ }));
  expect(await screen.findByText('From the Spar: chicken breast')).toBeInTheDocument();
  expect(shownTitles()).toEqual([expect.stringContaining('Pesto Chicken')]);
  expect(screen.getByText("Skip if they've none: basil")).toBeInTheDocument();
  expect(screen.getByText('1 more needs the big shop')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Add 1 to the Spar list' }));
  expect(h.repo.addQuick).toHaveBeenCalledWith('h1', 'chicken breast', 'For Pesto Chicken');
  expect(await screen.findByText('On the Spar list')).toBeInTheDocument();
});

test('Easy tonight says when a dinner is all in the cupboard', async () => {
  await mix();
  h.repo.listIngredientNames.mockResolvedValue({ 'r-pesto': ['paprika'], 'r-curry': ['paprika'] });
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Pesto Chicken/ });
  await userEvent.click(screen.getByRole('button', { name: /^Easy tonight/ }));
  expect(await screen.findAllByText('All in the cupboard')).toHaveLength(2);
  // One-pan dinners come first.
  expect(shownTitles()[0]).toContain('Pesto Chicken');
});

test('Roasts sits with the recipe filters and opens the roast builder', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('link', { name: 'Roasts' })).toHaveAttribute('href', '/recipes/roast');
  expect(screen.queryByRole('link', { name: 'Build a roast' })).not.toBeInTheDocument();
});

test("opened from a day's lunch, tapping a recipe makes it that day's lunch, at the household portions", async () => {
  render(<MemoryRouter initialEntries={['/recipes?lunch=2026-10-22']}><RecipeLibrary /></MemoryRouter>);
  expect(await screen.findByText("Pick Thursday's lunch")).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /Honey Chilli/ })[0]).toHaveAttribute('href', '/recipes/r-honey?lunch=2026-10-22');
  await userEvent.click(await screen.findByRole('button', { name: /Use .*Honey Chilli.* for lunch/ }));
  const saved = h.repo.saveSlots.mock.calls.at(-1)![0];
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ date: '2026-10-22', slot: 'lunch', mode: 'cook', recipe_id: 'r-honey', routine_choice: null, source_date: null });
  expect(saved[0].portions).toBeGreaterThan(0);
});
