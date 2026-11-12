import { act, renderHook } from '@testing-library/react';
import { FakeRec, installFakeSpeech } from '../test/fakeSpeech';
import { commandsIn, makeTracker, speakable, useHandsFree } from './voice';

test('finds every "planner …" command in order and ignores the bare words', () => {
  expect(commandsIn('planner next planner repeat and then i\'ll have a conversation with costas and planner stop')).toEqual(['next', 'repeat', 'stop']);
  expect(commandsIn('what comes next? go back to the hob')).toEqual([]);
  expect(commandsIn('Planter Next, plan a back')).toEqual(['next', 'back']);
  expect(commandsIn('planner timer')).toEqual([]);
});

test('a growing live transcript acts on each command once', () => {
  const t = makeTracker();
  const res = (...texts: string[]) => texts.map((s) => [{ transcript: s }]);
  expect(t.fresh(0, res('planner'))).toEqual([]);
  expect(t.fresh(0, res('planner next'))).toEqual(['next']);
  expect(t.fresh(0, res('planner next and some chat'))).toEqual([]);
  expect(t.fresh(0, res('planner next and some chat planner back'))).toEqual(['back']);
  // A later result in the same session counts on its own.
  expect(t.fresh(1, res('planner next and some chat planner back', 'planner repeat'))).toEqual(['repeat']);
  t.reset();
  expect(t.fresh(0, res('planner next'))).toEqual(['next']);
});

test('the read-aloud text drops the bold markers', () => {
  expect(speakable('Rice on', 'Add **400g basmati rice** and stir.')).toBe('Rice on. Add 400g basmati rice and stir.');
});

describe('useHandsFree', () => {
  let remove = () => {};
  beforeEach(() => { remove = installFakeSpeech(); });
  afterEach(() => remove());

  test('listens with the live transcript, runs commands, and keeps going after the browser stops', () => {
    const onNext = vi.fn(); const onBack = vi.fn();
    const { result } = renderHook(() => useHandsFree({ onNext, onBack, text: () => 'Step' }));
    expect(result.current.supported).toBe(true);
    act(() => result.current.toggle());
    const r = FakeRec.last!;
    expect(r.interimResults).toBe(true);
    expect(r.continuous).toBe(true);
    act(() => r.say('planner next'));
    act(() => r.say('planner next then planner back'));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    act(() => r.onend!());
    expect(r.started).toBe(2);
    expect(result.current.on).toBe(true);
    act(() => r.say('planner stop'));
    expect(result.current.on).toBe(false);
  });

  test('a refused microphone turns it off and says why', () => {
    const { result } = renderHook(() => useHandsFree({ onNext: vi.fn(), onBack: vi.fn(), text: () => '' }));
    act(() => result.current.toggle());
    act(() => { FakeRec.last!.onerror!({ error: 'not-allowed' }); FakeRec.last!.onend!(); });
    expect(result.current.on).toBe(false);
    expect(result.current.error).toMatch(/microphone/i);
  });
});
