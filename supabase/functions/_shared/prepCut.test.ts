import { prepKey, prepPhotoPrompt } from './prepCut';

test('the same cut in different words is one photo; a different cut or colour is another', () => {
  const k = (name: string, note: string | null) => prepKey(name, note).key;
  expect(k('new potatoes', 'halved')).toBe(k('New potato', 'cut in half'));
  expect(k('potatoes', 'in pieces')).toBe(k('potato', 'roughly chopped'));
  expect(k('potatoes', 'in pieces')).toBe(k('Potatoes', 'cut into chunks'));
  expect(k('red pepper', 'sliced into strips')).not.toBe(k('red pepper', 'diced'));
  expect(k('red pepper', 'diced')).not.toBe(k('green pepper', 'diced'));
  expect(k('new potatoes', 'halved')).not.toBe(k('baking potatoes', 'halved'));
});

test('cuts read from the recipe note, with sizes kept', () => {
  const cut = (note: string | null, name = 'carrot') => prepKey(name, note).cut;
  expect(cut('10mm batons', 'chicken breast')).toBe('strips (10mm)');
  expect(cut('finely chopped')).toBe('finely diced');
  expect(cut('diced 1cm')).toBe('diced (1cm)');
  expect(cut('thinly sliced')).toBe('thinly sliced');
  expect(cut('sliced into rings', 'red onion')).toBe('rings');
  expect(cut('crushed', 'garlic')).toBe('crushed');
  expect(cut('grated')).toBe('grated');
  expect(cut('in florets', 'broccoli')).toBe('florets');
  expect(cut('quartered', 'onion')).toBe('quartered');
  expect(cut('peeled and cut into wedges', 'potato')).toBe('wedges');
  expect(cut('cut on the diagonal into 3cm lengths')).toBe('cut on the diagonal into 3cm lengths');
  expect(cut(null)).toBe('chopped');
});

test('the label reads naturally, and the prompt names the exact cut', () => {
  const p = prepKey('Red peppers', 'sliced into 1cm strips');
  expect(p.label).toBe('red pepper, strips (1cm)');
  const prompt = prepPhotoPrompt(p);
  expect(prompt).toContain('red pepper');
  expect(prompt).toContain('strips (1cm)');
  expect(prompt).toMatch(/chopping board/i);
  expect(prompt).toMatch(/no hands/i);
});

