import { useEffect, useState } from 'react';
import { repo } from '../../lib/repo';
import type { SainsburyOrder } from '../../lib/types';

const pounds = (n: number) => `£${n.toFixed(2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const STATUS: Record<SainsburyOrder['status'], string> = {
  confirmed: '✓ Order confirmed', picked: '✓ Picked: on its way', cancelled: 'Order cancelled',
};

/** The week's Sainsbury's orders, as Claude read them from the emails: status, slot and total, swaps up front, and
 *  what was ordered on a tap. Shows nothing until an order is recorded (or if orders can't be read). */
export default function Orders({ weekId }: { weekId: string }) {
  const [orders, setOrders] = useState<SainsburyOrder[]>([]);
  useEffect(() => { repo.listOrders(weekId).then(setOrders).catch(() => setOrders([])); }, [weekId]);
  return <>{orders.map((o) => <OrderCard key={o.id} order={o} />)}</>;
}

function OrderCard({ order: o }: { order: SainsburyOrder }) {
  const [open, setOpen] = useState(false);
  const total = o.total === null ? null : o.status === 'picked' ? `${pounds(o.total)} paid` : `${pounds(o.total)} (estimate)`;
  const counts = [o.substitutions.length ? plural(o.substitutions.length, 'swap') : '', o.missing.length ? `${o.missing.length} missing` : ''].filter(Boolean).join(', ');
  return (
    <section aria-label={`Sainsbury's order ${o.order_number}`} className="grid gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <p className={`m-0 font-bold ${o.status === 'cancelled' ? 'text-warn' : 'text-accent'}`}>{STATUS[o.status]}</p>
      {o.slot && <p className="m-0">{o.slot}</p>}
      <p className="m-0 text-muted">{[o.item_count !== null ? plural(o.item_count, 'item') : '', total ?? '', counts].filter(Boolean).join(' · ')}</p>
      {o.status === 'confirmed' && o.amend_until && <p className="m-0 text-muted">You can change it until {o.amend_until}.</p>}
      {(o.substitutions.length > 0 || o.missing.length > 0) && (
        <ul className="m-0 grid list-none gap-1 rounded-xl bg-evening-soft p-2">
          {o.substitutions.map((s) => (
            <li key={`${s.ordered}→${s.substitute}`}>{s.ordered} → <b>{s.substitute}</b>{s.price !== null ? ` (${pounds(s.price)})` : ''}</li>
          ))}
          {o.missing.map((m) => <li key={m.name} className="text-warn">Missing: {m.name}</li>)}
        </ul>
      )}
      {o.items.length > 0 && (
        <>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="justify-self-start font-semibold text-accent">
            {open ? 'Hide what was ordered' : 'See what was ordered'}
          </button>
          {open && (
            <ul className="m-0 list-none divide-y divide-line p-0">
              {o.items.map((i, n) => (
                <li key={`${i.name}-${n}`} className="flex justify-between gap-3 py-1.5">
                  <span>{i.name}{i.qty !== null && i.qty !== 1 ? ` × ${i.qty}` : ''}</span>
                  {i.price !== null && <span className="text-muted">{pounds(i.price)}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
