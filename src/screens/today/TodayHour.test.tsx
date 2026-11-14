import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '../../lib/household';
import type { MealSlot, PlanWeek } from '../../lib/types';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY, HONEY_VERSION, NEXT_WEEK } from '../../test/fixtures';
import TodayHour from './TodayHour';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../lib/image', async (orig) => ({ ...(await orig<typeof import('../../lib/image')>()), resizeImage: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })) }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const week = (edit: (s: MealSlot) => MealSlot = (s) => s) => async (_hid: string, ws: string) =>
  (ws === '2026-10-19' ? { week: NEXT_WEEK.week, slots: NEXT_WEEK.slots.map((s) => edit({ ...s })) } : { week: null, slots: [] }) as { week: PlanWeek | null; slots: MealSlot[] };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z')); // Monday: honey chilli chicken tonight, its leftovers for Tuesday's lunch
  sessionStorage.clear();
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
  h.repo.getWeek.mockImplementation(week());
});
afterEach(() => { vi.useRealTimers(); });
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
import { FakeRec, installFakeSpeech } from '../../test/fakeSpeech';
const open = () => render(<TodayHour />, { wrapper: MemoryRouter });

test('the first page is just the hour, what to get out, and Start; the chopping is on its own step', async () => {
  open();
  expect(await screen.findByRole('heading', { name: "Today's hour · 17:30–18:30" })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Get it out' })).getByText('Chicken breast or thigh')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Chopping' })).not.toBeInTheDocument();
  expect(screen.queryByText(/To wash/)).not.toBeInTheDocument();
  expect(screen.getByText(/minutes hands-on/)).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Start' }));
  // No headings for ordinary chopping; raw meat still says to do it last on its own board.
  expect(screen.queryByText(/^For /)).not.toBeInTheDocument();
  expect(screen.queryByText(/Into one bowl/)).not.toBeInTheDocument();
  expect(screen.getByText(/Raw meat and fish: last, on a separate board/)).toBeInTheDocument();
});

test('Start goes to the first step and Next steps through, with no timers', async () => {
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  expect(screen.getByText('17:30')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Chop all the ingredients below' })).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Board, knife and bowls into the dishwasher' })).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Next' }));
  // No hour on Sunday, so tonight's prep is done first.
  expect(screen.getByRole('heading', { name: "From yesterday's prep: The bulk sauce" })).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /timer/i })).not.toBeInTheDocument();
});

test("leftovers for tomorrow's lunch are packed after plating up", async () => {
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  while (!screen.queryByRole('heading', { name: 'Plate up' })) await user().click(screen.getByRole('button', { name: 'Next' }));
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: "Pack tomorrow's lunch: Almond-Crusted Honey Chilli Chicken" })).toBeInTheDocument();
});

test("out tonight: no dinner to cook, but tomorrow's night-before breakfast", async () => {
  h.repo.getWeek.mockImplementation(week((s) => (s.date === '2026-10-19' && s.slot === 'dinner' ? { ...s, mode: 'out', recipe_id: null }
    : s.date === '2026-10-20' && s.slot === 'breakfast' ? { ...s, routine_choice: 'Overnight oats' } : s)));
  open();
  expect(await screen.findByText('No dinner to cook tonight')).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Start' }));
  expect(screen.getByRole('heading', { name: 'Make the overnight oats' })).toBeInTheDocument();
});

test('coming back mid-hour keeps your step', async () => {
  const first = open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  await user().click(screen.getByRole('button', { name: 'Next' }));
  await user().click(screen.getByRole('button', { name: 'Next' }));
  first.unmount();
  open();
  expect(await screen.findByRole('heading', { name: "From yesterday's prep: The bulk sauce" })).toBeInTheDocument();
});

test("tonight's amounts include the portions for tomorrow's leftovers lunch", async () => {
  open();
  const list = await screen.findByRole('region', { name: 'Get it out' });
  // 3 portions tonight plus 3 for Tuesday's lunch, of a 6-portion recipe: the full 1.2kg.
  expect(within(list).getByText('1.2kg')).toBeInTheDocument();
});

