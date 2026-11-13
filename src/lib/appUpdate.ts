import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_EVERY = 30 * 60 * 1000;

/** Whether a newer version of the app is downloaded and waiting, and how to switch to it. It looks for one every
 *  30 minutes and whenever the app comes back on screen. */
export function useAppUpdate(): { needRefresh: boolean; refresh: () => void } {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine !== false) void reg.update().catch(() => {}); };
      setInterval(check, CHECK_EVERY);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });
  return { needRefresh, refresh: () => void updateServiceWorker(true) };
}
