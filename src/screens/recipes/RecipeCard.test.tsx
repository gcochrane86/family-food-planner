import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY, HONEY_VERSION, NEXT_WEEK } from '../../test/fixtures';
import RecipeCard from './RecipeCard';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const HAVE_ICONS = ['icon:chicken breast', 'icon:basmati rice'].map((key) => ({ key, label: key, path: `h1/prep/${key}.png`, source: 'generated' as const }));
beforeEach(() => { h.repo = fakeRepo(); h.repo.listPrepPhotos.mockResolvedValue(HAVE_ICONS); localStorage.clear(); });

function open(id: string) {
  return render(
    <MemoryRouter initialEntries={[id.includes('/') ? id : `/recipes/${id}`]}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipeCard />} />
        <Route path="/recipes/:id/edit" element={<p>Editor</p>} />
      </Routes>
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

test('− and + scale to any number of portions in between the tabs', async () => {
  open('r-honey');
  await screen.findByText('chicken breast or thigh');
  await userEvent.click(screen.getByRole('button', { name: 'More portions' }));
  expect(screen.getByRole('status', { name: 'Portions' })).toHaveTextContent('4 portions');
  expect(screen.getByText('chicken breast or thigh').closest('li')).toHaveTextContent('800g');
  for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole('button', { name: 'Fewer portions' }));
  expect(screen.getByRole('status', { name: 'Portions' })).toHaveTextContent('1 portion');
  expect(screen.getByRole('button', { name: 'Fewer portions' })).toBeDisabled();
  expect(screen.getByText('chicken breast or thigh').closest('li')).toHaveTextContent('200g');
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

test('the recipe card has no prep ahead switch, and badges prep steps', async () => {
  h.repo.getRecipe.mockImplementation(async () => ({ ...HONEY, steps: HONEY.steps.concat([{ ...HONEY.steps[0], id: 's-marinate', position: 2, title: 'Marinate', needs_night_before: true }]) }));
  open('r-honey');
  const method = await screen.findByRole('region', { name: 'Method' });
  expect(screen.queryByRole('switch', { name: 'Prep ahead' })).not.toBeInTheDocument();
  expect(within(method).getByText('Can be done the day before')).toBeInTheDocument();
  expect(within(method).getByText('Needs the night before')).toBeInTheDocument();
  expect(screen.getByText('Prep ahead', { selector: 'dt' })).toBeInTheDocument();
  expect(screen.getByText('On the day', { selector: 'dt' })).toBeInTheDocument();
});

test('machine badges and bold ingredients are shown', async () => {
  open('r-honey');
  const finish = await screen.findByRole('region', { name: 'Method' });
  expect(within(finish).getByText('Rice on')).toBeInTheDocument();
  expect(within(finish).getAllByText('TM7')[0]).toBeInTheDocument();
  expect(within(finish).getByText('20 min · 100°C / 210°F · speed 4')).toBeInTheDocument();
  expect(within(finish).getByText('rice', { selector: 'b' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cook mode' })).toHaveAttribute('href', '/recipes/r-honey/cook?portions=3');
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

test('the method shows an Add step photos button with the cost, and makes the main photo first when there is none', async () => {
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'Add step photos ✨ (4 photos, about 12p)' }));
  expect(screen.getByText('Make the main photo and 3 step photos? About 12p.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  await vi.waitFor(() => expect(h.repo.generateStepPhoto).toHaveBeenCalledTimes(3));
  expect(h.repo.generateHero).toHaveBeenCalledWith('r-honey');
  expect(h.repo.generateHero.mock.invocationCallOrder[0]).toBeLessThan(h.repo.generateStepPhoto.mock.invocationCallOrder[0]);
  expect(await screen.findByRole('img', { name: HONEY.title })).toBeInTheDocument();
});

test('with a main photo already, the button only counts the steps', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, hero_image_path: 'h1/hero/r-honey.jpg', hero_image_source: 'generated' });
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'Add step photos ✨ (3 photos, about 9p)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  await vi.waitFor(() => expect(h.repo.generateStepPhoto).toHaveBeenCalledTimes(3));
  expect(h.repo.generateHero).not.toHaveBeenCalled();
});

test('a failed main photo stops before any step photos', async () => {
  h.repo.generateHero.mockRejectedValueOnce(new Error('quota'));
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: /Add step photos ✨/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the main photo: quota");
  expect(h.repo.generateStepPhoto).not.toHaveBeenCalled();
});

test('Add step photos also makes the missing ingredient pictures, sharing ones already made (oil is olive oil)', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, hero_image_path: 'h1/hero/r-honey.jpg', hero_image_source: 'generated',
    ingredients: [...HONEY.ingredients, { position: 3, group_name: null, name: 'oil', qty: 1, unit: 'tbsp', note: null, qty_approx: false },
      { position: 4, group_name: null, name: 'Leeks', qty: 2, unit: '', note: 'sliced', qty_approx: false },
      { position: 5, group_name: null, name: 'leek', qty: 1, unit: '', note: null, qty_approx: false }] });
  h.repo.listPrepPhotos.mockResolvedValue([...HAVE_ICONS, { key: 'icon:olive oil', label: 'olive oil', path: 'h1/prep/oil.png', source: 'generated' }]);
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'Add step photos ✨ (4 photos, about 12p)' }));
  expect(screen.getByText('Make 3 step photos and 1 ingredient picture? About 12p.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  await vi.waitFor(() => expect(h.repo.generateStepPhoto).toHaveBeenCalledTimes(3));
  expect(h.repo.generatePrepPhoto).toHaveBeenCalledTimes(1);
  expect(h.repo.generatePrepPhoto).toHaveBeenCalledWith('h1', 'Leeks', null, false, undefined, true);
});