test("tonight's version is what gets chopped", async () => {
  h.repo.getWeek.mockImplementation(week((s) => (s.date === '2026-10-19' && s.slot === 'dinner' ? { ...s, version: HONEY_VERSION } : s)));
  open();
  const list = await screen.findByRole('region', { name: 'Get it out' });
  expect(within(list).getByText(/turkey breast/i)).toBeInTheDocument();
  expect(within(list).queryByText(/chicken breast/i)).not.toBeInTheDocument();
});

test("steps show their recipe's pictures, and cleaning steps an icon", async () => {
  h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? { ...HONEY, hero_image_path: 'h1/hero/honey.jpg' } : null));
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  expect(screen.getAllByRole('img', { name: 'Almond-Crusted Honey Chilli Chicken' }).length).toBeGreaterThan(0);
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Board, knife and bowls into the dishwasher' })).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'Almond-Crusted Honey Chilli Chicken' })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Cleaning' })).toBeInTheDocument();
});

test('the first page offers to make the missing step photos, and makes them in the background', async () => {
  open();
  const button = await screen.findByRole('button', { name: /Add step photos/ });
  expect(button).toHaveTextContent(/7 photos/); // 2 get-out pictures, 1 chopping photo, the main photo and 3 step photos
  await user().click(button);
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith('r-honey', 's-rice', false, true);
  expect(await screen.findByText(/Step photos made/)).toBeInTheDocument();
});

test('a recipe with no main photo gets one first, then its step photos, and the count includes it', async () => {
  open();
  const button = await screen.findByRole('button', { name: /Add step photos/ });
  expect(button).toHaveTextContent(/7 photos, about 21p/);
  await user().click(button);
  await screen.findByText(/Step photos made/);
  expect(h.repo.generateHero).toHaveBeenCalledWith('r-honey');
  expect(h.repo.generateHero.mock.invocationCallOrder[0]).toBeLessThan(h.repo.generateStepPhoto.mock.invocationCallOrder[0]);
});

test('a machine-only step shows your photo of the machine', async () => {
  h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? { ...HONEY, steps: [
    { id: 's-heat', phase: 'finish', position: 1, at_minute: 0, title: 'Heat the Anova', body: 'Preheat the Anova and line a tray.', machine: 'apo', settings: '190°C', timer_minutes: 5, image_path: null, image_source: null },
    ...HONEY.steps.filter((s) => s.phase === 'finish').map((s) => ({ ...s, position: s.position + 1, at_minute: (s.at_minute ?? 0) + 5 })),
  ] } : null));
  h.repo.listEquipment.mockResolvedValue([{ id: 'e1', household_id: 'h1', code: 'apo', name: 'Anova Precision Oven', photo: 'h1/kit/apo.jpg' }]);
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  while (!screen.queryByRole('heading', { name: 'Heat the Anova' })) await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('img', { name: 'Anova Precision Oven' })).toBeInTheDocument();
});

test('Add step photos also makes the chopping-board photos, once per cut, and the chop step shows them', async () => {
  h.repo.listPrepPhotos.mockResolvedValue([]);
  open();
  await user().click(await screen.findByRole('button', { name: /Add step photos/ }));
  await screen.findByText(/Step photos made/);
  expect(h.repo.generatePrepPhoto).toHaveBeenCalledWith('h1', 'chicken breast or thigh', '10mm batons');
  expect(h.repo.generatePrepPhoto.mock.calls.filter((c) => c[5] !== true)).toHaveLength(1);
});

test('saved chopping photos show on the chop step', async () => {
  h.repo.listPrepPhotos.mockResolvedValue([{ key: 'chicken breast or thigh|strips (10mm)', label: 'chicken breast or thigh, strips (10mm)', path: 'h1/prep/chicken.jpg', source: 'generated' }]);
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  expect(screen.getByRole('img', { name: 'chicken breast or thigh, strips (10mm)' })).toBeInTheDocument();
});

