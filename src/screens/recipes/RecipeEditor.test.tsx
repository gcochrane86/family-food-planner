import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import RecipeEditor from './RecipeEditor';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

beforeEach(() => { h.repo = fakeRepo(); });

function open() {
  return render(
    <MemoryRouter initialEntries={['/recipes/r-honey/edit']}>
      <Routes>
        <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="/recipes/:id" element={<h1>Recipe card</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
const step = (title: string) => screen.getByRole('group', { name: `Step: ${title}` });

test('changing a step to the Anova oven and renaming the recipe saves and goes back to the card', async () => {
  open();
  const title = await screen.findByRole('textbox', { name: 'Title' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Honey Chilli Chicken');
  const rice = step('Rice on');
  await userEvent.selectOptions(within(rice).getByRole('combobox', { name: 'Machine' }), 'apo');
  const settings = within(rice).getByRole('textbox', { name: 'Settings' });
  await userEvent.clear(settings);
  await userEvent.type(settings, '100°C · 100% steam · 20 min');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(h.repo.saveRecipe).toHaveBeenCalledTimes(1);
  const [id, fields, ingredients, steps] = h.repo.saveRecipe.mock.calls[0];
  expect(id).toBe('r-honey');
  expect(fields).toMatchObject({ title: 'Honey Chilli Chicken', subtitle: 'with peppers & basmati rice' });
  expect(ingredients.map((i: { name: string }) => i.name)).toEqual(['chicken breast or thigh', 'basmati rice']);
  expect(steps.find((s: { title: string }) => s.title === 'Rice on')).toMatchObject({ phase: 'finish', machine: 'apo', settings: '100°C · 100% steam · 20 min' });
  expect(await screen.findByRole('heading', { name: 'Recipe card' })).toBeInTheDocument();
});

test('ingredients and steps can be added, removed and reordered', async () => {
  open();
  await screen.findByRole('textbox', { name: 'Title' });
  await userEvent.click(screen.getByRole('button', { name: 'Remove basmati rice' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
  const rows = screen.getAllByRole('group', { name: /^Ingredient/ });
  await userEvent.type(within(rows.at(-1)!).getByRole('textbox', { name: 'Name' }), 'jasmine rice');
  await userEvent.type(within(rows.at(-1)!).getByRole('textbox', { name: 'Amount' }), '400');
  await userEvent.type(within(rows.at(-1)!).getByRole('textbox', { name: 'Unit' }), 'g');
  await userEvent.click(within(step('Final toss')).getByRole('button', { name: 'Move up' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add step' }));
  const added = screen.getAllByRole('group', { name: /^Step/ }).at(-1)!;
  await userEvent.type(within(added).getByRole('textbox', { name: 'Step title' }), 'Garnish');
  await userEvent.type(within(added).getByRole('textbox', { name: 'What to do' }), 'Scatter the **spring onions**.');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const [, , ingredients, steps] = h.repo.saveRecipe.mock.calls[0];
  expect(ingredients.map((i: { name: string; qty: number | null; unit: string }) => [i.name, i.qty, i.unit]))
    .toEqual([['chicken breast or thigh', 1200, 'g'], ['jasmine rice', 400, 'g']]);
  expect(steps.map((s: { title: string }) => s.title)).toEqual(['The bulk sauce', 'Final toss', 'Rice on', 'Garnish']);
  expect(steps.at(-1)).toMatchObject({ phase: 'finish', machine: null, body: 'Scatter the **spring onions**.' });
});

test('a step with no title or text is not saved', async () => {
  open();
  await screen.findByRole('textbox', { name: 'Title' });
  await userEvent.clear(within(step('Rice on')).getByRole('textbox', { name: 'What to do' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(h.repo.saveRecipe).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Every step needs a title and what to do');
});

test('a failed save says so and keeps your changes', async () => {
  h.repo.saveRecipe.mockRejectedValueOnce(new Error('Failed to fetch'));
  open();
  const title = await screen.findByRole('textbox', { name: 'Title' });
  await userEvent.type(title, '!');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save");
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Almond-Crusted Honey Chilli Chicken!');
});

test('Cancel goes back without saving', async () => {
  open();
  await screen.findByRole('textbox', { name: 'Title' });
  await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
  expect(h.repo.saveRecipe).not.toHaveBeenCalled();
  expect(await screen.findByRole('heading', { name: 'Recipe card' })).toBeInTheDocument();
});