test('your words and your own board go into the chopping photo request', () => {
  const p = prepKey('potatoes', 'halved');
  expect(prepPhotoPrompt(p, 'bigger pieces, skins on')).toContain('Also: bigger pieces, skins on.');
  expect(prepPhotoPrompt(p, '  ')).not.toContain('Also:');
  const own = prepPhotoPrompt(p, null, true);
  expect(own).toMatch(/reference photo shows the household's own chopping board/i);
  expect(own).not.toContain('wooden chopping board');
  expect(own).toMatch(/any angle or rotation/i);
});

describe('ingredient icons', () => {
  test('one icon per ingredient, whatever the cut or plural', async () => {
    const { iconKey } = await import('./prepCut.ts');
    expect(iconKey('Red Peppers (about 2)')).toEqual({ key: 'icon:red pepper', ingredient: 'red pepper', label: 'red pepper' });
    expect(iconKey('red pepper').key).toBe(iconKey('Red peppers').key);
  });
  test('names that are the same thing share one picture, keeping their own name', async () => {
    const { iconKey } = await import('./prepCut.ts');
    expect(iconKey('New potatoes')).toEqual({ key: 'icon:potato', ingredient: 'new potato', label: 'new potato' });
    expect(iconKey('baby potatoes').key).toBe('icon:potato');
    expect(iconKey('Eating apples').key).toBe('icon:apple');
    expect(iconKey('low-sodium soy sauce').key).toBe('icon:soy sauce');
    // Different-looking things keep their own.
    expect(iconKey('red onion').key).toBe('icon:red onion');
    expect(iconKey('sweet potato').key).toBe('icon:sweet potato');
  });
  test('more names that look the same out of the cupboard share a picture', async () => {
    const { iconKey } = await import('./prepCut.ts');
    const same: [string, string][] = [
      ['Sea salt', 'salt'], ['fine sea salt', 'salt'], ['Flaky sea salt', 'salt'], ['black peppercorns', 'black pepper'],
      ['extra virgin olive oil', 'olive oil'], ['light olive oil', 'olive oil'],
      ['tinned chopped tomatoes', 'tinned tomato'], ['canned chopped tomatoes', 'tinned tomato'], ['canned tomatoes', 'tinned tomato'],
      ['canned black beans', 'black bean'], ['canned chickpeas', 'chickpea'], ['tinned tuna in water', 'tinned tuna'],
      ['tomato purée', 'tomato paste'], ['mature cheddar', 'cheddar'], ['parmesan-style hard cheese', 'parmesan'],
      ['flat leaf parsley', 'parsley'], ['chicken breast fillets', 'chicken breast'], ['chicken thighs', 'chicken thigh fillet'],
      ['diced chicken thigh', 'chicken thigh fillet'], ['bay leaves', 'bay leaf'], ['baby spinach', 'spinach'],
      ['baby plum tomatoes', 'cherry tomato'], ['rolled oats', 'oat'], ['porridge oats', 'oat'], ['cider vinegar', 'apple cider vinegar'],
      ['sourdough breadcrumbs', 'breadcrumb'], ['gluten-free breadcrumbs', 'breadcrumb'], ['rolled beef brisket', 'beef brisket'],
      ['roasting potatoes', 'potato'], ['peanut butter', 'nut butter'], ['lemon juice', 'lemon'], ['egg white', 'egg'],
      ['walnut halves', 'walnut'],
    ];
    for (const [name, picture] of same) expect([name, iconKey(name).key]).toEqual([name, `icon:${picture}`]);
    expect(iconKey('Sea salt').ingredient).toBe('sea salt'); // its own name stays
  });
  test('either-or names use the first one, and new names with a plain describing word match by themselves', async () => {
    const { iconKey } = await import('./prepCut.ts');
    expect(iconKey('chicken breast or thigh').key).toBe('icon:chicken breast');
    expect(iconKey('fish stock or chicken stock').key).toBe('icon:fish stock');
    expect(iconKey('onions or leeks').key).toBe('icon:onion');
    expect(iconKey('fresh ginger').key).toBe('icon:ginger');
    expect(iconKey('large free-range eggs').key).toBe('icon:egg');
    expect(iconKey('organic coarse sea salt').key).toBe('icon:salt');
    // Different-looking things keep their own.
    for (const n of ['sea bass', 'red pepper', 'green pepper', 'smoked paprika', 'cumin seed', 'ground cumin', 'light brown sugar', 'red wine vinegar', 'frozen sweetcorn', 'basmati rice', 'jasmine rice'])
      expect([n, iconKey(n).key]).toEqual([n, `icon:${n}`]);
  });
  test("accents and apostrophes don't break the name", async () => {
    const { iconKey } = await import('./prepCut.ts');
    expect(iconKey('crème fraîche').ingredient).toBe('creme fraiche');
    expect(iconKey("goat's cheese").ingredient).toBe('goats cheese');
  });
  test('the icon prompt asks for a cartoon on white, with no words', async () => {
    const { iconPrompt } = await import('./prepCut.ts');
    const p = iconPrompt('olive oil', 'in a green bottle');
    expect(p).toMatch(/cartoon/i);
    expect(p).toMatch(/olive oil/);
    expect(p).toMatch(/white background/i);
    expect(p).toMatch(/no text/i);
    expect(p).toMatch(/in a green bottle/);
  });
});

test('chopping photos are drawn in the same cartoon style as the get-out pictures, keeping board, knife and cut', async () => {
  const { isCartoonPrep } = await import('./prepCut.ts');
  const p = prepPhotoPrompt(prepKey('new potatoes', 'halved'));
  expect(p).toMatch(/cartoon/i);
  expect(p).toMatch(/chopping board/i);
  expect(p).toMatch(/knife/i);
  expect(p).toContain('halved');
  expect(p).not.toMatch(/realistic photo/i);
  expect(prepPhotoPrompt(prepKey('potatoes', 'halved'), null, true)).toMatch(/cartoon of that same board/i);
  expect(isCartoonPrep('h1/prep/cartoon-new-potato-halved-1.jpg')).toBe(true);
  expect(isCartoonPrep('h1/prep/new-potato-halved-1.jpg')).toBe(false);
  expect(isCartoonPrep('h1/prep/own-new-potato-1.jpg')).toBe(true);
});

test('each thing to chop gets a plain instruction from its cut', async () => {
  const { chopInstruction } = await import('./prepCut.ts');
  expect(chopInstruction('new potatoes', 'halved')).toBe('Cut the new potatoes in half');
  expect(chopInstruction('potatoes', '2cm dice')).toBe('Dice the potatoes into 2cm cubes');
  expect(chopInstruction('onion', 'finely chopped')).toBe('Finely dice the onion');
  expect(chopInstruction('chicken breast or thigh', '10mm batons')).toBe('Cut the chicken breast or thigh into 10mm strips');
  expect(chopInstruction('red pepper', 'sliced')).toBe('Slice the red pepper');
  expect(chopInstruction('garlic', 'crushed')).toBe('Crush the garlic');
  expect(chopInstruction('broccoli', 'florets')).toBe('Cut the broccoli into florets');
  expect(chopInstruction('carrot', 'roughly chopped')).toBe('Cut the carrot into chunks');
  expect(chopInstruction('beef', 'cubed (3cm)')).toBe('Dice the beef into 3cm cubes');
  expect(chopInstruction('coriander', null)).toBe('Chop the coriander');
  expect(chopInstruction('ginger', 'peeled and sliced')).toBe('Peel and slice the ginger');
  expect(chopInstruction('green beans', 'trimmed')).toBe('Trim the green beans');
  expect(chopInstruction('red cabbage', 'shredded')).toBe('Shred the red cabbage');
  expect(chopInstruction('snap peas', 'or mangetout; trimmed')).toBe('Trim the snap peas');
});
