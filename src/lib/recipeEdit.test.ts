import { HONEY } from '../test/fixtures';
import { recipeSavePayload } from './recipeEdit';

const fields = { title: 'T', subtitle: null, prep_minutes: 10, finish_minutes: 20 };

test('equipment keeps what the recipe had (like the MEATER) and adds machines the steps now use', () => {
  const steps = HONEY.steps.map((s) => (s.id === 's-rice' ? { ...s, machine: 'apo' as const } : s));
  const p = recipeSavePayload({ ...HONEY, equipment: ['tm7', 'meater'] }, fields, HONEY.ingredients, steps);
  expect(p.fields.equipment).toEqual(['tm7', 'meater', 'apo']);
});

test('steps are numbered per phase in the order given, keep their photos, and a moved step loses its old timing', () => {
  const photo = { ...HONEY.steps[2], image_path: 'h1/steps/x.jpg', image_source: 'own' as const, photo_hint: 'pan' };
  const moved = { ...HONEY.steps[1], phase: 'prep_8pm' as const };
  const p = recipeSavePayload(HONEY, fields, HONEY.ingredients, [HONEY.steps[0], moved, photo]);
  expect(p.steps.map((s) => [s.phase, s.position, s.title, s.at_minute])).toEqual([
    ['prep_8pm', 1, 'The bulk sauce', null], ['prep_8pm', 2, 'Rice on', null], ['finish', 1, 'Final toss', 20]]);
  expect(p.steps[2]).toMatchObject({ image_path: 'h1/steps/x.jpg', image_source: 'own', photo_hint: 'pan' });
  expect(p.ingredients.map((i) => [i.position, i.name, i.qty_approx])).toEqual([[1, 'chicken breast or thigh', false], [2, 'basmati rice', false]]);
});