test('a recipe with every step photo but a missing ingredient picture still offers to add it', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, hero_image_path: 'h1/hero/r-honey.jpg', hero_image_source: 'generated',
    steps: HONEY.steps.map((st) => ({ ...st, image_path: `h1/steps/${st.id}.jpg`, image_source: 'generated' as const })) });
  h.repo.listPrepPhotos.mockResolvedValue([]);
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'Add ingredient pictures ✨ (2 photos, about 6p)' }));
  expect(screen.getByText('Make 2 ingredient pictures? About 6p.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Make photos' }));
  await vi.waitFor(() => expect(h.repo.generatePrepPhoto).toHaveBeenCalledTimes(2));
  expect(h.repo.generateStepPhoto).not.toHaveBeenCalled();
});

test('a recipe with no steps has no Add step photos button', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, steps: [] });
  open('r-honey');
  await screen.findByRole('heading', { name: HONEY.title });
  expect(screen.queryByRole('button', { name: /Add step photos/ })).not.toBeInTheDocument();
});

test('add step photos asks first with a rough cost, then makes them without needing a 👍', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, hero_image_path: 'h1/hero/r-honey.jpg', hero_image_source: 'generated' });
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

test('the recipe page has no source or draft label above the title', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, source: 'claude', status: 'draft' });
  open('r-honey');
  await screen.findByRole('heading', { name: HONEY.title });
  expect(screen.queryByText(/written by Claude|From your Cookidoo|draft until you rate it/i)).not.toBeInTheDocument();
});

test('a recipe converted from the web says so and links to the original page', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, source: 'web', source_url: 'https://www.bbcgoodfood.com/recipes/katsu' });
  open('r-honey');
  expect(await screen.findByRole('link', { name: /Original recipe/ })).toBeInTheDocument();
  expect(screen.queryByText(/From the web|written by Claude|Your recipe|draft/i)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Original recipe (www.bbcgoodfood.com)' })).toHaveAttribute('href', 'https://www.bbcgoodfood.com/recipes/katsu');
});

test('an odd original link does not break the recipe page', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, source: 'web', source_url: 'https://[x]' });
  open('r-honey');
  expect(await screen.findByRole('heading', { name: HONEY.title })).toBeInTheDocument();
});

test('the settings menu offers Edit recipe', async () => {
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'Recipe settings' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit recipe' }));
  expect(await screen.findByText('Editor')).toBeInTheDocument();
});

