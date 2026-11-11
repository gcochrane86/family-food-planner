// Small copies of recipe and step photos (11 Nov 2026). Supabase's own resizing is a paid feature that isn't on for
// this project, so each photo gets a copy 1000px on its long edge stored beside it ("…-sm.jpg"): made by `npm run photos -- small-copies`
// on the Mac for existing photos, and by the device the first time it shows a photo that has none.

/** A small copy's long edge. Everywhere the app gives a size (cards at 600, full-width at 1200 on a phone's
 *  3× screen) loads the copy; it's sharp enough there at about a sixth of the original's size. */
export const SMALL_EDGE = 1000;
/** Widths up to this load the small copy. */
export const COPY_UP_TO = 1200;

/** Where a photo's small copy is stored. */
export function smallPath(path: string): string {
  const base = path.replace(/\.(jpe?g|png|webp)$/i, '');
  return base.endsWith('-sm') ? `${base}.jpg` : `${base}-sm.jpg`;
}
