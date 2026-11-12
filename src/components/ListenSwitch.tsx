import { useHandsFree } from '../lib/voice';

/** 🎤 Listen: hands-free "planner next / back / repeat / stop" in cook mode and Today's hour. Off by default;
 *  hidden where the browser has no speech recognition. */
export default function ListenSwitch(props: Parameters<typeof useHandsFree>[0]) {
  const { supported, on, error, toggle } = useHandsFree(props);
  if (!supported) return null;
  return (
    <div className="relative">
      <button type="button" aria-pressed={on} onClick={toggle}
        title='Say "planner next", "planner back", "planner repeat" or "planner stop"'
        className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${on ? 'bg-lcd-ink text-[#0A0E0B]' : 'bg-white/10 text-white'}`}>
        {on ? <><span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#0A0E0B]" />Listening</> : <><span aria-hidden="true">🎤</span>Listen</>}
      </button>
      {on && <p className="absolute right-0 top-11 z-10 m-0 w-60 rounded-xl bg-[#1F2822] px-3 py-2 text-xs text-[#C9D3CC] shadow-lg">Say "planner next", "back", "repeat" or "stop".</p>}
      {error && !on && <p role="alert" className="absolute right-0 top-11 z-10 m-0 w-64 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">{error}</p>}
    </div>
  );
}