describe('Rework with Claude', () => {
  test('asks for what should change, opens the Claude app with it, and saves the request', async () => {
    const opened: string[] = [];
    const spy = vi.spyOn(window, 'open').mockImplementation((url) => { opened.push(String(url)); return null; });
    open('r-honey');
    await userEvent.click(await screen.findByRole('button', { name: 'Recipe settings' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rework with Claude ✨' }));
    const dialog = screen.getByRole('dialog', { name: 'Rework this recipe' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open the Claude app' }));
    expect(h.repo.requestRework).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'What should change?' }), 'Use the Anova for the chicken instead of the TM7');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open the Claude app' }));
    expect(opened).toHaveLength(1);
    const ask = new URL(opened[0]).searchParams.get('q')!;
    expect(opened[0]).toMatch(/^https:\/\/claude\.ai\/new\?q=/);
    expect(ask).toMatch(/Rework my recipe .* in the Family Food Planner/);
    expect(ask).toContain('Use the Anova for the chicken instead of the TM7');
    expect(h.repo.requestRework).toHaveBeenCalledWith('h1', 'r-honey', 'Use the Anova for the chicken instead of the TM7');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const status = await screen.findByRole('status', { name: 'Rework' });
    expect(status).toHaveTextContent(/Claude app/);
    expect(status).not.toHaveTextContent(/Mac/);
    expect(within(status).getByRole('link', { name: 'Open Claude again' })).toHaveAttribute('href', opened[0]);
    spy.mockRestore();
  });

  test('a finished rework shows what changed and can be dismissed; a failed one opens Claude again', async () => {
    const opened: string[] = [];
    const spy = vi.spyOn(window, 'open').mockImplementation((url) => { opened.push(String(url)); return null; });
    const rework = { id: 'w1', household_id: 'h1', recipe_id: 'r-honey', request: 'Less honey', requested_at: '', started_at: null, finished_at: null };
    h.repo.getRework.mockResolvedValueOnce({ ...rework, status: 'done', summary: 'Chicken now roasts in the Anova at 200°C.' });
    const first = open('r-honey');
    const done = await screen.findByRole('status', { name: 'Rework' });
    expect(done).toHaveTextContent('Chicken now roasts in the Anova');
    await userEvent.click(within(done).getByRole('button', { name: 'Dismiss' }));
    expect(h.repo.dismissRework).toHaveBeenCalledWith('w1');
    expect(screen.queryByRole('status', { name: 'Rework' })).not.toBeInTheDocument();
    first.unmount();
    h.repo.getRework.mockResolvedValueOnce({ ...rework, status: 'failed', summary: 'Ran out of time.' });
    open('r-honey');
    const failed = await screen.findByRole('status', { name: 'Rework' });
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    expect(new URL(opened[0]).searchParams.get('q')).toContain('Less honey');
    expect(h.repo.retryRework).toHaveBeenCalledWith('w1');
    expect(failed).toHaveTextContent(/Claude app/);
    spy.mockRestore();
  });

  test('coming back to the app picks up a finished rework and reloads the recipe', async () => {
    const rework = { id: 'w1', household_id: 'h1', recipe_id: 'r-honey', request: 'x', requested_at: '', started_at: null, finished_at: null };
    h.repo.getRework.mockResolvedValueOnce({ ...rework, status: 'requested', summary: null });
    open('r-honey');
    await screen.findByRole('status', { name: 'Rework' });
    const loads = h.repo.getRecipe.mock.calls.length;
    h.repo.getRework.mockResolvedValue({ ...rework, status: 'done', summary: 'Less honey now.' });
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText(/Less honey now/)).toBeInTheDocument();
    await waitFor(() => expect(h.repo.getRecipe.mock.calls.length).toBeGreaterThan(loads));
  });
});

test('the Reheats well tick flips with a tap and is saved', async () => {
  open('r-honey');
  const tick = await screen.findByRole('switch', { name: 'Reheats well' });
  expect(tick).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(tick);
  expect(h.repo.setReheatsWell).toHaveBeenCalledWith('r-honey', false);
  expect(screen.getByRole('switch', { name: 'Reheats well' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('switch', { name: 'Reheats well' })).toHaveTextContent("Doesn't reheat");
});

test('a failed Reheats well save puts it back and says so', async () => {
  h.repo.setReheatsWell.mockRejectedValueOnce(new Error('offline'));
  open('r-honey');
  await userEvent.click(await screen.findByRole('switch', { name: 'Reheats well' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save");
  expect(screen.getByRole('switch', { name: 'Reheats well' })).toHaveAttribute('aria-checked', 'true');
});

test('a batch step carries the batch tip; a batch naming no real step shows none', async () => {
  const batch = { name: 'Honey chilli sauce', group: 'The meat', steps: ['The bulk sauce'], makes: 4, freezer_days: 90 };
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, batch });
  const first = open('r-honey');
  expect(await screen.findByText('Batch tip: make 4× and freeze 3 (keeps about 3 months)')).toBeInTheDocument();
  first.unmount();
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, batch: { ...batch, steps: ['A step that was renamed'] } });
  open('r-honey');
  await screen.findByRole('heading', { name: HONEY.title });
  expect(screen.queryByText(/Batch tip/)).not.toBeInTheDocument();
});

const withVersion = () => h.repo.getWeek.mockImplementation(async (_hid: string, ws: string) => (ws === NEXT_WEEK.week.week_start
  ? { week: NEXT_WEEK.week, slots: NEXT_WEEK.slots.map((s) => (s.date === '2026-10-19' && s.slot === 'dinner' ? { ...s, version: HONEY_VERSION } : s)) }
  : { week: null, slots: [] }));

test("opened from a day with tonight's version, the card shows that version and a way back to the saved recipe", async () => {
  withVersion();
  open('/recipes/r-honey?day=2026-10-19&slot=dinner');
  expect(await screen.findByText(/Tonight's version: Turkey instead of chicken/)).toBeInTheDocument();
  expect(screen.getByText('turkey breast').closest('li')).toHaveTextContent(/changed/i);
  expect(screen.queryByText('chicken breast or thigh')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See the saved recipe' })).toHaveAttribute('href', '/recipes/r-honey');
  expect(screen.getByRole('link', { name: 'Cook mode' }).getAttribute('href')).toMatch(/day=2026-10-19&slot=dinner/);
});

test('opened from the recipe list, the card shows the saved recipe', async () => {
  withVersion();
  open('r-honey');
  expect(await screen.findByText('chicken breast or thigh')).toBeInTheDocument();
  expect(screen.queryByText(/Tonight's version/)).not.toBeInTheDocument();
});

test('a recipe can also be a snack: how many a batch makes, how long it keeps, and OK for the toddler', async () => {
  open('r-honey');
  await userEvent.click(await screen.findByRole('switch', { name: 'Can be a snack' }));
  const form = screen.getByRole('group', { name: 'As a snack' });
  await userEvent.clear(within(form).getByLabelText('Snacks from one batch'));
  await userEvent.type(within(form).getByLabelText('Snacks from one batch'), '8');
  await userEvent.clear(within(form).getByLabelText('Keeps for (days)'));
  await userEvent.type(within(form).getByLabelText('Keeps for (days)'), '3');
  await userEvent.click(within(form).getByRole('button', { name: 'Save snack details' }));
  expect(h.repo.setSnackOptions).toHaveBeenCalledWith('r-honey', { snack_ok: true, snack_portions: 8, keeps_days: 3, toddler_ok: HONEY.toddler_ok });
  expect(screen.getByRole('switch', { name: 'Can be a snack' })).toHaveAttribute('aria-checked', 'true');
});

const N = { kcal: 500, protein_g: 40, fat_g: 20, sat_fat_g: 6, carbs_g: 45, sugars_g: 8, free_sugars_g: 2, fibre_g: 6, salt_g: 1.2,
  veg_portions: 2, fruit_portions: 0, healthy_fat: true, oily_fish: false, legumes: false, red_meat: false, processed_meat: false };

test('the nutrition sits at the bottom: per serving, and an adult share', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, nutrition: N });
  open('r-honey');
  const box = await screen.findByRole('region', { name: 'Nutrition' });
  expect(within(box).getByRole('columnheader', { name: 'Per serving' })).toBeInTheDocument();
  expect(within(box).getByRole('columnheader', { name: 'Each adult' })).toBeInTheDocument();
  expect(within(box).getByRole('row', { name: /Calories/ })).toHaveTextContent('Calories500 kcal625 kcal');
  expect(within(box).getByRole('row', { name: /Protein/ })).toHaveTextContent('Protein40g50g');
  expect(within(box).getByRole('row', { name: /saturates/ })).toHaveTextContent('of which saturates6g7.5g');
  expect(within(box).getByRole('row', { name: /Salt/ })).toHaveTextContent('Salt1.2g1.5g');
  expect(within(box).getByRole('row', { name: /free sugars/ })).toHaveTextContent('of which free sugars2g2.5g');
  expect(within(box).getByRole('row', { name: /Veg portions/ })).toHaveTextContent('Veg portions22.5');
  expect(within(box).getByText(/estimate/i)).toBeInTheDocument();
});

test('a recipe that can be a snack shows one snack too', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, base_portions: 4, snack_ok: true, snack_portions: 8, nutrition: N });
  open('r-honey');
  const box = await screen.findByRole('region', { name: 'Nutrition' });
  expect(within(box).getByRole('row', { name: /Calories/ })).toHaveTextContent('Calories500 kcal625 kcal250 kcal');
  expect(within(box).getByRole('columnheader', { name: 'One snack' })).toBeInTheDocument();
});

test('a snack recipe shows per snack only', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, kind: 'snack', nutrition: N });
  open('r-honey');
  const box = await screen.findByRole('region', { name: 'Nutrition' });
  expect(within(box).getByRole('columnheader', { name: 'Per snack' })).toBeInTheDocument();
  expect(within(box).queryByRole('columnheader', { name: 'Each adult' })).not.toBeInTheDocument();
  expect(within(box).getByRole('row', { name: /Calories/ })).toHaveTextContent('Calories500 kcal');
});