test('holding a chopping photo offers a new photo, or your own; nothing shows under the photo', async () => {
  h.repo.listPrepPhotos.mockResolvedValue([{ key: 'chicken breast or thigh|strips (10mm)', label: 'chicken breast or thigh, strips (10mm)', path: 'h1/prep/chicken.jpg', source: 'generated' }]);
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  expect(screen.queryByText('Remake')).not.toBeInTheDocument();
  const photo = screen.getByRole('img', { name: 'chicken breast or thigh, strips (10mm)' });
  fireEvent.pointerDown(photo, { clientX: 10, clientY: 10 });
  await act(async () => { vi.advanceTimersByTime(600); });
  fireEvent.pointerUp(photo);
  const sheet = screen.getByRole('dialog', { name: 'chicken breast or thigh, strips (10mm)' });
  await user().click(within(sheet).getByRole('button', { name: 'Make a new photo' }));
  await user().type(screen.getByLabelText('What should it show? (optional)'), 'thinner strips');
  await user().click(screen.getByRole('button', { name: 'Make it' }));
  expect(h.repo.generatePrepPhoto).toHaveBeenCalledWith('h1', 'chicken breast or thigh', '10mm batons', true, 'thinner strips');
  fireEvent.pointerDown(photo, { clientX: 10, clientY: 10 });
  await act(async () => { vi.advanceTimersByTime(600); });
  await user().upload(screen.getByLabelText('Use my own photo'), new File(['x'], 'c.jpg', { type: 'image/jpeg' }));
  expect(h.repo.uploadPrepPhoto).toHaveBeenCalledWith('h1', 'chicken breast or thigh|strips (10mm)', 'chicken breast or thigh, strips (10mm)', expect.any(Blob));
});

test("holding a recipe step's photo offers a new photo for that step, or your own", async () => {
  h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? { ...HONEY, hero_image_path: 'h1/hero/honey.jpg' } : null));
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  while (!screen.queryByRole('heading', { name: 'Rice on' })) await user().click(screen.getByRole('button', { name: 'Next' }));
  const photo = screen.getByRole('img', { name: 'Almond-Crusted Honey Chilli Chicken' });
  fireEvent.pointerDown(photo, { clientX: 10, clientY: 10 });
  await act(async () => { vi.advanceTimersByTime(600); });
  fireEvent.pointerUp(photo);
  const sheet = screen.getByRole('dialog', { name: 'Rice on' });
  await user().click(within(sheet).getByRole('button', { name: 'Make a new photo' }));
  await user().type(screen.getByLabelText('What should it show? (optional)'), 'rice in the TM7 basket');
  await user().click(screen.getByRole('button', { name: 'Make it' }));
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith('r-honey', 's-rice', false, true, { hint: 'rice in the TM7 basket' });
  fireEvent.pointerDown(photo, { clientX: 10, clientY: 10 });
  await act(async () => { vi.advanceTimersByTime(600); });
  await user().upload(screen.getByLabelText('Use my own photo'), new File(['x'], 'r.jpg', { type: 'image/jpeg' }));
  expect(h.repo.uploadStepPhoto).toHaveBeenCalledWith('h1', 's-rice', expect.any(Blob));
});

test('the chopping step lists each item with its weight and how to cut it', async () => {
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  const step = screen.getByRole('region', { name: /^Step 1 of/ });
  expect(within(step).getByText('1.2kg')).toBeInTheDocument();
  expect(within(step).getByText('Cut the chicken breast or thigh into 10mm strips')).toBeInTheDocument();
  expect(screen.queryByText('chicken breast or thigh, strips (10mm)')).not.toBeInTheDocument();
  expect(within(step).getByText('Chicken breast or thigh')).toBeInTheDocument();
});

test('while a new photo is being made, a bar says so until it is done', async () => {
  let finish: (v: string) => void = () => {};
  h.repo.generatePrepPhoto.mockImplementation(() => new Promise<string>((r) => { finish = r; }));
  h.repo.listPrepPhotos.mockResolvedValue([{ key: 'chicken breast or thigh|strips (10mm)', label: 'chicken breast or thigh, strips (10mm)', path: 'h1/prep/chicken.jpg', source: 'generated' }]);
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  const photo = screen.getByRole('img', { name: 'chicken breast or thigh, strips (10mm)' });
  fireEvent.pointerDown(photo, { clientX: 10, clientY: 10 });
  await act(async () => { vi.advanceTimersByTime(600); });
  fireEvent.pointerUp(photo);
  await user().click(screen.getByRole('button', { name: 'Make a new photo' }));
  await user().click(screen.getByRole('button', { name: 'Make it' }));
  expect(screen.getByRole('status', { name: 'Making a new photo' })).toBeInTheDocument();
  await act(async () => { finish('h1/prep/new.jpg'); });
  expect(screen.queryByRole('status', { name: 'Making a new photo' })).not.toBeInTheDocument();
});

