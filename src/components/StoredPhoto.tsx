import { useEffect, useState } from 'react';
import { repo } from '../lib/repo';

/** A stored recipe or step photo. It loads the small copy when shown small; if that isn't there yet it shows the
 *  original (and makes the copy for next time); if the original won't load either, `onFail` (the placeholder). */
export default function StoredPhoto({ path, width, onFail, ...img }: {
  path: string; width?: number; onFail?: () => void;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'crossOrigin' | 'width'>) {
  const small = repo.heroUrl(path, width);
  const original = repo.heroUrl(path);
  const [src, setSrc] = useState(small);
  useEffect(() => { setSrc(small); }, [small]);
  return (
    // crossOrigin, so the service worker can tell a missing copy from a photo and only keeps photos.
    <img {...img} src={src} crossOrigin="anonymous"
      onError={() => {
        if (src !== original) { setSrc(original); void repo.makeSmallCopy(path); return; }
        onFail?.();
      }} />
  );
}
