// Input for the pantry CLI's record-order command: JSON on stdin, so text from Sainsbury's pages never goes through a
// shell command line.
import { parse, text } from './basketInput';

export interface OrderItem { name: string; ingredient?: string; qty: number; url: string | null; location: 'fridge' | 'cupboard' | 'freezer' }

const LOCATIONS = ['fridge', 'cupboard', 'freezer'];

function sainsburysUrl(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const url = text(v, 1000) ?? '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* checked below */ }
  if (!url.startsWith('https://') || !(host === 'sainsburys.co.uk' || host.endsWith('.sainsburys.co.uk'))) throw new Error('"url" must be a sainsburys.co.uk link');
  return url;
}

/** A delivered order: its number and what came, each with where it's kept. `ingredient` is the plain name (e.g.
 *  "Greek yoghurt" for "FAGE Total Greek Yoghurt 500g") when the product name isn't one. */
export function parseOrder(input: string): { order: string; items: OrderItem[] } {
  const o = parse(input);
  const order = typeof o.order === 'string' && o.order.trim() && o.order.trim().length <= 40 ? o.order.trim()
    : (() => { throw new Error('"order" is required (the Sainsbury\'s order number, up to 40 characters)'); })();
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 200) throw new Error('"items" must list 1 to 200 items');
  const items = o.items.map((raw: unknown, i: number) => {
    const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const name = text(it.name, 120) ?? (() => { throw new Error(`items[${i}].name is required`); })();
    if (!LOCATIONS.includes(it.location as string)) throw new Error(`items[${i}].location must be fridge, cupboard or freezer`);
    const qty = typeof it.qty === 'number' && Number.isFinite(it.qty) && it.qty > 0 ? it.qty : 1;
    const ingredient = text(it.ingredient, 80) ?? undefined;
    return { name, ...(ingredient ? { ingredient } : {}), qty, url: sainsburysUrl(it.url), location: it.location as OrderItem['location'] };
  });
  return { order, items };
}
