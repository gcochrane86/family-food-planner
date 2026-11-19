import { setAdhoc, useAdhoc } from '../../lib/adhoc';
import { card, Page } from './ui';

const OPTIONS = [
  { adhoc: false, title: 'Weekly plan', text: "The week's menu, Today and the weekly shop." },
  { adhoc: true, title: 'Ad-hoc', text: 'A few meals with no days and a shop just for them: for a quick trip when nothing is organised.' },
];

/** Plan or ad-hoc, for this phone only. The weekly plan and its shop are kept either way. */
export default function PlanMode() {
  const on = useAdhoc();
  return (
    <Page title="Plan or ad-hoc" intro="This phone only: the other phone stays as it is. Switching never changes the weekly plan or its shop.">
      <div role="radiogroup" aria-label="Plan or ad-hoc" className={`${card} divide-y divide-line`}>
        {OPTIONS.map((o) => (
          <button key={o.title} type="button" role="radio" aria-checked={on === o.adhoc} onClick={() => setAdhoc(o.adhoc)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left">
            <span>
              <span className="block font-semibold">{o.title}</span>
              <span className="block text-sm text-muted">{o.text}</span>
            </span>
            <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on === o.adhoc ? 'border-accent' : 'border-line'}`}>
              {on === o.adhoc && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
            </span>
          </button>
        ))}
      </div>
    </Page>
  );
}
