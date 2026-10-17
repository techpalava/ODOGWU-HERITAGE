import { useEffect, useState } from "react";

export const VIEW_LOADING_SLOW_MS = 8000;

/** Suspense fallback for tab views; offers a reload if a chunk stalls. */
export function ViewLoadingFallback({ slowAfterMs = VIEW_LOADING_SLOW_MS }: { slowAfterMs?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs]);
  return (
    <div
      className="flex h-64 flex-col items-center justify-center gap-4"
      data-view-loading-fallback={slow ? "slow" : "loading"}
    >
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-heritage-gold"></div>
      {slow ? (
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-heritage-ink/70">
            This page is taking longer than usual to load.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-heritage-green px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Reload page
          </button>
        </div>
      ) : null}
    </div>
  );
}
