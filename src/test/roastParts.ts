// Test roast parts: a cut-down version of the household's roast (the real ones live in the private seed).
import { TACOS } from './fixtures';
import type { Recipe } from '../lib/types';

const part = (slug: string, title: string, kind: 'main' | 'side', mains: string[], steps: object[]): Recipe =>
  ({ ...TACOS, id: `r-${slug}`, slug, title, kind: 'component', tags: ['Roast'], hero_image_path: null, base_portions: 6, roast: { part: kind, mains, steps } });

export const ROAST_PARTS: Recipe[] = [
  part('roast-brisket', 'Overnight-Braised Brisket', 'main', ['beef'], [
    { title: 'Overnight braise', before: 900, minutes: 600, kit: 'apo', temp: 80, when: 'night' },
    { title: 'Carve', before: 4, minutes: 8, kit: 'counter', when: 'service' }]),
  { ...part('roast-silverside', 'Slow-Cooked Silverside', 'main', ['beef'], [
    { title: 'Slow-cook', before: 600, minutes: 540, kit: 'apo', temp: 75, when: 'night' }]), roast: { part: 'main', mains: ['beef'], cut: 'Silverside', steps: [
    { title: 'Slow-cook', before: 600, minutes: 540, kit: 'apo', temp: 75, when: 'night' }] } },
  { ...part('roast-ribeye', 'Roast Rib-Eye of Beef', 'main', ['beef'], []), roast: { part: 'main', mains: ['beef'], cut: 'Ribeye', doneness: 'medium', steps: [
    { title: 'Roast', before: 100, minutes: 80, kit: 'oven', temp: 180, fan: true, trays: 0.5, when: 'service', byDoneness: { rare: 60, medium_rare: 70, medium: 80, well_done: 110 } },
    { title: 'Rest', before: 20, minutes: 20, kit: 'counter', when: 'service' }] } },
  part('roast-lamb', 'Roast Leg of Lamb', 'main', ['lamb'], [
    { title: 'Roast', before: 150, minutes: 110, kit: 'apo', temp: 180, when: 'service' }]),
  part('christmas-turkey', 'Roast Turkey Crown', 'main', ['turkey'], [
    { title: 'Dry-brine the turkey', before: 0, minutes: 15, kit: 'counter', when: 'day1', at: '18:00' },
    { title: 'Roast the turkey', before: 225, minutes: 150, kit: 'oven', temp: 180, fan: true, trays: 0.5, when: 'service' }]),
  part('christmas-ham', 'Glazed Ham', 'main', ['ham'], [
    { title: 'Soak the gammon', before: 0, minutes: 5, kit: 'counter', when: 'day2', at: '18:00' },
    { title: 'Bake the glaze', before: 70, minutes: 30, kit: 'oven', temp: 200, fan: true, trays: 0.5, when: 'service' }]),
  part('roast-chicken', 'Roast Chicken', 'main', ['chicken'], [
    { title: 'Roast', before: 105, minutes: 80, kit: 'apo', temp: 200, when: 'service' }]),
  part('goose-fat-roasties', 'Goose-Fat Roasties', 'side', [], [
    { title: 'Steam the potatoes', before: 285, minutes: 60, kit: 'apo', temp: 85, when: 'morning' },
    { title: 'Roast', before: 48, minutes: 44, kit: 'oven', temp: 210, fan: true, trays: 1, when: 'service' }]),
  part('yorkshire-puddings', 'Yorkshire Puddings', 'side', [], [
    { title: 'Bake', before: 75, minutes: 21, kit: 'oven', temp: 220, fan: true, trays: 1, when: 'service' }]),
  part('roast-mash', 'Whipped Mash', 'side', [], [{ title: 'Boil', before: 90, minutes: 18, kit: 'hob', when: 'service' }]),
  part('honey-citrus-carrots', 'Honey-Citrus Carrots', 'side', [], [{ title: 'Roast', before: 54, minutes: 50, kit: 'oven', temp: 200, trays: 0.5, when: 'service' }]),
  part('bay-parsnips', 'Bay-Roasted Parsnips', 'side', [], [{ title: 'Roast', before: 54, minutes: 50, kit: 'oven', temp: 200, trays: 0.5, when: 'service' }]),
  part('cauliflower-cheese', 'Cauliflower Cheese', 'side', [], [{ title: 'Bake', before: 42, minutes: 38, kit: 'oven', temp: 200, trays: 0.5, when: 'service' }]),
  part('roast-gravy', 'Proper Gravy', 'side', [], [{ title: 'Finish', before: 20, minutes: 20, kit: 'hob', when: 'service' }]),
  part('braised-red-cabbage', 'Braised Red Cabbage', 'side', [], [{ title: 'Reheat', before: 20, minutes: 15, kit: 'hob', when: 'service' }]),
  part('mint-sauce', 'Fresh Mint Sauce', 'side', ['lamb'], [{ title: 'Make the mint sauce', before: 240, minutes: 5, kit: 'tm7', when: 'morning' }]),
  part('horseradish-cream', 'Horseradish Cream', 'side', ['beef'], [{ title: 'Make the horseradish cream', before: 240, minutes: 5, kit: 'counter', when: 'morning' }]),
];
