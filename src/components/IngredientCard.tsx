import { Hold } from './PhotoFrame';
import StoredPhoto from './StoredPhoto';
import { PHOTO_SMALL } from '../lib/photoSizes';
import type { GetOutItem } from '../lib/getOut';

// The ingredient cards of Today's hour and cook mode: a cartoon of the ingredient (made once per ingredient and
// reused), its name, and the amount (and how it's prepared) underneath. Holding the picture opens its options.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A cartoon of an ingredient, or its first letter until one is made. */
export function Icon({ path, name, className }: { path: string | null; name: string; className: string }) {
  return path
    ? <StoredPhoto path={path} width={PHOTO_SMALL} alt={name} draggable={false} className={`object-contain ${className}`} />
    : <span aria-hidden="true" className={`grid place-items-center font-bold text-[#9AA89F] ${className} bg-[#EEF3EF]`}>{name.charAt(0).toUpperCase()}</span>;
}

/** One ingredient as a card: its cartoon, its name in a label, the amount (and how it's prepared) underneath. */
export function Tile({ onTap, ...props }: { item: GetOutItem; note?: string | null; onHold?: () => void; /** Tapping opens how to cut it. */ onTap?: () => void }) {
  return (
    <li className="grid">
      {onTap
        ? <button type="button" aria-label={`How to cut ${props.item.name}`} onClick={onTap} className="grid text-left"><Card {...props} /></button>
        : <Card {...props} />}
    </li>
  );
}
export function Card({ item, note, onHold }: { item: GetOutItem; note?: string | null; onHold?: () => void }) {
  return (
    <div className="grid content-start justify-items-center gap-1.5 rounded-2xl border border-[#D9DDD3] bg-white p-2 pb-2.5 text-center shadow-sm">
      <Hold onHold={onHold}><Icon path={item.icon} name={item.name} className="aspect-square w-full rounded-xl text-4xl" /></Hold>
      <span className="text-sm font-bold leading-tight text-[#1B211D]">{cap(item.name)}</span>
      {(item.qty || note) && <span className="text-xs font-semibold leading-snug text-[#3F4A43]">{[item.qty, note].filter(Boolean).join(' · ')}</span>}
    </div>
  );
}
