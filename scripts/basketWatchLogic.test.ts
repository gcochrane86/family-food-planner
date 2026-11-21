import { describe, expect, test } from 'vitest';
import { decide, fillPrompt, RETRY_MS } from './basketWatchLogic';

const NOW = Date.parse('2026-11-21T12:00:00Z');

describe('decide', () => {
  test('nothing waiting: nothing to do', () => {
    expect(decide({ waiting: [], running: false, tried: new Map(), now: NOW })).toEqual({ start: false });
  });

  test('a new request starts Claude and remembers it was tried', () => {
    expect(decide({ waiting: ['run:a'], running: false, tried: new Map(), now: NOW })).toEqual({ start: true, ids: ['run:a'] });
  });

  test('never starts a second Claude while one is running', () => {
    expect(decide({ waiting: ['run:a'], running: true, tried: new Map(), now: NOW })).toEqual({ start: false });
  });

  test('a request Claude already tried waits before another go, so a failing fill does not loop', () => {
    const tried = new Map([['run:a', NOW - 60_000]]);
    expect(decide({ waiting: ['run:a'], running: false, tried, now: NOW })).toEqual({ start: false });
    expect(decide({ waiting: ['run:a'], running: false, tried, now: NOW - 60_000 + RETRY_MS })).toEqual({ start: true, ids: ['run:a'] });
  });

  test('a new request starts Claude even while an older one is waiting out its retry', () => {
    const tried = new Map([['run:a', NOW - 60_000]]);
    expect(decide({ waiting: ['run:a', 'fresh:b'], running: false, tried, now: NOW })).toEqual({ start: true, ids: ['fresh:b'] });
  });
});

describe('fillPrompt', () => {
  test('drops the task file front matter and keeps the instructions', () => {
    const skill = '---\nname: x\ndescription: y\n---\n\nYou fill the trolley.\nSTEP 1 — checks';
    expect(fillPrompt(skill)).toBe('You fill the trolley.\nSTEP 1 — checks');
  });

  test('a file without front matter is used as it is', () => {
    expect(fillPrompt('You fill the trolley.')).toBe('You fill the trolley.');
  });
});
