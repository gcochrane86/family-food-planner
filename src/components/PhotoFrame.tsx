import { useEffect, useRef, type ReactNode } from 'react';
import { PHOTO_LARGE } from '../lib/photoSizes';
import StoredPhoto from './StoredPhoto';

export interface FramePhoto { path: string; alt: string; caption?: ReactNode; /** Holding the photo (or right-clicking) opens its options. */ onHold?: () => void }

/** The app's standard photo: always 4:3, full width, rounded. Several photos sit in a grid of equal tiles, two to a
 *  row, each with an optional caption underneath. Used by cook mode and Today's hour. */
export default function PhotoFrame({ photos }: { photos: FramePhoto[] }) {
  if (!photos.length) return null;
  return (
    <ul aria-label="Photos" className={`m-0 grid list-none gap-3 p-0 ${photos.length > 1 ? 'grid-cols-2' : ''}`}>
      {photos.map((p) => (
        <li key={p.path}>
          <figure className="m-0 grid gap-1.5">
            <Hold onHold={p.onHold}>
              <StoredPhoto path={p.path} width={PHOTO_LARGE} alt={p.alt} draggable={false} className="aspect-[4/3] w-full rounded-2xl object-cover" />
            </Hold>
            {p.caption && <figcaption className="text-sm text-[#9AA89F]">{p.caption}</figcaption>}
          </figure>
        </li>
      ))}
    </ul>
  );
}

const HOLD_MS = 550;
const MOVE_PX = 8; // further than this is a scroll, not a hold

/** Press and hold (or right-click) to call `onHold`; without it, just the photo. */
export function Hold({ onHold, children }: { onHold?: () => void; children: ReactNode }) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  // A hold that opened the options isn't also a tap (on a tile you can tick off, say).
  const held = useRef(false);
  const cancel = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; };
  useEffect(() => cancel, []);
  if (!onHold) return <>{children}</>;
  return (
    <div className="select-none [-webkit-touch-callout:none]"
      onPointerDown={(e) => { cancel(); held.current = false; hold.current = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { hold.current = null; held.current = true; onHold(); }, HOLD_MS) }; }}
      onClickCapture={(e) => { if (held.current) { held.current = false; e.preventDefault(); e.stopPropagation(); } }}
      onPointerMove={(e) => { if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > MOVE_PX) cancel(); }}
      onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={(e) => { e.preventDefault(); cancel(); onHold(); }}>
      {children}
    </div>
  );
}
