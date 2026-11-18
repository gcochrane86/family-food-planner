import { easyTonight, isKeepOneIn, usedUp } from './easyTonight';
import type { Staple } from './types';

const staple = (name: string, status: Staple['status'] = 'have'): Staple => ({ id: `p-${name}`, ingredient_id: `i-${name}`, name, status });
const pantry = [staple('Olive oil'), staple('Canned chickpeas'), staple('Smoked paprika'), staple('Tomato purée', 'out'), staple('Coconut milk')];
const ing = (...names: string[]) => names.map((name) => ({ name }));

test('what the pantry has is in the cupboard; everyday things are from the Spar', () => {
  expect(easyTonight(ing('olive oil', 'chickpeas', 'smoked paprika', 'chicken thigh fillets', 'red onion', 'Greek yoghurt'), pantry))
    .toEqual({ spar: ['chicken thigh fillets', 'red onion', 'Greek yoghurt'], skip: [], bigShop: [] });
});

test('fresh herbs and chilli can be skipped rather than stopping the dinner', () => {
  expect(easyTonight(ing('flat leaf parsley', 'coriander', 'fresh mint', 'red chilli', 'thyme'), pantry))
    .toEqual({ spar: [], skip: ['flat leaf parsley', 'coriander', 'fresh mint', 'red chilli', 'thyme'], bigShop: [] });
});

test('specialist things need the big shop', () => {
  expect(easyTonight(ing('halloumi', 'pak choi', 'fish pie mix', 'white miso paste'), pantry).bigShop)
    .toEqual(['halloumi', 'pak choi', 'fish pie mix', 'white miso paste']);
});

test('either of two choices will do, and a run-out staple is a Spar basic if the Spar has it', () => {
  expect(easyTonight(ing('chicken breast or thigh', 'tomato purée'), pantry).spar).toEqual(['chicken breast or thigh', 'tomato purée']);
});

test('dried things are not fresh herbs, and noodles are not eggs', () => {
  const r = easyTonight(ing('dried mint', 'dried egg noodles', 'ground coriander'), pantry);
  expect(r.skip).toEqual([]);
  expect(r.bigShop).toEqual(['dried mint', 'dried egg noodles', 'ground coriander']);
});

test('lemon juice is lemons, and hard cheese is any Spar\'s', () => {
  expect(easyTonight(ing('lemon juice', 'lime zest', 'Parmesan-style hard cheese'), pantry).spar).toEqual(['lemon juice', 'lime zest', 'Parmesan-style hard cheese']);
});

test('the same thing named twice is listed once', () => {
  expect(easyTonight(ing('Greek yoghurt', 'Greek yoghurt', 'water'), pantry).spar).toEqual(['Greek yoghurt']);
});

test('tins and cartons used whole are kept one in; spices and oils are not', () => {
  for (const n of ['Canned chickpeas', 'Butter beans', 'Coconut milk', 'Passata', 'Tinned tomatoes', 'Red lentils']) expect(isKeepOneIn(n)).toBe(true);
  for (const n of ['Smoked paprika', 'Olive oil', 'Basmati rice', 'Tomato purée']) expect(isKeepOneIn(n)).toBe(false);
});

test('a dinner uses up the kept-one-in tins it calls for, once each', () => {
  expect(usedUp(ing('chickpeas', 'canned chickpeas', 'coconut milk', 'smoked paprika', 'olive oil'), pantry).map((s) => s.name))
    .toEqual(['Canned chickpeas', 'Coconut milk']);
});
