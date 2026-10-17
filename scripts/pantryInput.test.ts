// @vitest-environment node
import { parseOrder } from './pantryInput';

const item = { name: 'FAGE Total Greek Yoghurt 500g', qty: 2, url: 'https://www.sainsburys.co.uk/gol-ui/product/fage-total-500g', location: 'fridge' };

describe('parseOrder', () => {
  it('reads an order number and its items', () => {
    expect(parseOrder(JSON.stringify({ order: '1234567890', items: [item, { name: 'Cumin seeds', location: 'cupboard' }] }))).toEqual({
      order: '1234567890',
      items: [
        { name: 'FAGE Total Greek Yoghurt 500g', qty: 2, url: item.url, location: 'fridge' },
        { name: 'Cumin seeds', qty: 1, url: null, location: 'cupboard' },
      ],
    });
  });
  it('only takes sainsburys.co.uk links', () => {
    expect(() => parseOrder(JSON.stringify({ order: '1', items: [{ ...item, url: 'https://evil.example/x' }] }))).toThrow('url');
  });
  it('needs an order number of up to 40 characters and 1–200 items', () => {
    expect(() => parseOrder(JSON.stringify({ items: [item] }))).toThrow('"order"');
    expect(() => parseOrder(JSON.stringify({ order: 'x'.repeat(41), items: [item] }))).toThrow('"order"');
    expect(() => parseOrder(JSON.stringify({ order: '1', items: [] }))).toThrow('"items"');
  });
  it('needs each item to say where it goes', () => {
    expect(() => parseOrder(JSON.stringify({ order: '1', items: [{ ...item, location: 'garage' }] }))).toThrow('location');
  });
});
