import type { ReactNode } from 'react';
import { PHOTO_LARGE } from '../lib/photoSizes';
import StoredPhoto from './StoredPhoto';

export interface FramePhoto { path: string; alt: string; caption?: ReactNode }

/** The app's standard photo: always 4:3, full width, rounded. Several photos sit in a grid of equal tiles, two to a
 *  row, each with an optional caption underneath. Used by cook mode and Today's hour. */
export default function PhotoFrame({ photos }: { photos: FramePhoto[] }) {
  if (!photos.length) return null;
  return (
    <ul aria-label="Photos" className={`m-0 grid list-none gap-3 p-0 ${photos.length > 1 ? 'grid-cols-2' : ''}`}>
      {photos.map((p) => (
        <li key={p.path}>
          <figure className="m-0 grid gap-1.5">
            <StoredPhoto path={p.path} width={PHOTO_LARGE} alt={p.alt} className="aspect-[4/3] w-full rounded-2xl object-cover" />
            {p.caption && <figcaption className="text-sm text-[#9AA89F]">{p.caption}</figcaption>}
          </figure>
        </li>
      ))}
    </ul>
  );
}
