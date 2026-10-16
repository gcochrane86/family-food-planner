// What the recipe editor saves: the recipe's changed fields, and its ingredients and steps as save_recipe takes them.
import type { Recipe, RecipeEdit, RecipeIngredient, RecipeStep } from './types';

export function recipeSavePayload(original: Recipe & { steps: RecipeStep[] }, fields: RecipeEdit, ingredients: RecipeIngredient[], steps: RecipeStep[]) {
  const was = new Map(original.steps.filter((s) => s.id).map((s) => [s.id, s.phase]));
  const position: Record<string, number> = {};
  const stepRows = steps.map((st) => ({
    phase: st.phase, position: (position[st.phase] = (position[st.phase] ?? 0) + 1),
    // A step moved to another part of the method has no meaningful "at N min" any more.
    at_minute: st.id && was.get(st.id) === st.phase ? st.at_minute : null,
    title: st.title, body: st.body, machine: st.machine, settings: st.settings, timer_minutes: st.timer_minutes,
    image_path: st.image_path, image_source: st.image_source, photo_hint: st.photo_hint ?? null,
  }));
  const ingredientRows = ingredients.map((g, i) => ({
    position: i + 1, group_name: g.group_name, name: g.name, qty: g.qty, unit: g.unit, note: g.note, qty_approx: g.qty_approx,
  }));
  // Keep the recipe's equipment (a MEATER or hob it needs without naming it on a step) and add the steps' machines.
  const equipment = [...new Set([...original.equipment, ...steps.map((st) => st.machine).filter((m): m is NonNullable<typeof m> => !!m)])];
  return { fields: { ...fields, equipment }, ingredients: ingredientRows, steps: stepRows };
}
