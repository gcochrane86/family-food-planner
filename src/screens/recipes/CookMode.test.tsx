import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import CookMode from './CookMode';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));
vi.mock('../../lib/image', async (orig) => ({ ...(await orig<typeof import('../../lib/image')>()), resizeImage: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })) }));

beforeEach(() => { h.repo = fakeRepo(); });
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
  expect(screen.getByRole('timer')).toHaveTextContent('20:00');
  await act(async () => { vi.advanceTimersByTime(5_000); });
  expect(screen.getByRole('timer')).toHaveTextContent('19:55');
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
