import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import RecipeLibrary from './RecipeLibrary';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); });

test('lists every recipe as a link to its card', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('link', { name: /Almond-Crusted Honey Chilli Chicken/ })).toHaveAttribute('href', '/recipes/r-honey');
  expect(screen.getByRole('link', { name: /Gourmet Lamb Doner/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Miso Glazed Aubergine Tacos/ })).toBeInTheDocument();
});

test('filters narrow the list', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Honey Chilli/ });
  await userEvent.click(screen.getByRole('button', { name: '≤30 min' }));
  expect(screen.getByRole('link', { name: /Honey Chilli/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Lamb Doner/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Toddler OK' }));
  expect(screen.queryByRole('link', { name: /Lamb Doner/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(screen.getByRole('link', { name: /Lamb Doner/ })).toBeInTheDocument();
});

test('the TM7 filter keeps only recipes that use it', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await screen.findByRole('link', { name: /Honey Chilli/ });
  await userEvent.click(screen.getByRole('button', { name: 'TM7' }));
  expect(screen.queryByRole('link', { name: /Aubergine Tacos/ })).not.toBeInTheDocument();
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
