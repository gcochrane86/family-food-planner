import { useState } from 'react';
import { PHOTO_SMALL } from '../../lib/photoSizes';
import StoredPhoto from '../../components/StoredPhoto';
import type { Recipe } from '../../lib/types';

/** A meal's photo, or a soft shaded box with its name while there isn't one yet. */
export default function MealPhoto({ recipe, alt, className, width = PHOTO_SMALL }: { recipe?: Recipe; alt: string; className: string; width?: number }) {
  const [failed, setFailed] = useState(false);
  if (recipe?.hero_image_path && !failed) {
    return <StoredPhoto path={recipe.hero_image_path} width={width} alt={alt} loading="lazy" draggable={false} onFail={() => setFailed(true)} className={`w-full object-cover ${className}`} />;
  }
  return <div className={`grid w-full place-items-center bg-gradient-to-br from-yolk-soft to-surface-2 p-3 text-center text-[13px] font-semibold text-muted ${className}`}>Photo of {alt}</div>;
}
