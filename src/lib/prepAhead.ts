import { useState } from 'react';

const KEY = 'ffp.prepAhead';

/** Whether recipes show the prep-ahead split ("The night before" / "On the night"). Remembered on this device. */
export function usePrepAhead(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } });
  const set = (v: boolean) => {
    setOn(v);
    try { if (v) localStorage.setItem(KEY, 'on'); else localStorage.removeItem(KEY); } catch { /* private mode: just this visit */ }
  };
  return [on, set];
}

/** A labelled on/off switch. */
export function switchClasses(on: boolean) {
  return `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line'}`;
}
