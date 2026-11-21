import { describe, expect, test } from 'vitest';
import { orderCovers, runView } from './basketProgress';
import type { BasketRun } from './types';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
const run = (over: Partial<BasketRun>): BasketRun => ({
  id: 'r1', plan_week_id: 'w', delivery: 'sun', status: 'requested', requested_at: ago(10), finished_at: null, summary: null, ...over,
});

describe('runView', () => {
  test('just tapped: waiting for the Mac, no warning', () => {
    expect(runView(run({}), NOW)).toEqual({ label: 'Waiting for your Mac to start Claude…', warning: null, pct: null, item: null });
  });

  test('not picked up after 2 minutes: the Mac is probably off or asleep', () => {
    expect(runView(run({ requested_at: ago(121) }), NOW).warning).toMatch(/Your Mac hasn't picked this up/);
  });

  test('claimed: starting', () => {
    const v = runView(run({ status: 'filling', started_at: ago(5), progress: { stage: 'starting', done: null, total: null, item: null, at: ago(5) } }), NOW);
    expect(v).toEqual({ label: 'Claude is opening Sainsbury’s…', warning: null, pct: 0, item: null });
  });

  test('emptying the trolley', () => {
    expect(runView(run({ status: 'filling', progress: { stage: 'emptying', done: null, total: null, item: null, at: ago(5) } }), NOW).label)
      .toBe('Emptying your trolley…');
  });

  test('adding: counts, a bar and the item it is on', () => {
    const v = runView(run({ status: 'filling', progress: { stage: 'adding', done: 12, total: 34, item: 'chicken thighs', at: ago(5) } }), NOW);
    expect(v).toEqual({ label: 'Adding 12 of 34', warning: null, pct: 35, item: 'chicken thighs' });
  });

  test('no progress for 5 minutes: the Mac may have slept', () => {
    const v = runView(run({ status: 'filling', progress: { stage: 'adding', done: 3, total: 34, item: null, at: ago(301) } }), NOW);
    expect(v.warning).toMatch(/No progress for 5 minutes/);
  });

  test('filling with no progress saved yet goes by when it started', () => {
    expect(runView(run({ status: 'filling', started_at: ago(400), progress: null }), NOW).warning).toMatch(/No progress for 5 minutes/);
    expect(runView(run({ status: 'filling', started_at: ago(10), progress: null }), NOW)).toMatchObject({ label: 'Claude is opening Sainsbury’s…', warning: null });
  });
});

describe('orderCovers', () => {
  const o = (delivery_date: string | null, status = 'confirmed') => ({ status, delivery_date });
  test('a Sunday or Monday delivery is the first shop; Tuesday onwards the second', () => {
    expect(orderCovers(o('2026-11-22'), '2026-11-23')).toBe('sun');
    expect(orderCovers(o('2026-11-23'), '2026-11-23')).toBe('sun');
    expect(orderCovers(o('2026-11-24'), '2026-11-23')).toBe('tue');
  });
  test('other weeks, no date, or cancelled: none', () => {
    expect(orderCovers(o('2026-11-15'), '2026-11-23')).toBeNull();
    expect(orderCovers(o(null), '2026-11-23')).toBeNull();
    expect(orderCovers(o('2026-11-22', 'cancelled'), '2026-11-23')).toBeNull();
  });
});
