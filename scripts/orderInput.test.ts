import { describe, expect, it } from 'vitest';
import { mergeOrder, parseOrder, weekStartFor } from './orderInput';

const confirmed = JSON.stringify({
  orderNumber: '1358318680', status: 'confirmed', slot: 'Monday 23 November, 10am to 11am', deliveryDate: '2026-11-23',
  total: 99.26, itemCount: 32, amendUntil: '11pm Sunday, 22 November',
  items: [{ name: "Sainsbury's Basmati Rice 500g", qty: 1, price: 0.89 }],
});

describe('parseOrder', () => {
  it('reads an order confirmation', () => {
    expect(parseOrder(confirmed)).toEqual({
      orderNumber: '1358318680', status: 'confirmed', slot: 'Monday 23 November, 10am to 11am', deliveryDate: '2026-11-23',
      total: 99.26, itemCount: 32, amendUntil: '11pm Sunday, 22 November',
      items: [{ name: "Sainsbury's Basmati Rice 500g", qty: 1, price: 0.89 }],
    });
  });

  it('reads a picked order with its substitutions and missing items, leaving out what the email did not say', () => {
    const o = parseOrder(JSON.stringify({ orderNumber: '1357811798', status: 'picked', total: 95.56,
      substitutions: [{ ordered: 'Bananas, SO Organic x6', substitute: 'Bananas Loose', qty: '0.89kg', price: 0.8 }],
      missing: [{ name: 'Spring onions' }] }));
    expect(o).toEqual({ orderNumber: '1357811798', status: 'picked', total: 95.56,
      substitutions: [{ ordered: 'Bananas, SO Organic x6', substitute: 'Bananas Loose', qty: '0.89kg', price: 0.8 }],
      missing: [{ name: 'Spring onions' }] });
  });

  it('needs an order number and a known status', () => {
    expect(() => parseOrder('{"status":"confirmed"}')).toThrow('"orderNumber" must be the order number');
    expect(() => parseOrder('{"orderNumber":"12ab","status":"confirmed"}')).toThrow('"orderNumber" must be the order number');
    expect(() => parseOrder('{"orderNumber":"1358318680","status":"lost"}')).toThrow('"status" must be confirmed, picked or cancelled');
  });

  it('drops a bad date and keeps names short', () => {
    const o = parseOrder(JSON.stringify({ orderNumber: '1358318680', status: 'confirmed', deliveryDate: 'Monday', items: [{ name: 'x'.repeat(300), qty: 1 }] }));
    expect(o.deliveryDate).toBeUndefined();
    expect(o.items![0].name).toHaveLength(150);
  });
});

describe('mergeOrder', () => {
  const was = { status: 'confirmed' as const, items: [{ name: 'Rice', qty: 1, price: 0.89 }], total: 99.26 };

  it('a picked email adds the swaps and the paid total, and keeps the items from checkout', () => {
    expect(mergeOrder(was, { orderNumber: '1', status: 'picked', total: 101.02, substitutions: [{ ordered: 'A', substitute: 'B', qty: null, price: null }] }))
      .toMatchObject({ status: 'picked', total: 101.02, items: [{ name: 'Rice' }], substitutions: [{ ordered: 'A' }] });
  });

  it('an older confirmation read after the picked email never takes the status back', () => {
    expect(mergeOrder({ ...was, status: 'picked' }, { orderNumber: '1', status: 'confirmed' }).status).toBe('picked');
  });

  it('a cancellation always wins', () => {
    expect(mergeOrder({ ...was, status: 'picked' }, { orderNumber: '1', status: 'cancelled' }).status).toBe('cancelled');
  });
});

describe('weekStartFor', () => {
  it('a Sunday delivery is for the week that starts the next day; Monday and Tuesday ones for their own week', () => {
    expect(weekStartFor('2026-11-22')).toBe('2026-11-23');
    expect(weekStartFor('2026-11-23')).toBe('2026-11-23');
    expect(weekStartFor('2026-11-24')).toBe('2026-11-23');
  });
});
