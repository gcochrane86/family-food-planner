// What counts as a snack, and how much of a recipe one snack is (docs/superpowers/specs/2026-11-15-snacks-in-recipes-design.md).
// Pure: shared by the app, the connector and the Mac.

export interface SnackLike { kind?: string | null; snack_ok?: boolean | null; quick?: boolean | null; status?: string | null }

/** A snack recipe, a recipe that can also be a snack (baked oats), or a quick snack; never an archived one. */
export function isSnack(r: SnackLike | null | undefined): boolean {
  return !!r && r.status !== 'archived' && (r.kind === 'snack' || r.snack_ok === true || r.quick === true);
}

/** Servings of the recipe in one snack: a snack recipe's snack is one serving; a recipe that can be a snack splits its
 *  batch (base_portions servings) into snack_portions snacks, so one square of an 8-square, 4-serving tray is 0.5. */
export function snackFactor(r: (SnackLike & { base_portions?: number | string | null; snack_portions?: number | string | null }) | null | undefined): number {
  if (!r || r.kind === 'snack' || !r.snack_ok) return 1;
  const base = Number(r.base_portions), snacks = Number(r.snack_portions);
  return base > 0 && snacks > 0 ? base / snacks : 1;
}
