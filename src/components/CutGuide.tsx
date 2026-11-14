import { useEffect, useState } from 'react';
import StoredPhoto from './StoredPhoto';
import { PHOTO_LARGE } from '../lib/photoSizes';
import { CARD_MM, CARD_SHORT_MM, cutGuide, readPxPerMm, savePxPerMm } from '../lib/cutGuide';

// The cut guide: full screen, the chopping picture for this ingredient and cut, what to do in plain words, and a
// true-size ruler down the screen's left edge with a marker at each size the card gives. The ruler is set once per
// device by matching a bank card laid on the screen.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function CutGuideView({ name, qty, note, photo, onMake, onClose }: {
  name: string; qty: string; note: string | null; photo: string | null;
  /** Makes the missing chopping picture; resolves to its path. */
  onMake?: () => Promise<string>;
  onClose: () => void;
}) {
  const guide = cutGuide(name, qty, note);
  const [px, setPx] = useState<number | null>(() => readPxPerMm());
  const [setting, setSetting] = useState(false);
  const [path, setPath] = useState(photo);
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { setPath(photo); }, [photo]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const make = async () => {
    if (!onMake) return;
    setMaking(true); setFailed(null);
    try { setPath(await onMake()); } catch (e) { setFailed(e instanceof Error ? e.message : String(e)); } finally { setMaking(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`How to cut ${name}`} className="fixed inset-0 z-50 overflow-y-auto bg-white text-[#1B211D]"
      // Swipes and taps in here aren't the step screen's (no stepping on behind it).
      onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white/95 px-4 py-3 shadow-sm">
        <b className="text-lg">{cap(name)}{qty ? ` · ${qty}` : ''}</b>
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-[#ECEEE6] text-xl">×</button>
      </div>
      {setting ? (
        <SetRuler start={px} onSave={(v) => { savePxPerMm(v); setPx(v); setSetting(false); }} onCancel={() => setSetting(false)} />
      ) : (
        <div className="grid gap-4 pb-10">
          <div className="grid gap-3 px-4 pt-3">
            {path
              ? <StoredPhoto path={path} width={PHOTO_LARGE} alt={guide?.prep.label ?? name} className="aspect-square w-full max-w-xl justify-self-center rounded-2xl object-contain" />
              : onMake && (
                <button type="button" disabled={making} onClick={make} className="rounded-2xl bg-[#ECEEE6] px-4 py-6 font-semibold">
                  {making ? 'Making the picture…' : 'Make the picture'}
                </button>
              )}
            {failed && <p role="alert" className="m-0 text-sm text-[#A33]">Couldn't make the picture: {failed}</p>}
            {guide && <p className="m-0 text-[clamp(20px,2.6vw,26px)] font-bold leading-snug">{guide.instruction}</p>}
            {guide?.meaning && <p className="m-0 text-lg leading-snug text-[#3F4A43]">{guide.meaning}</p>}
          </div>
          {guide && guide.sizes.length > 0 && (px
            ? <Measure px={px} sizes={guide.sizes} square={guide.square} onReset={() => setSetting(true)} />
            : (
              <div className="grid gap-2 px-4">
                <p className="m-0 text-[#3F4A43]">To see {guide.sizes.map((s) => s.label).join(' and ')} at real size, set the ruler for this screen once.</p>
                <button type="button" onClick={() => setSetting(true)} className="justify-self-start rounded-xl bg-accent px-4 py-2.5 font-bold text-accent-ink">Set the ruler</button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/** The ruler flush with the screen's left edge, zero at the top line, with a marker per size and the life-size piece. */
function Measure({ px, sizes, square, onReset }: { px: number; sizes: { mm: number; label: string }[]; square: number | null; onReset: () => void }) {
  const lengthMm = Math.max(60, Math.ceil((Math.max(...sizes.map((s) => s.mm)) + 15) / 10) * 10);
  const ticks = Array.from({ length: lengthMm + 1 }, (_, mm) => mm);
  return (
    <section aria-label="Real size" className="grid gap-2">
      <p className="m-0 px-4 text-sm text-[#5D6760]">Hold a piece against the screen's left edge, starting at the 0 line.</p>
      <div className="relative" style={{ height: lengthMm * px + 24 }}>
        <div aria-hidden="true" className="absolute left-0 top-0 w-14 border-r border-[#C9CFC2] bg-[#FBF7EC]" style={{ height: lengthMm * px }}>
          {ticks.map((mm) => (
            <div key={mm} className="absolute left-0 bg-[#1B211D]"
              style={{ top: mm * px, height: mm % 10 === 0 ? 2 : 1, width: mm % 10 === 0 ? 28 : mm % 5 === 0 ? 18 : 10 }}>
              {mm % 10 === 0 && <span className="absolute left-8 -top-2.5 font-mono text-xs font-bold">{mm / 10}</span>}
            </div>
          ))}
        </div>
        {sizes.map((s) => (
          <div key={s.label} data-mm={s.mm} className="absolute left-0 right-4 flex items-center" style={{ top: s.mm * px }}>
            <span className="h-[3px] w-20 bg-[#C0392B]" />
            <span className="-translate-y-1/2 rounded-lg bg-[#C0392B] px-2 py-0.5 text-sm font-bold text-white">{s.label}</span>
          </div>
        ))}
        {square && (
          <div aria-label={`Life-size piece: ${square % 10 === 0 ? `${square / 10}cm` : `${square}mm`}`}
            className="absolute right-4 top-0 rounded-md border-2 border-dashed border-[#C0392B] bg-[#FDECEA]"
            style={{ width: square * px, height: square * px }} />
        )}
      </div>
      <button type="button" onClick={onReset} className="justify-self-start px-4 text-sm font-semibold text-[#2D6A3E] underline">Set the ruler again</button>
    </section>
  );
}

/** Lay a bank card upright on the screen and match the outline to it; that gives this screen's pixels per mm. */
function SetRuler({ start, onSave, onCancel }: { start: number | null; onSave: (pxPerMm: number) => void; onCancel: () => void }) {
  const [tall, setTall] = useState(() => Math.round((start ?? 6) * CARD_MM));
  const px = tall / CARD_MM;
  return (
    <div className="grid gap-4 px-4 py-4">
      <p className="m-0 text-lg leading-snug">Lay any bank card upright on the outline below, then make the outline exactly the same size as the card.</p>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Smaller" onClick={() => setTall((t) => t - 1)} className="h-11 w-11 rounded-full bg-[#ECEEE6] text-xl font-bold">−</button>
        <input type="range" aria-label="Card size" min={250} max={800} step={1} value={tall} onChange={(e) => setTall(Number(e.target.value))} className="flex-1" />
        <button type="button" aria-label="Bigger" onClick={() => setTall((t) => t + 1)} className="h-11 w-11 rounded-full bg-[#ECEEE6] text-xl font-bold">+</button>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => onSave(px)} className="rounded-xl bg-accent px-5 py-2.5 font-bold text-accent-ink">Save</button>
        <button type="button" onClick={onCancel} className="rounded-xl bg-[#ECEEE6] px-5 py-2.5 font-semibold">Cancel</button>
      </div>
      <div aria-hidden="true" className="rounded-xl border-[3px] border-[#2D6A3E] bg-[#EEF3EF]" style={{ width: CARD_SHORT_MM * px, height: tall }} />
    </div>
  );
}
