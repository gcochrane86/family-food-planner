import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HourStep } from '../../lib/todayHour';
import HourTimeline from './HourTimeline';

const s = (title: string, from: number, length: number, handsOff = false): HourStep =>
  ({ title, from, length, kind: 'cook', body: '', kit: null, timer: null, ingredients: [], factor: 1, photos: [], ...(handsOff ? { handsOff: true } : {}) });
const STEPS = [s('Chop', 0, 6), s('Simmer', 6, 12, true), s('Couscous', 7, 5), s('Beans', 8, 10, true), s('Plate up', 18, 5)];

test('every step is a bar from its start to its end, and the ones that cook on their own say so', () => {
  render(<HourTimeline steps={STEPS} />);
  const rows = within(screen.getByRole('list', { name: 'Timeline' })).getAllByRole('listitem');
  expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
    'Chop: minutes 0 to 6', 'Simmer: minutes 6 to 18, cooks on its own', 'Couscous: minutes 7 to 12',
    'Beans: minutes 8 to 18, cooks on its own', 'Plate up: minutes 18 to 23',
  ]);
  const bar = rows[1].querySelector('[data-bar]') as HTMLElement;
  expect(bar.style.left).toBe(`${(6 / 23) * 100}%`);
  expect(bar.style.width).toBe(`${(12 / 23) * 100}%`);
});

test('tapping a step goes to it', async () => {
  const pick = vi.fn();
  render(<HourTimeline steps={STEPS} onPick={pick} />);
  await userEvent.click(screen.getByRole('button', { name: /^Couscous/ }));
  expect(pick).toHaveBeenCalledWith(2);
});

test("on a step, it shows just that step and what overlaps it, with this step marked", () => {
  render(<HourTimeline steps={STEPS} current={2} />);
  const rows = within(screen.getByRole('list', { name: 'Timeline' })).getAllByRole('listitem');
  expect(rows.map((r) => r.getAttribute('aria-label')?.split(':')[0])).toEqual(['Simmer', 'Couscous', 'Beans']);
  expect(rows[1]).toHaveAttribute('aria-current', 'step');
});
