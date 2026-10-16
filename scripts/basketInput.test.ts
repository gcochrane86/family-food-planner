// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseFinish, parseProduct, parseSpar } from './basketInput';

describe('parseProduct', () => {
  it('reads a product with odd characters in its name untouched', () => {
    const p = parseProduct('{"key":"spinach","name":"Sainsbury\'s Spinach $(rm -rf ~) 500g","url":"https://www.sainsburys.co.uk/gol-ui/product/x","size":500,"unit":"g","price":1.75}');
    expect(p).toEqual({ key: 'spinach', name: "Sainsbury's Spinach $(rm -rf ~) 500g", url: 'https://www.sainsburys.co.uk/gol-ui/product/x', size: 500, unit: 'g', price: 1.75, pin: false });
  });
  it('needs a key and a name', () => {
    expect(() => parseProduct('{"name":"x"}')).toThrow('key');
    expect(() => parseProduct('{"key":"x"}')).toThrow('name');
  });
  it('only takes Sainsbury\'s product links', () => {
    expect(() => parseProduct('{"key":"a","name":"b","url":"https://evil.example/x"}')).toThrow('url');
  });
  it('rejects text that is not JSON', () => {
    expect(() => parseProduct('key=spinach')).toThrow('JSON');
  });
  it('pins only when pin is true', () => {
    expect(parseProduct('{"key":"a","name":"b","pin":"yes"}').pin).toBe(false);
    expect(parseProduct('{"key":"a","name":"b","pin":true}').pin).toBe(true);
  });
});

describe('parseFinish', () => {
  it('reads a run id, status and summary', () => {
    expect(parseFinish('{"run":"r1","status":"done","summary":"12 added; swaps: none"}')).toEqual({ run: 'r1', status: 'done', summary: '12 added; swaps: none' });
  });
  it('only accepts done or failed', () => {
    expect(() => parseFinish('{"run":"r1","status":"requested"}')).toThrow('status');
  });
  it('caps a long summary', () => {
    expect(parseFinish(`{"run":"r1","status":"failed","summary":"${'x'.repeat(3000)}"}`).summary).toHaveLength(2000);
  });
});

describe('parseSpar', () => {
  it('reads a name and note', () => {
    expect(parseSpar('{"name":"Spring onions","note":"Sainsbury\'s had none"}')).toEqual({ name: 'Spring onions', note: "Sainsbury's had none" });
  });
  it('needs a name and caps it at 80 characters', () => {
    expect(() => parseSpar('{"note":"x"}')).toThrow('name');
    expect(parseSpar(`{"name":"${'x'.repeat(200)}"}`).name).toHaveLength(80);
  });
});
