import { formatQty, stepIngredients } from '../../lib/recipes';
import type { RecipeIngredient } from '../../lib/types';

/** "For this step": the ingredients a cook-mode step uses, with their amounts scaled by `factor`. */
export default function StepUses({ body, ingredients, factor }: { body: string; ingredients: RecipeIngredient[]; factor: number }) {
  const uses = stepIngredients(body, ingredients);
  if (!uses.length) return null;
  return (
    <ul aria-label="For this step" className="m-0 grid list-none gap-1.5 rounded-2xl bg-white/10 p-3.5 text-[clamp(17px,2.2vw,22px)] md:p-4">
      {uses.map((i, n) => (
        <li key={i.id ?? `${i.name}-${n}`} className="grid grid-cols-[minmax(84px,auto)_minmax(0,1fr)] items-baseline gap-3">
          <b className="font-mono tabular-nums text-lcd-ink">{formatQty(i.qty === null ? null : i.qty * factor, i.unit, i.qty_approx)}</b>
          <span>{i.name}{i.note ? <span className="text-[#9AA89F]"> · {i.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}
