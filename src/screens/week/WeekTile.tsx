import type { Balance } from '../../lib/weekSummary';

const LABEL: [keyof Balance, string][] = [['chicken', 'chicken'], ['fish', 'fish'], ['red_meat', 'red meat'], ['veggie', 'veggie']];

/** The eighth tile on the week grid: where the week stands, its balance, and Approve. */
export default function WeekTile({ approved, saturdayMorning, balance, onApprove }:
  { approved: boolean; saturdayMorning: boolean; balance: Balance; onApprove: () => void }) {
  return (
    <div className={`grid content-between gap-2 rounded-[22px] p-3.5 ${approved ? 'bg-accent-soft' : 'bg-accent text-accent-ink'}`}>
      <div className="grid gap-1">
        <h2 className="text-[17px] font-bold">
          {approved ? '✓ Approved' : saturdayMorning ? "Approve by 2pm today for Sunday's delivery" : "Next week's menu is ready"}
        </h2>
        {!approved && !saturdayMorning && <p className="m-0 text-[13px] opacity-90">Approve by Saturday 2pm for the Sunday delivery.</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        {LABEL.filter(([k]) => balance[k] > 0).map(([k, label]) => (
          <span key={k} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${approved ? 'bg-surface' : 'bg-white/20'}`}>{balance[k]} {label}</span>
        ))}
      </div>
      {!approved && (
        <button type="button" onClick={onApprove} className="rounded-xl bg-accent-ink px-3 py-2.5 font-bold text-accent">Approve week</button>
      )}
    </div>
  );
}
