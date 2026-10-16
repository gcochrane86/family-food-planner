import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY } from '../../test/fixtures';
import RecipeCard from './RecipeCard';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); localStorage.clear(); });

function open(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/recipes/${id}`]}>
      <Routes><Route path="/recipes/:id" element={<RecipeCard />} /></Routes>
    </MemoryRouter>,
  );
}

test('quantities start scaled to the household and rescale with the tabs', async () => {
  open('r-honey');
  const chicken = await screen.findByText('chicken breast or thigh');
  expect(chicken.closest('li')).toHaveTextContent('600g');
  await userEvent.click(screen.getByRole('tab', { name: '6 portions' }));
  expect(screen.getByText('chicken breast or thigh').closest('li')).toHaveTextContent('1.2kg');
  expect(screen.getByRole('tab', { name: 'Household · 3.0' })).toHaveAttribute('aria-selected', 'false');
});

test('ingredients have no pantry or to-buy labels', async () => {
  open('r-honey');
  const chicken = await screen.findByText('chicken breast or thigh');
  expect(chicken.closest('li')).not.toHaveTextContent(/In pantry|To buy/);
  expect(screen.queryByText('To buy')).not.toBeInTheDocument();
});

test('steps read as one method by default, in cooking order', async () => {
  open('r-honey');
  const method = await screen.findByRole('region', { name: 'Method' });
  const titles = within(method).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(titles).toEqual(['The bulk sauce', 'Rice on', 'Final toss']);
  expect(screen.queryByRole('heading', { name: /night before/i })).not.toBeInTheDocument();
});

test('prep ahead splits out the steps you can do the night before, and is remembered', async () => {
  open('r-honey');
  const toggle = await screen.findByRole('switch', { name: 'Prep ahead' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  await userEvent.click(toggle);
  expect(within(screen.getByRole('region', { name: 'The night before' })).getByText('The bulk sauce')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'On the night' })).getByText('Rice on')).toBeInTheDocument();
  expect(localStorage.getItem('ffp.prepAhead')).toBe('on');
});

test('no prep ahead switch when nothing can be done ahead', async () => {
  open('r-doner');
  await screen.findByRole('region', { name: 'Method' });
  expect(screen.queryByRole('switch', { name: 'Prep ahead' })).not.toBeInTheDocument();
});

test('both phases, machine badges and bold ingredients are shown', async () => {
  localStorage.setItem('ffp.prepAhead', 'on');
  open('r-honey');
  expect(await screen.findByRole('heading', { name: 'The night before' })).toBeInTheDocument();
  const finish = screen.getByRole('region', { name: 'On the night' });
  expect(within(finish).getByText('Rice on')).toBeInTheDocument();
  expect(within(finish).getAllByText('TM7')[0]).toBeInTheDocument();
  expect(within(finish).getByText('20 min · 100°C · speed 4')).toBeInTheDocument();
  expect(within(finish).getByText('rice', { selector: 'b' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cook mode' })).toHaveAttribute('href', '/recipes/r-honey/cook');
});

test('the toddler salt note appears when the toddler share is over 0.5g', async () => {
  open('r-doner');
  expect(await screen.findByText(/About 1\.0g salt in the toddler's portion/)).toBeInTheDocument();
});

test('a recipe without a photo shows a placeholder, not a broken image', async () => {
  open('r-honey');
  await screen.findByRole('heading', { name: HONEY.title });
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

async function fromSettings(item: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Recipe settings' }));
  await userEvent.click(screen.getByRole('menuitem', { name: item }));
}

test('new photo and print are tucked into the recipe settings menu', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  open('r-honey');
  await screen.findByRole('heading', { name: HONEY.title });
  expect(screen.queryByRole('button', { name: /New .*photo/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Recipe settings' }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await fromSettings('Print');
  expect(print).toHaveBeenCalled();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  print.mockRestore();
});

test('"New photo" generates a hero image and shows it', async () => {
  open('r-honey');
  await fromSettings('New main photo ✨');
  expect(h.repo.generateHero).toHaveBeenCalledWith('r-honey');
  expect(await screen.findByRole('img', { name: HONEY.title })).toHaveAttribute('src', 'https://img.test/h1/hero/r-honey-1.jpg');
});

test('a failed photo generation says so and keeps the placeholder', async () => {
  h.repo.generateHero.mockRejectedValueOnce(new Error("Google couldn't make the image: quota"));
  open('r-honey');
  await fromSettings('New main photo ✨');
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make a photo: Google couldn't make the image: quota");
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('a recipe that does not exist says so', async () => {
  open('nope');
  expect(await screen.findByText("This recipe isn't in your library.")).toBeInTheDocument();
});

test('a liked recipe with missing step photos finishes them', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, rating: 'up' });
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  const make = h.repo.generateStepPhoto.getMockImplementation()!;
  h.repo.generateStepPhoto.mockImplementationOnce(async (...args) => { await held; return make(...args); });
  open('r-honey');
  expect(await screen.findByText('Making step photos… 0 of 3')).toBeInTheDocument();
  release();
  await vi.waitFor(() => expect(screen.getAllByRole('img', { name: /^Step \d/ })).toHaveLength(3));
  expect(h.repo.generateStepPhoto).toHaveBeenCalledTimes(3);
  expect(screen.queryByText(/Making step photos/)).not.toBeInTheDocument();
});

test('a recipe that is not rated makes no step photos', async () => {
  open('r-honey');
  await screen.findByRole('heading', { name: HONEY.title });
  expect(h.repo.generateStepPhoto).not.toHaveBeenCalled();
});

test('new step photos come from the settings menu and leave your own photos alone', async () => {
  const steps = HONEY.steps.map((s, i) => ({ ...s, image_path: `p${i}.jpg`, image_source: i === 0 ? 'generated' as const : 'own' as const }));
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, rating: 'up', steps });
  open('r-honey');
  await screen.findByRole('heading', { name: HONEY.title });
  expect(screen.queryByRole('button', { name: /Redo photo/ })).not.toBeInTheDocument();
  await fromSettings('New step photos ✨');
  expect(screen.getByText('Remake 1 step photo? About 3p.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  await vi.waitFor(() => expect(h.repo.generateStepPhoto).toHaveBeenCalledTimes(1));
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith(HONEY.id, steps[0].id, true, true);
});

test('add step photos asks first with a rough cost, then makes them without needing a 👍', async () => {
  open('r-honey');
  await fromSettings('Add step photos ✨');
  expect(screen.getByText('Make 3 step photos? About 9p.')).toBeInTheDocument();
  expect(h.repo.generateStepPhoto).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  await vi.waitFor(() => expect(h.repo.generateStepPhoto).toHaveBeenCalledTimes(3));
  for (const st of HONEY.steps) expect(h.repo.generateStepPhoto).toHaveBeenCalledWith(HONEY.id, st.id, false, true);
  expect(h.repo.rateRecipe).not.toHaveBeenCalled();
});

test('each step can have your own one-sentence description for its photo', async () => {
  open('r-honey');
  await fromSettings('Add step photos ✨');
  const box = screen.getByRole('textbox', { name: 'Step 2: Rice on' });
  await userEvent.type(box, 'Rice steaming in the basket');
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  await vi.waitFor(() => expect(h.repo.generateStepPhoto).toHaveBeenCalledTimes(3));
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith(HONEY.id, 's-rice', false, true, { hint: 'Rice steaming in the basket' });
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith(HONEY.id, 's-sauce', false, true);
});

test('a saved description is filled in when remaking photos', async () => {
  const steps = HONEY.steps.map((s, i) => ({ ...s, image_path: `p${i}.jpg`, image_source: 'generated' as const, photo_hint: i === 0 ? 'Sauce in a jar' : null }));
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, steps });
  open('r-honey');
  await fromSettings('New step photos ✨');
  expect(screen.getByRole('textbox', { name: 'Step 1: The bulk sauce' })).toHaveValue('Sauce in a jar');
});

test('cancelling add step photos makes nothing', async () => {
  open('r-honey');
  await fromSettings('Add step photos ✨');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText(/Make 3 step photos/)).not.toBeInTheDocument();
  expect(h.repo.generateStepPhoto).not.toHaveBeenCalled();
});

test('no add option when every step already has a photo', async () => {
  const steps = HONEY.steps.map((s, i) => ({ ...s, image_path: `p${i}.jpg`, image_source: 'own' as const }));
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, steps });
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'Recipe settings' }));
  expect(screen.queryByRole('menuitem', { name: 'Add step photos ✨' })).not.toBeInTheDocument();
});

test('no step photo option when a recipe has no AI step photos', async () => {
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'Recipe settings' }));
  expect(screen.queryByRole('menuitem', { name: 'New step photos ✨' })).not.toBeInTheDocument();
});

test('a down-rated recipe shows Not for us with Undo', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, rating: 'down' });
  open('r-honey');
  expect(await screen.findByText('Not for us')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(h.repo.rateRecipe).toHaveBeenCalledWith(HONEY.id, null);
  expect(screen.queryByText('Not for us')).not.toBeInTheDocument();
});

test('a recipe in Cookidoo links to it, and says when an update is pending', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, cookidoo_status: 'sent', cookidoo_url: 'https://cookidoo.co.uk/created-recipes/en-GB/01X' });
  const { unmount } = open('r-honey');
  expect(await screen.findByRole('link', { name: 'In Cookidoo' })).toHaveAttribute('href', 'https://cookidoo.co.uk/created-recipes/en-GB/01X');
  unmount();
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, cookidoo_status: 'outdated', cookidoo_url: 'https://cookidoo.co.uk/created-recipes/en-GB/01X' });
  open('r-honey');
  expect(await screen.findByRole('link', { name: 'In Cookidoo (update pending)' })).toBeInTheDocument();
});

test('a recipe from Cookidoo is labelled From your Cookidoo', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, source: 'cookidoo' });
  open('r-honey');
  expect(await screen.findByText(/From your Cookidoo/)).toBeInTheDocument();
});

test('a recipe converted from the web says so and links to the original page', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, source: 'web', source_url: 'https://www.bbcgoodfood.com/recipes/katsu' });
  open('r-honey');
  expect(await screen.findByText('From the web, converted')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Original recipe (www.bbcgoodfood.com)' })).toHaveAttribute('href', 'https://www.bbcgoodfood.com/recipes/katsu');
});

test('an odd original link does not break the recipe page', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, source: 'web', source_url: 'https://[x]' });
  open('r-honey');
  expect(await screen.findByRole('heading', { name: HONEY.title })).toBeInTheDocument();
});
