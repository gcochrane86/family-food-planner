import { fireEvent, render, screen } from '@testing-library/react';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import { HONEY } from '../../test/fixtures';
import MealPhoto from './MealPhoto';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));

beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.heroUrl.mockImplementation((p: string, w?: number) => (w && w <= 640 ? `https://img.test/small/${p}` : `https://img.test/${p}`));
});
const recipe = { ...HONEY, hero_image_path: 'h1/hero/honey.jpg' };

test("shows the small copy, falls back to the original when there's none yet (and makes one), and only then the placeholder", () => {
  render(<MealPhoto recipe={recipe} alt="Honey chicken" className="" />);
  const img = screen.getByRole('img', { name: 'Honey chicken' });
  expect(img).toHaveAttribute('src', 'https://img.test/small/h1/hero/honey.jpg');
  expect(img).toHaveAttribute('crossorigin', 'anonymous');
  fireEvent.error(img);
  expect(screen.getByRole('img', { name: 'Honey chicken' })).toHaveAttribute('src', 'https://img.test/h1/hero/honey.jpg');
  expect(h.repo.makeSmallCopy).toHaveBeenCalledWith('h1/hero/honey.jpg');
  fireEvent.error(screen.getByRole('img', { name: 'Honey chicken' }));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('Photo of Honey chicken')).toBeInTheDocument();
});
