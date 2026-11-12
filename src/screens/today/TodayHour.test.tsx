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
const open = () => render(<TodayHour />, { wrapper: MemoryRouter });

test('the first page shows the hour, the chopping list and what to wash', async () => {
  open();
  expect(await screen.findByRole('heading', { name: "Today's hour · 17:30–18:30" })).toBeInTheDocument();
  const list = screen.getByRole('region', { name: 'Chopping' });
  expect(within(list).getByText('For Almond-Crusted Honey Chilli Chicken')).toBeInTheDocument();
  expect(within(list).getByText(/chicken breast or thigh/)).toBeInTheDocument();
  expect(within(list).getByText(/on its own mat/)).toBeInTheDocument();
  expect(screen.getByText(/To wash: Board, Knife/)).toBeInTheDocument();
  expect(screen.getByText(/minutes hands-on/)).toBeInTheDocument();
});

test('Start goes to the first step and Next steps through, with no timers', async () => {
  open();
  await user().click(await screen.findByRole('button', { name: 'Start' }));
  expect(screen.getByText('17:30')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Chop everything' })).toBeInTheDocument();
  await user().click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Board, knife and bowls into the dishwasher' })).toBeInTheDocument();
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
  expect(await screen.findByRole('heading', { name: 'Rice on' })).toBeInTheDocument();
});

test("tonight's amounts include the portions for tomorrow's leftovers lunch", async () => {
  open();
  const list = await screen.findByRole('region', { name: 'Chopping' });
  // 3 portions tonight plus 3 for Tuesday's lunch, of a 6-portion recipe: the full 1.2kg.
  expect(within(list).getByText(/1\.2kg chicken breast or thigh/)).toBeInTheDocument();
});

test("tonight's version is what gets chopped", async () => {
  h.repo.getWeek.mockImplementation(week((s) => (s.date === '2026-10-19' && s.slot === 'dinner' ? { ...s, version: HONEY_VERSION } : s)));
  open();
  const list = await screen.findByRole('region', { name: 'Chopping' });
  expect(within(list).getByText(/turkey breast/)).toBeInTheDocument();
  expect(within(list).queryByText(/chicken breast/)).not.toBeInTheDocument();
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
  expect(button).toHaveTextContent(/5 photos/);
  await user().click(button);
  expect(h.repo.generateStepPhoto).toHaveBeenCalledWith('r-honey', 's-rice', false, true);
  expect(await screen.findByText(/Step photos made/)).toBeInTheDocument();
});

test('a recipe with no main photo gets one first, then its step photos, and the count includes it', async () => {
  open();
  const button = await screen.findByRole('button', { name: /Add step photos/ });
  expect(button).toHaveTextContent(/5 photos, about 15p/);
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
  expect(h.repo.generatePrepPhoto).toHaveBeenCalledTimes(1);
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
