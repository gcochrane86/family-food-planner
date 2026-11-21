// Input for `basket order`: a Sainsbury's order as its email describes it, written by Claude as JSON. Fields the email
// didn't mention are left out, so a later email only adds to what an earlier one said.
import { parse, text } from './basketInput';

export type OrderStatus = 'confirmed' | 'picked' | 'cancelled';
export interface OrderItem { name: string; qty: number | string | null; price: number | null }
export interface OrderSub { ordered: string; substitute: string; qty: number | string | null; price: number | null }
export interface OrderInput {
  orderNumber: string; status: OrderStatus; slot?: string; deliveryDate?: string; total?: number; itemCount?: number;
  amendUntil?: string; items?: OrderItem[]; substitutions?: OrderSub[]; missing?: { name: string }[];
}

const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
const qty = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : text(v, 20));
const list = <T>(v: unknown, one: (x: Record<string, unknown>) => T | null): T[] | undefined =>
  Array.isArray(v) ? v.slice(0, 200).flatMap((x) => (x && typeof x === 'object' ? [one(x as Record<string, unknown>)].filter((y): y is T => y !== null) : [])) : undefined;

export function parseOrder(input: string): OrderInput {
  const o = parse(input);
  const orderNumber = typeof o.orderNumber === 'string' && /^\d{6,15}$/.test(o.orderNumber.trim()) ? o.orderNumber.trim() : null;
  if (!orderNumber) throw new Error('"orderNumber" must be the order number (digits)');
  if (o.status !== 'confirmed' && o.status !== 'picked' && o.status !== 'cancelled') throw new Error('"status" must be confirmed, picked or cancelled');
  const out: OrderInput = { orderNumber, status: o.status };
  const slot = text(o.slot, 100); if (slot) out.slot = slot;
  if (typeof o.deliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.deliveryDate)) out.deliveryDate = o.deliveryDate;
  const total = money(o.total); if (total !== null) out.total = total;
  if (typeof o.itemCount === 'number' && Number.isInteger(o.itemCount) && o.itemCount >= 0) out.itemCount = o.itemCount;
  const amend = text(o.amendUntil, 100); if (amend) out.amendUntil = amend;
  const items = list(o.items, (x) => { const name = text(x.name, 150); return name ? { name, qty: qty(x.qty), price: money(x.price) } : null; });
  if (items) out.items = items;
  const subs = list(o.substitutions, (x) => {
    const ordered = text(x.ordered, 150); const substitute = text(x.substitute, 150);
    return ordered && substitute ? { ordered, substitute, qty: qty(x.qty), price: money(x.price) } : null;
  });
  if (subs) out.substitutions = subs;
  const missing = list(o.missing, (x) => { const name = text(x.name, 150); return name ? { name } : null; });
  if (missing) out.missing = missing;
  return out;
}

const RANK: Record<OrderStatus, number> = { confirmed: 0, picked: 1, cancelled: 2 };

/** A new email's view of an order on top of what earlier emails said: the status only moves forward (emails can be
 *  read out of order), and fields this email didn't mention are kept. */
export function mergeOrder<T extends { status: OrderStatus }>(was: T | null, now: OrderInput): Omit<T, 'status'> & Omit<OrderInput, 'orderNumber'> {
  const status = was && RANK[was.status] > RANK[now.status] ? was.status : now.status;
  const { orderNumber: _n, ...fields } = now;
  return { ...(was ?? {}), ...fields, status } as Omit<T, 'status'> & Omit<OrderInput, 'orderNumber'>;
}

/** The plan week a delivery is for: a Sunday delivery is for the week starting the next day, a weekday one its own. */
export function weekStartFor(deliveryDate: string): string {
  const d = new Date(`${deliveryDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
