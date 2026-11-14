/** A labelled on/off switch. */
export function switchClasses(on: boolean) {
  return `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line'}`;
}
