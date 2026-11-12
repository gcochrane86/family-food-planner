/** A moving line: something is happening in the background and the time isn't known (photos being made). */
export default function ProgressLine({ className = 'bg-white/10', bar = 'bg-lcd-ink' }: { className?: string; bar?: string }) {
  return <span aria-hidden="true" className={`block h-1 overflow-hidden rounded-full ${className}`}><span className={`ffp-progress block h-full w-1/3 rounded-full ${bar}`} /></span>;
}