test('hands-free in Today\'s hour: "planner next" starts the hour and steps on', async () => {
  const remove = installFakeSpeech();
  open();
  await screen.findByRole('button', { name: 'Start' });
  await user().click(screen.getByRole('button', { name: /Listen/ }));
  act(() => FakeRec.last!.say('planner next'));
  expect(screen.getByRole('heading', { name: 'Chop all the ingredients below' })).toBeInTheDocument();
  act(() => FakeRec.last!.say('planner next planner next planner next'));
  expect(screen.getByRole('heading', { name: "From yesterday's prep: The bulk sauce" })).toBeInTheDocument();
  remove();
});

test('the first page lists what to get out, by fridge and cupboard, each with a label and amount', async () => {
  h.repo.listPrepPhotos.mockResolvedValue([{ key: 'icon:basmati rice', label: 'basmati rice', path: 'h1/prep/icon-rice.jpg', source: 'generated' }]);
  open();
  const list = await screen.findByRole('region', { name: 'Get it out' });
  const fridge = within(list).getByRole('list', { name: 'Fridge' });
  const cupboard = within(list).getByRole('list', { name: 'Cupboard' });
  expect(within(fridge).getByText('Chicken breast or thigh')).toBeInTheDocument();
  expect(within(cupboard).getByText('Basmati rice')).toBeInTheDocument();
  expect(within(cupboard).getByRole('img', { name: 'basmati rice' })).toHaveAttribute('src', expect.stringContaining('icon-rice.jpg'));
  expect(within(cupboard).getByText(/\d+g/)).toBeInTheDocument();
});

test('Add step photos makes the missing get-out pictures too, and holding one offers a new one', async () => {
  h.repo.listPrepPhotos.mockResolvedValue([{ key: 'icon:basmati rice', label: 'basmati rice', path: 'h1/prep/icon-rice.jpg', source: 'generated' }]);
  open();
  await user().click(await screen.findByRole('button', { name: /Add step photos/ }));
  await screen.findByText(/Step photos made/);
  expect(h.repo.generatePrepPhoto).toHaveBeenCalledWith('h1', 'chicken breast or thigh', null, false, undefined, true);
  expect(h.repo.generatePrepPhoto).not.toHaveBeenCalledWith('h1', 'basmati rice', null, false, undefined, true);
  const rice = screen.getByRole('img', { name: 'basmati rice' });
  fireEvent.pointerDown(rice, { clientX: 10, clientY: 10 });
  await act(async () => { vi.advanceTimersByTime(600); });
  fireEvent.pointerUp(rice);
  const sheet = screen.getByRole('dialog', { name: 'basmati rice' });
  await user().click(within(sheet).getByRole('button', { name: 'Make a new photo' }));
  await user().click(screen.getByRole('button', { name: 'Make it' }));
  expect(h.repo.generatePrepPhoto).toHaveBeenCalledWith('h1', 'basmati rice', null, true, undefined, true);
});

test('the step pages show the same pictures: tiles for what a step uses, and beside each thing to chop', async () => {
  h.repo.listPrepPhotos.mockResolvedValue([
    { key: 'icon:basmati rice', label: 'basmati rice', path: 'h1/prep/icon-rice.jpg', source: 'generated' },
    { key: 'icon:chicken breast or thigh', label: 'chicken breast or thigh', path: 'h1/prep/icon-chicken.jpg', source: 'generated' },
  ]);
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  expect(screen.getByRole('img', { name: 'chicken breast or thigh' })).toHaveAttribute('src', expect.stringContaining('icon-chicken.jpg'));
  // The chopping is tiles too: name, then the amount and the cut.
  const chop = screen.getByRole('list', { name: 'Raw meat and fish' });
  expect(within(chop).getByText('Chicken breast or thigh')).toBeInTheDocument();
  expect(within(chop).getByText('Cut the chicken breast or thigh into 10mm strips')).toBeInTheDocument();
  while (!screen.queryByRole('heading', { name: 'Rice on' })) await user().click(screen.getByRole('button', { name: 'Next' }));
  const uses = screen.getByRole('list', { name: 'For this step' });
  expect(within(uses).getByText('Basmati rice')).toBeInTheDocument();
  expect(within(uses).getByRole('img', { name: 'basmati rice' })).toHaveAttribute('src', expect.stringContaining('icon-rice.jpg'));
});

