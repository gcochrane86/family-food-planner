// A stand-in for the browser's speech recognition, for hands-free tests.
export class FakeRec {
  static last: FakeRec | null = null;
  continuous = false; interimResults = false; lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0;
  constructor() { FakeRec.last = this; }
  start() { this.started += 1; }
  stop() { this.onend?.(); }
  say(text: string, index = 0) {
    const results = Array.from({ length: index + 1 }, (_, i) => [{ transcript: i === index ? text : '' }]);
    this.onresult?.({ resultIndex: index, results });
  }
}

export function installFakeSpeech() {
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRec;
  FakeRec.last = null;
  return () => { delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition; };
}
