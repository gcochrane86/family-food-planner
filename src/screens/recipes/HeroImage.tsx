import { useState } from 'react';
import { PHOTO_SMALL } from '../../lib/photoSizes';
import { repo } from '../../lib/repo';
import type { Recipe } from '../../lib/types';

const TONES = ['bg-yolk-soft', 'bg-teal-soft', 'bg-accent-soft', 'bg-evening-soft', 'bg-warn-soft'];
const toneFor = (s: string) => TONES[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];
const initials = (title: string) => title.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** The recipe photo, or a tinted placeholder with the initials while there isn't one (or it failed to load). */
export default function HeroImage({ recipe, className = '', width = PHOTO_SMALL }: { recipe: Pick<Recipe, 'title' | 'slug' | 'hero_image_path' | 'hero_image_source'>; className?: string; width?: number }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = recipe.hero_image_path && !failed;
  return (
    <div className={`relative grid place-items-center overflow-hidden ${toneFor(recipe.slug)} ${className}`}>
      {showPhoto ? (
        <img src={repo.heroUrl(recipe.hero_image_path!, width)} alt={recipe.title} loading="lazy"
          className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true" className="font-display text-4xl font-bold text-ink/40">{initials(recipe.title)}</span>
      )}
    </div>
  );
}
