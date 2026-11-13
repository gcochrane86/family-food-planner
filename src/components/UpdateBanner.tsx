import { useAppUpdate } from '../lib/appUpdate';

/** "A new version of the app is ready · Refresh": switches to it without closing and reopening the app. */
export default function UpdateBanner() {
  const { needRefresh, refresh } = useAppUpdate();
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-[70] mx-auto flex w-[min(92%,480px)] items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-bg shadow-lg print:hidden">
      <span className="text-sm font-semibold">A new version of the app is ready</span>
      <button type="button" onClick={refresh} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">Refresh</button>
    </div>
  );
}
