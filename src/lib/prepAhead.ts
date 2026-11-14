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

export { switchClasses } from './switchClasses';
