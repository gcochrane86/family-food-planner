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

const asked = () => decodeURIComponent(opened[0].replace('https://claude.ai/new?q=', ''));
async function pick(option: RegExp) {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Add a recipe' }));
  await userEvent.click(within(screen.getByRole('group', { name: 'Add a recipe' })).getByRole('button', { name: option }));
  return screen.getByRole('form');
}

test('Add a recipe offers four ways, and a quick snack', async () => {
  render(<RecipeLibrary />, { wrapper: MemoryRouter });
  await userEvent.click(await screen.findByRole('button', { name: 'Add a recipe' }));
  const panel = screen.getByRole('group', { name: 'Add a recipe' });
  for (const name of [/Create with Claude/, /From a YouTube video/, /From a website/, /From Cookidoo/, /Quick snack/]) {
    expect(within(panel).getByRole('button', { name })).toBeInTheDocument();
  }
});

test('from a website: the link and a note open the Claude app with both typed in', async () => {
  const form = await pick(/From a website/);
  await userEvent.type(within(form).getByRole('textbox', { name: 'Recipe link' }), ' https://www.bbcgoodfood.com/recipes/curry ');
  await userEvent.type(within(form).getByRole('textbox', { name: /Anything to change/ }), 'No mushrooms');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(asked()).toBe('Add this recipe to the Family Food Planner: https://www.bbcgoodfood.com/recipes/curry. No mushrooms');
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});

test('from a website: something that is not a link opens nothing', async () => {
  const form = await pick(/From a website/);
  await userEvent.type(within(form).getByRole('textbox', { name: 'Recipe link' }), 'katsu curry');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Paste a link/);
  expect(opened).toEqual([]);
});

test('from a YouTube video: the link, which part and a note', async () => {
  const form = await pick(/From a YouTube video/);
  await userEvent.type(within(form).getByRole('textbox', { name: 'Video link' }), 'https://youtu.be/abcDEF12345');
  await userEvent.type(within(form).getByRole('textbox', { name: /Which part/ }), 'the curry, from 1:12:00');
  await userEvent.type(within(form).getByRole('textbox', { name: /Anything to change/ }), 'Milder');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(asked()).toBe('Add this recipe to the Family Food Planner: https://youtu.be/abcDEF12345 (the curry, from 1:12:00). Milder');
});

test('from a YouTube video: a link that is not YouTube opens nothing', async () => {
  const form = await pick(/From a YouTube video/);
  await userEvent.type(within(form).getByRole('textbox', { name: 'Video link' }), 'https://www.bbcgoodfood.com/recipes/curry');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/YouTube/);
  expect(opened).toEqual([]);
});

test('create with Claude: what you want opens the Claude app to write a new recipe', async () => {
  const form = await pick(/Create with Claude/);
  await userEvent.type(within(form).getByRole('textbox', { name: /What would you like/ }), 'A quick salmon traybake the little one will eat');
  await userEvent.click(within(form).getByRole('button', { name: 'Create with Claude' }));
  expect(asked()).toBe('Create a new recipe for the Family Food Planner: A quick salmon traybake the little one will eat');
});

test('from Cookidoo: the link and the pasted recipe go to the Claude app', async () => {
  const form = await pick(/From Cookidoo/);
  await userEvent.type(within(form).getByRole('textbox', { name: 'Cookidoo link' }), 'https://cookidoo.co.uk/recipes/recipe/en-GB/r59322');
  await userEvent.type(within(form).getByRole('textbox', { name: /The recipe, pasted/ }), 'Chicken korma. Ingredients: 500g chicken. Preparation: 1. Chop 5 sec/speed 5.');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(asked()).toBe('Add this Cookidoo recipe to the Family Food Planner (source_url https://cookidoo.co.uk/recipes/recipe/en-GB/r59322). Here it is, pasted from Cookidoo:\n\nChicken korma. Ingredients: 500g chicken. Preparation: 1. Chop 5 sec/speed 5.');
});

test('from Cookidoo: it needs a Cookidoo link and the recipe pasted in', async () => {
  const form = await pick(/From Cookidoo/);
  await userEvent.type(within(form).getByRole('textbox', { name: 'Cookidoo link' }), 'https://example.com/r1');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Cookidoo link/);
  await userEvent.clear(within(form).getByRole('textbox', { name: 'Cookidoo link' }));
  await userEvent.type(within(form).getByRole('textbox', { name: 'Cookidoo link' }), 'https://cookidoo.co.uk/created-recipes/en-GB/abc');
  await userEvent.click(within(form).getByRole('button', { name: 'Add with Claude' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Paste the recipe/);
  expect(opened).toEqual([]);
});
