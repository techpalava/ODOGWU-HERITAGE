import { AlertTriangle, ArrowLeft, Loader2, Sparkles, X } from "lucide-react";
import type { AiTryOnBackgroundJob } from "../services/aiTryOnBackgroundJobs";
import { AI_TRY_ON_BACKGROUND_COPY as COPY } from "../utils/aiTryOnBackgroundCopy";

/**
 * Background AI Try-on: the status chip by the step bar, the toasts that
 * stay until the customer acts on them, and the "Back to <step>" link.
 *
 * These are separate from the app's notification HUD: that one shows one
 * text line and hides itself after 4 seconds, while these need a thumbnail,
 * buttons, one per wearer, and must stay until tapped or closed. They use
 * the same look (forest green, gold border).
 */

export type AiTryOnToastKind = "ready" | "stale" | "failed" | "busy_failed" | "resume_failed";

export const aiTryOnToastKind = (
  job: AiTryOnBackgroundJob,
  currentFingerprint: string | null | undefined,
): AiTryOnToastKind => {
  if (job.status === "completed") {
    return currentFingerprint && currentFingerprint === job.inputFingerprint ? "ready" : "stale";
  }
  if (job.outcome?.kind === "busy_failed") return "busy_failed";
  return job.resumed && !job.outcome ? "resume_failed" : "failed";
};

export const AiTryOnGeneratingChip = ({ jobs }: { jobs: readonly AiTryOnBackgroundJob[] }) => {
  if (!jobs.length) return null;
  // Several wearers keep the count wording, busy or not.
  const text =
    jobs.length === 1
      ? jobs[0].busy
        ? COPY.chipBusy(jobs[0].wearerName)
        : COPY.chipOne(jobs[0].wearerName)
      : COPY.chipMany(jobs.length);
  return (
    <div className="mt-2 flex justify-end">
      <p
        role="status"
        aria-live="polite"
        data-ai-try-on-chip
        data-ai-try-on-chip-busy={jobs.length === 1 && jobs[0].busy ? "" : undefined}
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-heritage-gold/50 bg-heritage-forest px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
      >
        <Loader2 aria-hidden="true" size={13} className="shrink-0 animate-spin text-heritage-gold" />
        <span className="min-w-0 truncate">{text}</span>
      </p>
    </div>
  );
};

export interface AiTryOnToastEntry {
  job: AiTryOnBackgroundJob;
  kind: AiTryOnToastKind;
}

export const AiTryOnBackgroundToasts = ({
  toasts,
  onView,
  onRetry,
  onClose,
}: {
  toasts: readonly AiTryOnToastEntry[];
  onView: (wearerId: string) => void;
  onRetry: (wearerId: string) => void;
  onClose: (wearerId: string) => void;
}) => {
  if (!toasts.length) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[22rem]"
      data-ai-try-on-toasts
    >
      {toasts.map(({ job, kind }) => {
        const ready = kind === "ready";
        const title =
          kind === "ready"
            ? COPY.readyTitle(job.wearerName)
            : kind === "stale"
              ? COPY.staleTitle(job.wearerName)
              : COPY.failedTitle(job.wearerName);
        const body =
          job.outcome && "tryRefunded" in job.outcome && job.outcome.tryRefunded === true ? COPY.refundedBody : kind === "failed" ? COPY.failedBody : kind === "busy_failed" ? COPY.busyFailedBody : kind === "resume_failed" ? COPY.resumeFailedBody : kind === "stale" ? COPY.staleBody : null;
        const action = kind === "ready" ? COPY.readyAction : kind === "stale" ? COPY.staleAction : COPY.retryAction;
        return (
          <div
            key={job.wearerId}
            role={ready ? "status" : "alert"}
            data-ai-try-on-toast={kind}
            data-wearer-id={job.wearerId}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border-2 border-heritage-gold bg-heritage-forest p-3 font-sans text-xs text-white shadow-2xl animate-fade-in"
          >
            {ready && job.preview ? (
              <img
                src={`data:${job.preview.mimeType};base64,${job.preview.data}`}
                alt=""
                className="h-16 w-12 shrink-0 rounded-lg border border-heritage-gold/40 bg-white/10 object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-heritage-gold/25 text-heritage-gold">
                {ready ? <Sparkles size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{title}</p>
              {body && <p className="mt-1 leading-relaxed text-white/80">{body}</p>}
              <button
                type="button"
                onClick={() => (kind === "ready" ? onView(job.wearerId) : onRetry(job.wearerId))}
                data-ai-try-on-toast-action
                className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-heritage-gold px-3 text-[11px] font-bold uppercase tracking-wider text-heritage-forest hover:bg-heritage-gold/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {action}
              </button>
            </div>
            <button
              type="button"
              onClick={() => onClose(job.wearerId)}
              aria-label={COPY.close}
              data-ai-try-on-toast-close
              className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const AiTryOnBackLink = ({ stepName, onClick }: { stepName: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    data-ai-try-on-back-link
    className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-heritage-gold/40 bg-white px-4 text-xs font-bold uppercase tracking-wider text-heritage-green shadow-sm hover:border-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
  >
    <ArrowLeft aria-hidden="true" size={14} />
    {COPY.backTo(stepName)}
  </button>
);
