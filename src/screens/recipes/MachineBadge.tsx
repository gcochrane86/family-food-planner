import { machineLabel } from '../../lib/recipes';
import type { Machine } from '../../lib/types';

/** "TM7 | 12 min · Varoma · speed 2", styled like the machine's own display. */
export default function MachineBadge({ machine, settings }: { machine: Machine; settings: string | null }) {
  return (
    <span className="inline-flex max-w-full overflow-hidden rounded-lg border border-line font-mono text-xs">
      <span className="whitespace-nowrap bg-ink px-2 py-0.5 font-bold text-bg">{machineLabel(machine)}</span>
      {settings && <span className="bg-lcd px-2 py-0.5 text-lcd-ink [overflow-wrap:anywhere]">{settings}</span>}
    </span>
  );
}

/** Shows **word** as bold without using HTML strings. */
export function StepText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>)}</>;
}