test('no estimate yet says so', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, nutrition: null });
  open('r-honey');
  const box = await screen.findByRole('region', { name: 'Nutrition' });
  expect(box).toHaveTextContent('No estimate yet');
});

describe('a snack recipe opens at its planned make', () => {
  const BALLS = { ...HONEY, id: 'r-balls', slug: 'balls', title: 'Energy Balls', kind: 'snack' as const, base_portions: 20, keeps_days: 7, toddler_ok: true,
    ingredients: [{ ...HONEY.ingredients[0], name: 'pistachios', qty: 170, unit: 'g', note: null }] };
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-16T17:00:00Z'));
    h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-balls' ? BALLS : null));
    h.repo.listRecipes.mockResolvedValue([BALLS]);
    h.repo.getSettings.mockResolvedValue({ prep_days: [0] });
  });
  afterEach(() => { vi.useRealTimers(); });
  const eat = (date: string, member_id: string) => ({ id: `${date}${member_id}`, date, slot: 'snack_am', member_id, recipe_id: 'r-balls', qty: 1, make_date: '2026-11-16' });

  test("today's make sets the amounts and the first tab", async () => {
    h.repo.getWeek.mockImplementation(async (_h: string, ws: string) => (ws === '2026-11-16'
      ? { week: { id: 'w', week_start: '2026-11-16', days: 7, status: 'approved', prep_days: [0] }, slots: [], eats: ['2026-11-17', '2026-11-18'].flatMap((d) => [eat(d, 'a'), eat(d, 'b')]) }
      : { week: null, slots: [] }) as unknown as Awaited<ReturnType<FakeRepo['getWeek']>>);
    open('r-balls');
    // 4 needed, made as the whole batch of 20.
    await screen.findByRole('tab', { name: "Mon's make · 20" });
    expect(screen.getByRole('tab', { name: "Mon's make · 20" })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('pistachios').closest('li')).toHaveTextContent('170g');
  });

  test('with no make planned, the whole batch', async () => {
    h.repo.getWeek.mockResolvedValue({ week: null, slots: [] });
    open('r-balls');
    expect((await screen.findByText('pistachios')).closest('li')).toHaveTextContent('170g');
    expect(screen.getByRole('tab', { name: 'Whole batch · 20' })).toHaveAttribute('aria-selected', 'true');
  });
});

