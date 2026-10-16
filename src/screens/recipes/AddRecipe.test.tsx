import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import type { RecipeImport } from '../../lib/types';
import RecipeLibrary from './RecipeLibrary';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const imp = (over: Partial<RecipeImport>): RecipeImport => ({
  id: 'i1', household_id: 'h1', url: 'https://www.bbcgoodfood.com/recipes/katsu', note: null, status: 'requested',
  requested_at: '2026-10-16T08:00:00Z', started_at: null, finished_at: null, recipe_id: null, summary: null, ...over,
});

beforeEach(() => { h.repo = fakeRepo(); });

test('a pasted link with a note is sent for Claude to convert, and shows as waiting', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Add recipe' }));
  const form = screen.getByRole('form', { name: 'Add a recipe from a link' });
  await userEvent.type(within(form).getByRole('textbox', { name: 'Recipe link' }), ' https://www.bbcgoodfood.com/recipes/katsu ');
  await userEvent.type(within(form).getByRole('textbox', { name: /Anything to change/ }), 'No mushrooms');
  await userEvent.click(within(form).getByRole('button', { name: 'Add recipe' }));
  expect(h.repo.requestImport).toHaveBeenCalledWith('h1', 'https://www.bbcgoodfood.com/recipes/katsu', 'No mushrooms');
  const card = await screen.findByRole('status', { name: 'Recipe from www.bbcgoodfood.com' });
  expect(card).toHaveTextContent('Waiting for Claude');
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});

test('something that is not a link is not sent', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Add recipe' }));
  const form = screen.getByRole('form', { name: 'Add a recipe from a link' });
  await userEvent.type(within(form).getByRole('textbox', { name: 'Recipe link' }), 'chicken katsu');
  await userEvent.click(within(form).getByRole('button', { name: 'Add recipe' }));
  expect(h.repo.requestImport).not.toHaveBeenCalled();
  expect(within(form).getByRole('alert')).toHaveTextContent('Paste a link to the recipe page');
});

test('imports show their progress; a finished one links to the new recipe and can be dismissed', async () => {
  h.repo.listImports.mockResolvedValue([
    imp({ id: 'i1', status: 'importing' }),
    imp({ id: 'i2', status: 'done', recipe_id: 'r-katsu', summary: 'Added Chicken Katsu: 6 portions, air-fryer and TM7 steps.' }),
  ]);
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  const statuses = await screen.findAllByRole('status', { name: 'Recipe from www.bbcgoodfood.com' });
  expect(statuses[0]).toHaveTextContent('Claude is converting it now');
  expect(statuses[1]).toHaveTextContent('Added Chicken Katsu');
  expect(within(statuses[1]).getByRole('link', { name: 'Open recipe' })).toHaveAttribute('href', '/recipes/r-katsu');
  await userEvent.click(within(statuses[1]).getByRole('button', { name: 'Dismiss' }));
  expect(h.repo.dismissImport).toHaveBeenCalledWith('i2');
  expect(screen.getAllByRole('status', { name: 'Recipe from www.bbcgoodfood.com' })).toHaveLength(1);
});

test('a failed import says why and can be tried again', async () => {
  h.repo.listImports.mockResolvedValue([imp({ status: 'failed', summary: 'The site blocked reading the page.' })]);
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  const card = await screen.findByRole('status', { name: 'Recipe from www.bbcgoodfood.com' });
  expect(card).toHaveTextContent("Couldn't add it: The site blocked reading the page.");
  await userEvent.click(within(card).getByRole('button', { name: 'Try again' }));
  expect(h.repo.retryImport).toHaveBeenCalledWith('i1');
  expect(card).toHaveTextContent('Waiting for Claude');
});