test('Add step photos redraws older realistic step photos as cartoons', async () => {
  h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? { ...HONEY, hero_image_path: 'h1/hero/honey.jpg',
    steps: HONEY.steps.map((s) => ({ ...s, image_path: `h1/steps/${s.id}.jpg`, image_source: 'generated' as const })) } : null));
  h.repo.listPrepPhotos.mockResolvedValue([]);
  open();
  await user().click(await screen.findByRole('button', { name: /Add step photos/ }));
  await screen.findByText(/Step photos made/);
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith('r-honey', 's-rice', true, true);
});

test('if making photos stops on an error, it says why and Try again carries on', async () => {
  h.repo.generateStepPhoto.mockRejectedValueOnce(new Error('Failed to send a request to the Edge Function (Load failed)'));
  open();
  await user().click(await screen.findByRole('button', { name: /Add step photos/ }));
  expect(await screen.findByText(/Couldn't make step photos: Failed to send a request/)).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/Step photos made/)).toBeInTheDocument();
});

test('tapping a get-out item ticks it off and drops it to the bottom; it stays ticked for today', async () => {
  localStorage.clear();
  h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? { ...HONEY, ingredients: [
    ...HONEY.ingredients, { position: 3, group_name: null, name: 'red pepper', qty: 2, unit: '', note: 'strips', qty_approx: false },
  ] } : null));
  const view = open();
  const fridge = await screen.findByRole('list', { name: 'Fridge' });
  const names = () => within(fridge).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'));
  expect(names()).toEqual(['chicken breast or thigh', 'red pepper']);
  await user().click(within(fridge).getByRole('checkbox', { name: 'chicken breast or thigh' }));
  expect(within(fridge).getByRole('checkbox', { name: 'chicken breast or thigh' })).toHaveAttribute('aria-checked', 'true');
  expect(names()).toEqual(['red pepper', 'chicken breast or thigh']);
  view.unmount();
  open();
  expect(within(await screen.findByRole('list', { name: 'Fridge' })).getByRole('checkbox', { name: 'chicken breast or thigh' })).toHaveAttribute('aria-checked', 'true');
});

test('swiping moves between the steps; oven settings show °F too, large', async () => {
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  const area = () => screen.getByRole('region', { name: /^Step \d+ of/ });
  expect(screen.getByRole('heading', { name: 'Chop all the ingredients below' })).toBeInTheDocument();
  fireEvent.touchStart(area(), { touches: [{ clientX: 300, clientY: 200 }] });
  fireEvent.touchEnd(area(), { changedTouches: [{ clientX: 100, clientY: 210 }] });
  expect(screen.getByRole('heading', { name: 'Board, knife and bowls into the dishwasher' })).toBeInTheDocument();
  fireEvent.touchStart(area(), { touches: [{ clientX: 300, clientY: 200 }] });
  fireEvent.touchEnd(area(), { changedTouches: [{ clientX: 100, clientY: 210 }] });
  expect(screen.getByRole('heading', { name: "From yesterday's prep: The bulk sauce" })).toBeInTheDocument();
  fireEvent.touchStart(area(), { touches: [{ clientX: 300, clientY: 200 }] });
  fireEvent.touchEnd(area(), { changedTouches: [{ clientX: 100, clientY: 210 }] });
  expect(screen.getByText(/100°C \/ 210°F/)).toBeInTheDocument();
  fireEvent.touchStart(area(), { touches: [{ clientX: 100, clientY: 200 }] });
  fireEvent.touchEnd(area(), { changedTouches: [{ clientX: 300, clientY: 205 }] });
  expect(screen.getByRole('heading', { name: "From yesterday's prep: The bulk sauce" })).toBeInTheDocument();
  // A mostly-up-and-down drag is a scroll, not a swipe.
  fireEvent.touchStart(area(), { touches: [{ clientX: 300, clientY: 100 }] });
  fireEvent.touchEnd(area(), { changedTouches: [{ clientX: 260, clientY: 400 }] });
  expect(screen.getByRole('heading', { name: "From yesterday's prep: The bulk sauce" })).toBeInTheDocument();
});

