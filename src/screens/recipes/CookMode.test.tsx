import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY, HONEY_VERSION, NEXT_WEEK } from '../../test/fixtures';
import { FakeRec, installFakeSpeech } from '../../test/fakeSpeech';
import CookMode from './CookMode';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));
vi.mock('../../lib/image', async (orig) => ({ ...(await orig<typeof import('../../lib/image')>()), resizeImage: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })) }));

// Most tests walk tonight's own steps; the prep-ahead tests use the whole recipe.
const ON_THE_DAY = { ...HONEY, steps: HONEY.steps.filter((s) => s.phase === 'finish') };
beforeEach(() => {
  h.repo = fakeRepo(); sessionStorage.clear();
  h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? ON_THE_DAY : null));
});
afterEach(() => { vi.useRealTimers(); });

function open(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/recipes/r-honey/cook${query}`]}>
      <Routes>
        <Route path="/recipes/:id/cook" element={<CookMode />} />
        <Route path="/recipes/:id" element={<h1>Recipe card</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('starts on the first dinner step and moves through the steps', async () => {
  open();
  expect(await screen.findByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  expect(screen.getByText(/Step 1 of 2/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByRole('heading', { name: 'Final toss' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
});

test('cook mode shows every step in one list, prep first with its badge, and no prep ahead switch', async () => {
  h.repo.getRecipe.mockResolvedValue(HONEY);
  open();
  expect(await screen.findByRole('heading', { name: 'The bulk sauce' })).toBeInTheDocument();
  expect(screen.getByText('Can be done the day before')).toBeInTheDocument();
  expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: 'Prep ahead' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  expect(screen.queryByText('Can be done the day before')).not.toBeInTheDocument();
});

test('Done on the last step goes back to the recipe', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
  await userEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('heading', { name: 'Recipe card' })).toBeInTheDocument();
});

test('a step photo is resized and saved', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.upload(screen.getByLabelText('Add photo'), new File(['img'], 'step.heic', { type: 'image/heic' }));
  expect(h.repo.uploadStepPhoto).toHaveBeenCalledWith('h1', 's-rice', expect.any(Blob));
  expect(await screen.findByRole('img', { name: 'Your photo of this step' })).toBeInTheDocument();
});

test('a failed photo upload says so and keeps the step as it was', async () => {
  h.repo.uploadStepPhoto.mockRejectedValueOnce(new Error('Failed to fetch'));
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.upload(screen.getByLabelText('Add photo'), new File(['img'], 'step.jpg', { type: 'image/jpeg' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the photo");
  expect(screen.queryByRole('img', { name: 'Your photo of this step' })).not.toBeInTheDocument();
});

test('a step without its own photo shows the main photo; a generated photo is labelled as such', async () => {
  const steps = HONEY.steps.map((s) => (s.id === 's-sauce' ? { ...s, image_path: 'h1/steps/gen.jpg', image_source: 'generated' as const } : s));
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, hero_image_path: 'h1/hero/r-honey.jpg', steps });
  open();
  expect(await screen.findByRole('img', { name: 'Photo of this step' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByRole('img', { name: HONEY.title })).toBeInTheDocument();
});

test('adding a step photo lives in the cook mode settings menu', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  expect(screen.queryByText(/^(Add|Replace) photo$/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cook mode settings' }));
  expect(screen.getByRole('menuitem', { name: 'Use your own photo' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Make a new photo ✨' })).toBeInTheDocument();
});


test('make a new photo from cook mode: your description, the cost, then progress and the new photo', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...ON_THE_DAY, hero_image_path: 'h1/hero/r-honey.jpg' });
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  h.repo.generateStepPhoto.mockImplementationOnce(async () => { await held; return 'h1/steps/new.jpg'; });
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('button', { name: 'Cook mode settings' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Make a new photo ✨' }));
  const dialog = screen.getByRole('dialog', { name: 'New photo for this step' });
  expect(dialog).toHaveTextContent('About 3p');
  await userEvent.type(within(dialog).getByRole('textbox'), 'Rice steaming in the basket');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Make photo' }));
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith('r-honey', 's-rice', false, true, { hint: 'Rice steaming in the basket' });
  expect(within(dialog).getByRole('status')).toHaveTextContent('Making your photo');
  release();
  expect(await screen.findByRole('img', { name: 'Photo of this step' })).toHaveAttribute('src', expect.stringContaining('h1/steps/new.jpg'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a new photo over your own photo warns first and replaces it', async () => {
  const steps = ON_THE_DAY.steps.map((s) => (s.id === 's-rice' ? { ...s, image_path: 'h1/steps/mine.jpg', image_source: 'own' as const } : s));
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, hero_image_path: 'h1/hero/r-honey.jpg', steps });
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('button', { name: 'Cook mode settings' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Make a new photo ✨' }));
  const dialog = screen.getByRole('dialog', { name: 'New photo for this step' });
  expect(dialog).toHaveTextContent('This replaces your own photo.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Make photo' }));
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith('r-honey', 's-rice', true, true, { replaceOwn: true });
});

test('swiping moves between steps', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  const area = screen.getByRole('region', { name: 'Step' });
  fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 200 }] });
  fireEvent.touchEnd(area, { changedTouches: [{ clientX: 120, clientY: 210 }] });
  expect(screen.getByRole('heading', { name: 'Final toss' })).toBeInTheDocument();
  fireEvent.touchStart(area, { touches: [{ clientX: 100, clientY: 200 }] });
  fireEvent.touchEnd(area, { changedTouches: [{ clientX: 300, clientY: 205 }] });
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 100 }] });
  fireEvent.touchEnd(area, { changedTouches: [{ clientX: 280, clientY: 400 }] });
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
});


test("each step lists what it uses, scaled to the portions you picked on the recipe", async () => {
  open('?portions=3');
  await screen.findByRole('heading', { name: 'Rice on' });
  const uses = screen.getByRole('list', { name: 'For this step' });
  expect(within(uses).getAllByRole('listitem')).toHaveLength(1);
  expect(within(uses).getByText('Basmati rice')).toBeInTheDocument();
  expect(within(uses).getByText('200g')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.queryByRole('list', { name: 'For this step' })).not.toBeInTheDocument();
});

test('without portions it uses the recipe as written', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  expect(within(screen.getByRole('list', { name: 'For this step' })).getByText('400g')).toBeInTheDocument();
});

test("from a day with tonight's version, cook mode shows the changed step", async () => {
  h.repo.getWeek.mockImplementation(async (_hid: string, ws: string) => (ws === NEXT_WEEK.week.week_start
    ? { week: NEXT_WEEK.week, slots: NEXT_WEEK.slots.map((s) => (s.date === '2026-10-19' && s.slot === 'dinner' ? { ...s, version: HONEY_VERSION } : s)) }
    : { week: null, slots: [] }));
  // Tonight's version is of the whole recipe, prep step first.
  h.repo.getRecipe.mockResolvedValue(HONEY);
  open('?portions=3&day=2026-10-19&slot=dinner');
  await screen.findByRole('heading', { name: /./, level: 1 });
  while (!screen.queryByRole('heading', { name: 'Rice on' })) await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  expect(screen.getByText(/twice and start/)).toBeInTheDocument();
  expect(screen.getByText('Changed tonight')).toBeInTheDocument();
  expect(screen.getByText(/Tonight's version: Turkey instead of chicken/)).toBeInTheDocument();
});

test('cook mode has no timers: each step just says how long it takes', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  expect(screen.queryByRole('button', { name: /timer/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('timer')).not.toBeInTheDocument();
});

test('a step that is only about a machine shows your photo of that machine', async () => {
  h.repo.getRecipe.mockResolvedValue({ ...HONEY, hero_image_path: 'h1/hero/honey.jpg', steps: [
    { id: 's-heat', phase: 'finish', position: 1, at_minute: 0, title: 'Heat the Anova', body: 'Preheat the Anova and line a tray.', machine: 'apo', settings: '190°C', timer_minutes: 5, image_path: null, image_source: null },
  ] });
  h.repo.listEquipment.mockResolvedValue([{ id: 'e1', household_id: 'h1', code: 'apo', name: 'Anova Precision Oven', photo: 'h1/kit/apo.jpg' }]);
  open();
  expect(await screen.findByRole('img', { name: 'Anova Precision Oven' })).toHaveAttribute('src', expect.stringContaining('h1/kit/apo.jpg'));
});

test('hands-free: Listen, then "planner next" and "planner back" move the steps; plain "next" does nothing', async () => {
  const remove = installFakeSpeech();
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('button', { name: /Listen/ }));
  expect(screen.getByRole('button', { name: /Listening/ })).toHaveAttribute('aria-pressed', 'true');
  act(() => FakeRec.last!.say('what comes next'));
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  act(() => FakeRec.last!.say('what comes next planner next'));
  expect(screen.getByRole('heading', { name: 'Final toss' })).toBeInTheDocument();
  act(() => FakeRec.last!.say('planner back', 1));
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  act(() => FakeRec.last!.say('planner stop', 2));
  expect(screen.getByRole('button', { name: /Listen/ })).toHaveAttribute('aria-pressed', 'false');
  remove();
});

test('no Listen switch where the browser has no speech recognition', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  expect(screen.queryByRole('button', { name: /Listen/ })).not.toBeInTheDocument();
});

test("cook mode looks like Today's hour: white, the cards with your cartoons, settings in °C and °F", async () => {
  h.repo.listPrepPhotos.mockResolvedValue([{ key: 'icon:basmati rice', label: 'basmati rice', path: 'h1/prep/icon-rice.jpg', source: 'generated' }]);
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  expect(within(screen.getByRole('list', { name: 'For this step' })).getByRole('img', { name: 'basmati rice' })).toHaveAttribute('src', expect.stringContaining('icon-rice.jpg'));
  expect(screen.getByText(/100°C \/ 210°F/)).toBeInTheDocument();
});
