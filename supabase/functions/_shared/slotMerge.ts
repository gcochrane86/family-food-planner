// Applying the planner's version of each slot onto saved slots: shared by the Week screen and the Ask Claude
// connector, so a dinner changed in either place drops the same day-only plans (batch, roast, tonight's version).
import type { ProposedSlot, SlotKind, SlotMode } from './planner.ts';

export interface SlotLike {
  date: string; slot: SlotKind; recipe_id: string | null; mode: SlotMode; portions: number | null; guests: number;
  locked: boolean; reason: string | null; source_date: string | null; batch?: unknown; roast?: unknown; version?: unknown; prep_ahead?: unknown;
}

export const toProposed = (s: SlotLike): ProposedSlot => ({
  date: s.date, slot: s.slot, recipeId: s.recipe_id, mode: s.mode, portions: s.portions, guests: s.guests,
  locked: s.locked, reason: s.reason, sourceDate: s.source_date,
});

/** Applies the planner's version of each slot onto the saved slots and returns only those that changed. */
export function mergePlan<S extends SlotLike>(slots: S[], plan: ProposedSlot[]): { next: S[]; changed: S[] } {
  const changed: S[] = [];
  const next = slots.map((s) => {
    const p = plan.find((x) => x.date === s.date && x.slot === s.slot);
    if (!p) return s;
    const updated: S = {
      ...s, recipe_id: p.recipeId, mode: p.mode, portions: p.portions, guests: p.guests, locked: p.locked, reason: p.reason, source_date: p.sourceDate,
    };
    const otherDinner = updated.recipe_id !== s.recipe_id || updated.mode !== 'cook';
    // A batch plan belongs to that dinner: a different recipe, or no cooking, drops it.
    if (s.batch && otherDinner) updated.batch = null;
    // So does a roast: a different dinner, or none, isn't the roast any more.
    if (s.roast && otherDinner) updated.roast = null;
    // And tonight's version, which was made from that recipe.
    if (s.version && otherDinner) updated.version = null;
    // Its prep-ahead choice goes back to recommended, as the database does (migration 0018); it's never saved from here.
    if (s.prep_ahead !== undefined && otherDinner) updated.prep_ahead = 'ahead';
    const differs = (['recipe_id', 'mode', 'portions', 'guests', 'locked', 'reason', 'source_date', 'batch', 'roast', 'version'] as const).some((k) => updated[k] !== s[k]);
    if (differs) changed.push(updated);
    return updated;
  });
  return { next, changed };
}
