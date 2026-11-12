import { useEffect, useRef, useState } from 'react';

// Throwaway test page (#/listen-test): does this device's browser keep listening for "next", "back", "repeat",
// "timer" and "stop", opened from the home-screen icon? Removed once hands-free cooking is built.
type Rec = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
const Ctor = (): (new () => Rec) | null => (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition ?? null;
const WORDS = ['next', 'back', 'repeat', 'timer', 'stop'];

export default function ListenTest() {
  const [on, setOn] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [heard, setHeard] = useState<string[]>([]);
  const [restarts, setRestarts] = useState(0);
  const rec = useRef<Rec | null>(null);
  const want = useRef(false);
  const started = useRef(0);
  const add = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 40));
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

  useEffect(() => () => { want.current = false; rec.current?.stop(); }, []);

  function start() {
    const C = Ctor();
    if (!C) { add('Speech recognition is not available here.'); return; }
    const r = new C();
    r.continuous = true; r.interimResults = false; r.lang = 'en-GB';
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim().toLowerCase();
        const w = WORDS.find((x) => new RegExp(`\\b${x}\\b`).test(t));
        add(`heard "${t}"${w ? ` → ${w}` : ''}`);
        if (w) setHeard((h) => [w, ...h].slice(0, 10));
      }
    };
    r.onerror = (e) => add(`error: ${e.error}`);
    r.onend = () => {
      add(`stopped after ${Math.round((Date.now() - started.current) / 1000)}s`);
      if (want.current) { setRestarts((n) => n + 1); try { started.current = Date.now(); r.start(); add('restarted'); } catch (err) { add(`restart failed: ${String(err)}`); } }
    };
    rec.current = r;
    want.current = true;
    started.current = Date.now();
    try { r.start(); setOn(true); add('listening'); } catch (err) { add(`start failed: ${String(err)}`); }
  }
  function stop() { want.current = false; rec.current?.stop(); setOn(false); }

  return (
    <section className="grid gap-3 p-4">
      <h1 className="m-0 text-xl font-bold">Listening test</h1>
      <p className="m-0 text-sm">Speech recognition: <b>{Ctor() ? 'available' : 'not available'}</b> · Opened from the home screen: <b>{standalone ? 'yes' : 'no'}</b></p>
      <p className="m-0 text-sm">Tap Start, allow the microphone, then say next, back, repeat, timer or stop, with pauses and some chat in between, for a minute or two.</p>
      <button type="button" onClick={on ? stop : start} className="justify-self-start rounded-xl bg-accent px-6 py-3 font-semibold text-accent-ink">{on ? 'Stop' : 'Start'}</button>
      <p className="m-0">Commands heard: <b>{heard.join(', ') || 'none yet'}</b> · Restarts: {restarts}</p>
      <ul className="m-0 grid gap-0.5 p-0 font-mono text-xs">{log.map((l, i) => <li key={i} className="list-none">{l}</li>)}</ul>
    </section>
  );
}
