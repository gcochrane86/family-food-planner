import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY } from '../../test/fixtures';
import RecipeCard from './RecipeCard';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); });

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

test('ingredients say whether they are in the pantry', async () => {
  h.repo.listStaples.mockResolvedValueOnce([{ id: 'p', ingredient_id: 'i', name: 'Basmati rice', status: 'have' }]);
  open('r-honey');
  expect((await screen.findByText('basmati rice')).closest('li')).toHaveTextContent('In pantry');
  expect(screen.getByText('chicken breast or thigh').closest('li')).toHaveTextContent('To buy');
});

test('both phases, machine badges and bold ingredients are shown', async () => {
  open('r-honey');
  expect(await screen.findByRole('heading', { name: '8pm prep, the night before' })).toBeInTheDocument();
  const finish = screen.getByRole('region', { name: 'Dinner-time finish' });
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

test('"New photo" generates a hero image and shows it', async () => {
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'New photo ✨' }));
  expect(h.repo.generateHero).toHaveBeenCalledWith('r-honey');
  expect(await screen.findByRole('img', { name: HONEY.title })).toHaveAttribute('src', 'https://img.test/h1/hero/r-honey-1.jpg');
});

test('a failed photo generation says so and keeps the placeholder', async () => {
  h.repo.generateHero.mockRejectedValueOnce(new Error("Google couldn't make the image: quota"));
  open('r-honey');
  await userEvent.click(await screen.findByRole('button', { name: 'New photo ✨' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make a photo: Google couldn't make the image: quota");
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('a recipe that does not exist says so', async () => {
  open('nope');
  expect(await screen.findByText("This recipe isn't in your library.")).toBeInTheDocument();
});