test('Plate up shows the dish photo large, on its own, centred under the text', async () => {
  h.repo.getRecipe.mockImplementation(async (id: string) => (id === 'r-honey' ? { ...HONEY, hero_image_path: 'h1/hero/honey.jpg' } : null));
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  while (!screen.queryByRole('heading', { name: 'Plate up' })) await user().click(screen.getByRole('button', { name: 'Next' }));
  const step = screen.getByRole('region', { name: /^Step \d+ of/ });
  expect(step).toHaveAttribute('data-layout', 'centred');
  expect(within(step).getByRole('img', { name: HONEY.title })).toBeInTheDocument();
});

test('clean-up steps are centred, with a big sponge under the text', async () => {
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  await user().click(screen.getByRole('button', { name: 'Next' }));
  const step = screen.getByRole('region', { name: /^Step \d+ of/ });
  expect(within(step).getByRole('heading', { name: 'Board, knife and bowls into the dishwasher' })).toBeInTheDocument();
  expect(step).toHaveAttribute('data-layout', 'centred');
  expect(within(step).getByRole('img', { name: 'Cleaning' })).toHaveClass('text-[clamp(120px,22vw,220px)]');
});

test("tomorrow's chicken sandwich lunch: the hour roasts the chicken, unless today's sandwiches came from last night's roast", async () => {
  const SANDWICH = { ...HONEY, id: 'r-sandwich', slug: 'chicken-sandwich', title: 'Chicken Sandwich', kind: 'component' as const, reheats_well: false,
    ingredients: [{ position: 1, group_name: null, name: 'whole chicken', qty: 1, unit: '', note: 'spatchcocked', qty_approx: true }],
    steps: [
      { id: 's-roast', phase: 'prep_8pm' as const, position: 1, at_minute: null, title: 'Roast in the Anova', body: 'Roast the **whole chicken**.', machine: 'apo' as const, settings: '200°C', timer_minutes: 45, image_path: null, image_source: null },
      { id: 's-build', phase: 'finish' as const, position: 1, at_minute: 0, title: 'Build', body: 'Build.', machine: null, settings: null, timer_minutes: null, image_path: null, image_source: null },
    ] };
  h.repo.listRecipes.mockResolvedValue([HONEY, SANDWICH]);
  h.repo.getRecipe.mockImplementation(async (id: string) => ({ 'r-honey': HONEY, 'r-sandwich': SANDWICH } as Record<string, typeof HONEY>)[id] ?? null);
  const sandwichOn = (dates: string[]) => week((s) => (s.slot === 'lunch' && dates.includes(s.date) ? { ...s, recipe_id: null, mode: 'routine' as const, source_date: null, routine_choice: 'Chicken sandwich' } : s));
  h.repo.getWeek.mockImplementation(sandwichOn(['2026-10-20']));
  const first = open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  const titles = async () => { const out: string[] = []; for (;;) { out.push(screen.getByRole('heading', { level: 1 }).textContent ?? ''); const next = screen.queryByRole('button', { name: 'Next' }); if (!next) return out; await user().click(next); } };
  expect(await titles()).toContain("For tomorrow's lunch: Roast in the Anova");
  first.unmount();
  sessionStorage.clear();
  // Monday's lunch was a chicken sandwich too, so Sunday's roast still covers Tuesday.
  h.repo.getWeek.mockImplementation(sandwichOn(['2026-10-19', '2026-10-20']));
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  expect(await titles()).not.toContain("For tomorrow's lunch: Roast in the Anova");
});

test("the chopping picture is the board with a small cartoon of each thing to chop beside it, as one picture", async () => {
  h.repo.listPrepPhotos.mockResolvedValue([
    { key: 'chicken breast or thigh|strips (10mm)', label: 'chicken breast or thigh, strips (10mm)', path: 'h1/prep/cartoon-chicken.jpg', source: 'generated' },
    { key: 'icon:chicken breast or thigh', label: 'chicken breast or thigh', path: 'h1/prep/icon-chicken.jpg', source: 'generated' },
  ]);
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  const pic = screen.getByRole('figure', { name: /Everything to chop/ });
  expect(within(pic).getByRole('img', { name: 'chicken breast or thigh, strips (10mm)' })).toBeInTheDocument();
  expect([...pic.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(expect.arrayContaining([expect.stringContaining('icon-chicken.jpg')]));
});
