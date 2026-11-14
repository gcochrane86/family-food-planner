import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import RecipeLibrary from './RecipeLibrary';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

let opened: string[] = [];
beforeEach(() => {
  h.repo = fakeRepo();
  opened = [];
  vi.spyOn(window, 'open').mockImplementation((url) => { opened.push(String(url)); return null; });
});
afterEach(() => { vi.restoreAllMocks(); });

test('a pasted link with a note opens the Claude app with both typed in; nothing waits on the Mac', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Add recipe' }));
  const form = screen.getByRole('form', { name: 'Add a recipe from a link' });
  await userEvent.type(within(form).getByRole('textbox', { name: 'Recipe link' }), ' https://www.youtube.com/watch?v=abcDEF12345 ');
  await userEvent.type(within(form).getByRole('textbox', { name: /Anything to change/ }), 'No mushrooms');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(opened).toHaveLength(1);
  const ask = decodeURIComponent(opened[0].replace('https://claude.ai/new?q=', ''));
  expect(ask).toBe('Add this recipe to the Family Food Planner: https://www.youtube.com/watch?v=abcDEF12345. No mushrooms');
  expect(h.repo.requestImport).not.toHaveBeenCalled();
  expect(screen.queryByRole('form', { name: 'Add a recipe from a link' })).not.toBeInTheDocument();
});

test('something that is not a link opens nothing', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Add recipe' }));
  const form = screen.getByRole('form', { name: 'Add a recipe from a link' });
  await userEvent.type(within(form).getByRole('textbox', { name: 'Recipe link' }), 'katsu curry');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Paste a link/);
  expect(opened).toEqual([]);
});
