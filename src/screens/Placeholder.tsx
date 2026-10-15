export default function Placeholder({ title, phase }: { title: string; phase: number }) {
  return (
    <section className="py-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-3 rounded-2xl border border-dashed border-line p-6 text-center text-muted">
        Arrives in Phase {phase}. Set up your household in Settings first.
      </p>
    </section>
  );
}