test('in ad-hoc, Add to plan puts the recipe on the ad-hoc plan at the portions shown', async () => {
  localStorage.setItem('adhoc-mode', '1');
  open('r-honey');
  await screen.findByText('chicken breast or thigh');
  await userEvent.click(screen.getByRole('button', { name: 'More portions' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
  await userEvent.click(screen.getByRole('button', { name: 'As lunch' }));
  expect(h.repo.addAdhocMeal).toHaveBeenCalledWith('h1', 'r-honey', 'lunch', 4);
  expect(await screen.findByText('Added to the ad-hoc plan as lunch.')).toBeInTheDocument();
});

test('in ad-hoc, Add to plan is at the top, above the times and ingredients', async () => {
  localStorage.setItem('adhoc-mode', '1');
  open('r-honey');
  const ingredients = await screen.findByRole('heading', { name: 'Ingredients' });
  const add = screen.getByRole('button', { name: 'Add to plan' });
  expect(add.compareDocumentPosition(ingredients) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(add.closest('header')).not.toBeNull();
});

test('on the weekly plan there is no Add to plan', async () => {
  open('r-honey');
  await screen.findByText('chicken breast or thigh');
  expect(screen.queryByRole('button', { name: 'Add to plan' })).not.toBeInTheDocument();
});
