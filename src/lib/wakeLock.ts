import { useEffect } from 'react';

type Lock = { release(): Promise<void> };
type WakeLockNav = Navigator & { wakeLock?: { request(type: 'screen'): Promise<Lock> } };

/** Keeps the screen on while `enabled`, where the browser allows it (iOS 18.4+ for the home-screen app). The
 *  system lets go when the app is hidden, so it asks again each time the app comes back. */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let lock: Lock | null = null;
    const request = () => {
      (navigator as WakeLockNav).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    };
    request();
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => {}); };
  }, [enabled]);
}

/** A tablet: a touch screen at least 744 points on its short side (iPad mini and up). Phones and Macs aren't. */
export function isTablet(d: { maxTouchPoints: number; width: number; height: number } = {
  maxTouchPoints: navigator.maxTouchPoints ?? 0, width: window.screen?.width ?? 0, height: window.screen?.height ?? 0,
}): boolean {
  return d.maxTouchPoints > 1 && Math.min(d.width, d.height) >= 744;
}
