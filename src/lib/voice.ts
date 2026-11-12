import { useCallback, useEffect, useRef, useState } from 'react';

// Hands-free cooking: say "planner next", "planner back", "planner repeat" or "planner stop" in cook mode or
// Today's hour. Uses the browser's own speech recognition (free, on the device). Only words after "planner" count,
// so "next" or "back" in normal conversation never moves the screen.

export type VoiceCommand = 'next' | 'back' | 'repeat' | 'stop';

// The wake word, and how speech recognition tends to mishear it.
const WAKE = '(?:planner|planer|planter|plana|plan a|plan her|plan or)';
const COMMAND = new RegExp(`\\b${WAKE}[\\s,.]+(next|back|repeat|stop)\\b`, 'gi');

/** Every "planner …" command in a stretch of speech, in the order said. */
export function commandsIn(text: string): VoiceCommand[] {
  return [...text.matchAll(COMMAND)].map((m) => m[1].toLowerCase() as VoiceCommand);
}

type Results = ArrayLike<ArrayLike<{ transcript: string }>>;

/** Safari sends a live transcript that grows as you talk (and only finalises it much later), so each result is
 *  re-read as it grows and only commands not yet acted on are returned. Reset when listening starts again. */
export function makeTracker() {
  let seen = new Map<number, number>();
  return {
    fresh(from: number, results: Results): VoiceCommand[] {
      const out: VoiceCommand[] = [];
      for (let i = from; i < results.length; i++) {
        const cmds = commandsIn(results[i]?.[0]?.transcript ?? '');
        const done = seen.get(i) ?? 0;
        if (cmds.length > done) { out.push(...cmds.slice(done)); seen.set(i, cmds.length); }
      }
      return out;
    },
    reset() { seen = new Map(); },
  };
}

/** A step as it should sound read aloud. */
export const speakable = (title: string, body: string) => `${title}. ${body.replace(/\*\*/g, '')}`.trim();

type Rec = {
  continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: Results }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
};
const Ctor = (): (new () => Rec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

function speak(text: string) {
  const s = window.speechSynthesis;
  if (!s || typeof SpeechSynthesisUtterance === 'undefined' || !text) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  s.speak(u);
}

/** The Listen switch's state. `text` is what "planner repeat" reads aloud (the step on screen). */
export function useHandsFree(h: { onNext: () => void; onBack: () => void; text: () => string }) {
  const supported = !!Ctor();
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlers = useRef(h);
  handlers.current = h;
  const rec = useRef<Rec | null>(null);
  const want = useRef(false);
  const quickEnds = useRef(0);
  const live = useRef(true);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reasons = useRef<string[]>([]);

  const halt = (message?: string) => {
    want.current = false;
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
    rec.current = null;
    setOn(false);
    if (message) setError(message);
  };

  const stop = useCallback(() => {
    const r = rec.current;
    halt();
    r?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  /** One listening session, on a fresh listener each time (Safari won't reliably reuse one). */
  const listen = useCallback(() => {
    const C = Ctor();
    if (!C || !want.current) return;
    const r = new C();
    const tracker = makeTracker();
    r.continuous = true; r.interimResults = live.current; r.lang = 'en-GB';
    const began = Date.now();
    let reason = '';
    r.onresult = (e) => {
      for (const c of tracker.fresh(e.resultIndex, e.results)) {
        if (!want.current || rec.current !== r) return;
        if (c === 'next') handlers.current.onNext();
        else if (c === 'back') handlers.current.onBack();
        else if (c === 'repeat') speak(handlers.current.text());
        else if (c === 'stop') stop();
      }
    };
    r.onerror = (e) => {
      reason = e.error;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        halt('Listening needs the microphone: allow it for this app in Settings, then try again.');
      }
    };
    // The browser stops listening after a pause or a minute or so: start again while the switch is on.
    r.onend = () => {
      if (rec.current !== r || !want.current) return;
      const secs = (Date.now() - began) / 1000;
      if (secs < 1.5) {
        quickEnds.current += 1;
        reasons.current = [...reasons.current, `${reason || 'ended'} after ${secs.toFixed(1)}s`].slice(-3);
      } else quickEnds.current = 0;
      // Safari may not keep a live transcript going: fall back to how the listening test listened.
      if (quickEnds.current >= 2) live.current = false;
      if (quickEnds.current >= 8) { halt(`Listening keeps stopping (Safari: ${reasons.current.join('; ')}). Tap Listen to try again.`); return; }
      retry.current = setTimeout(() => { retry.current = null; listen(); }, Math.min(250 * 2 ** quickEnds.current, 4000));
    };
    rec.current = r;
    try { r.start(); } catch (err) { halt(`Couldn't start listening (${err instanceof Error ? err.name : String(err)}).`); }
  }, [stop]);

  const start = useCallback(() => {
    if (!Ctor()) return;
    want.current = true;
    quickEnds.current = 0;
    live.current = true;
    reasons.current = [];
    setError(null);
    setOn(true);
    listen();
  }, [listen]);

  const toggle = useCallback(() => { if (want.current) stop(); else start(); }, [start, stop]);

  useEffect(() => () => { const r = rec.current; halt(); r?.stop(); window.speechSynthesis?.cancel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { supported, on, error, toggle };
}
