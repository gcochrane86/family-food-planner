// Amounts written into a step's words ("Add the remaining 150g of pistachios") are the full recipe's. They aren't
// scaled, since many must stay as they are (1000g water to steam over, meatballs of about 40g each), so a scaled step
// says so and points at its cards, which are.
const AMOUNT = /\b\d+(?:[.,]\d+)?\s?(?:g|kg|ml|l|tbsp|tsp)\b/i;

/** The note for a step cooked at `factor` of the recipe, or null when its words carry no amounts or it isn't scaled. */
export function textAmountsNote(body: string, factor: number, basePortions?: number): string | null {
  if (Math.abs(factor - 1) < 0.01 || !AMOUNT.test(body)) return null;
  return `Amounts in the words are for the full recipe${basePortions ? ` (${Math.round(basePortions * 10) / 10})` : ''}. The cards are for yours.`;
}
