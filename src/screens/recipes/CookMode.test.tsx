import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY } from '../../test/fixtures';
import CookMode from './CookMode';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));
vi.mock('../../lib/image', async (orig) => ({ ...(await orig<typeof import('../../lib/image')>()), resizeImage: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })) }));

beforeEach(() => { h.repo = fakeRepo(); sessionStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

function open() {
  return render(
    <MemoryRouter initialEntries={['/recipes/r-honey/cook']}>
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

test('the 8pm prep tab shows the prep steps', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('tab', { name: '8pm prep' }));
  expect(screen.getByRole('heading', { name: 'The bulk sauce' })).toBeInTheDocument();
});

test('the timer counts down from the step time', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('button', { name: 'Start 20:00 timer' }));
  expect(screen.getByRole('timer', { name: 'Rice on timer' })).toHaveTextContent('20:00');
  await act(async () => { vi.advanceTimersByTime(5_000); });
  expect(screen.getByRole('timer', { name: 'Rice on timer' })).toHaveTextContent('19:55');
});

test('a running timer stays visible after moving to the next step', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('button', { name: 'Start 20:00 timer' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByRole('heading', { name: 'Final toss' })).toBeInTheDocument();
  await act(async () => { vi.advanceTimersByTime(5_000); });
  expect(screen.getByRole('timer', { name: 'Rice on timer' })).toHaveTextContent('19:5');
});

test('a timer that finishes beeps, vibrates and says so', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const vibrate = vi.fn();
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('button', { name: 'Start 20:00 timer' }));
  await act(async () => { vi.advanceTimersByTime(20 * 60_000 + 1_000); });
  expect(screen.getByRole('status')).toHaveTextContent('Rice on: done');
  expect(vibrate).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(5_000); });
  expect(vibrate).toHaveBeenCalledTimes(1);
});

test('timers survive leaving and reopening cook mode', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const first = open();
  await screen.findByRole('heading', { name: 'Rice on' });
  await userEvent.click(screen.getByRole('button', { name: 'Start 20:00 timer' }));
  first.unmount();
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  expect(screen.getByRole('timer', { name: 'Rice on timer' })).toBeInTheDocument();
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
  expect(await screen.findByRole('img', { name: HONEY.title })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: '8pm prep' }));
  expect(screen.getByRole('img', { name: 'Photo of this step' })).toBeInTheDocument();
});

test('adding a step photo lives in the cook mode settings menu', async () => {
  open();
  await screen.findByRole('heading', { name: 'Rice on' });
  expect(screen.queryByText(/^(Add|Replace) photo$/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cook mode settings' }));
  expect(screen.getByRole('menuitem', { name: 'Add a photo of this step' })).toBeInTheDocument();
});
