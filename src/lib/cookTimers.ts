import { useEffect, useState } from 'react';

// Cook timers shared by cook mode and the roast cook view.

interface RunningTimer { key: string; label: string; endAt: number; done: boolean }

/** A short beep and a buzz, where the device allows them. */
function alarm() {
  try { navigator.vibrate?.([300, 150, 300]); } catch { /* not supported */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* sound not available */ }
}

/**
 * Timers for one recipe that keep running while you move between steps or leave cook mode.
 * Each is a fixed end time, so the countdown is right after the iPad has been locked.
 */
export function useTimers(key: string) {
  const storageKey = `cook-timers:${key}`;
  const [timers, setTimers] = useState<RunningTimer[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as RunningTimer[]; } catch { return []; }
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(timers)); } catch { /* private mode */ }
  }, [storageKey, timers]);

  const anyRunning = timers.some((t) => !t.done);
  useEffect(() => {
    if (!anyRunning) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [anyRunning]);

  useEffect(() => {
    if (!timers.some((t) => !t.done && t.endAt <= now)) return;
    alarm();
    setTimers((list) => list.map((t) => (!t.done && t.endAt <= now ? { ...t, done: true } : t)));
  }, [now, timers]);

  return {
    timers,
    now,
    start(key: string, label: string, minutes: number) {
      const at = Date.now();
      setNow(at);
      setTimers((list) => [...list.filter((t) => t.key !== key), { key, label, endAt: at + minutes * 60_000, done: false }]);
    },
    dismiss(key: string) { setTimers((list) => list.filter((t) => t.key !== key)); },
  };
}

