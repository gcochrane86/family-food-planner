export default function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm">
      <span className="min-w-0 font-semibold text-warn">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">
          Try again
        </button>
      )}
    </div>
  );
}
