import { useState } from 'react';
import { repo } from '../../lib/repo';
import type { Recipe } from '../../lib/types';

/** A meal's photo, or a soft shaded box with its name while there isn't one yet. */
export default function MealPhoto({ recipe, alt, className }: { recipe?: Recipe; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (recipe?.hero_image_path && !failed) {
    return <img src={repo.heroUrl(recipe.hero_image_path)} alt={alt} loading="lazy" draggable={false} onError={() => setFailed(true)} className={`w-full object-cover ${className}`} />;
  }
  return <div className={`grid w-full place-items-center bg-gradient-to-br from-yolk-soft to-surface-2 p-3 text-center text-[13px] font-semibold text-muted ${className}`}>Photo of {alt}</div>;
}
