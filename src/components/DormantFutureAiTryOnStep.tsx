import {
  AlertTriangle,
  ArrowLeft,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  SkipForward,
} from "lucide-react";
import type { AiTryOnWorkflowStateV1 } from "../types";

interface DormantFutureAiTryOnStepProps {
  workflow: AiTryOnWorkflowStateV1;
  skipAllowed: boolean;
  onBack: () => void;
  onRetry: () => void;
  onSkip: () => void;
}

const STATUS_PRESENTATION: Readonly<
  Record<
    AiTryOnWorkflowStateV1["status"],
    { title: string; description: string }
  >
> = {
  not_started: {
    title: "Not started",
    description: "Your Try-on inputs have not been prepared yet.",
  },
  awaiting_input: {
    title: "Input needed",
    description: "Complete the preceding design choices before using AI Try-on.",
  },
  ready: {
    title: "Ready",
    description: "Your design inputs are ready for a securely configured Try-on provider.",
  },
  processing: {
    title: "Processing",
    description: "A verified Try-on job is still processing.",
  },
  completed: {
    title: "Completed",
    description: "A verified private Try-on result is available.",
  },
  failed: {
    title: "Try-on failed",
    description: "The Try-on could not be completed. No provider details were stored.",
  },
  skipped: {
    title: "Skipped",
    description: "You chose to continue without AI Try-on.",
  },
  stale: {
    title: "Update required",
    description: "Your design changed, so the previous Try-on result is no longer current.",
  },
  unavailable: {
    title: "Currently unavailable",
    description: "Secure customer-photo processing and an AI provider are not configured yet.",
  },
};

export const DormantFutureAiTryOnStep = ({
  workflow,
  skipAllowed,
  onBack,
  onRetry,
  onSkip,
}: DormantFutureAiTryOnStepProps) => {
  const presentation = STATUS_PRESENTATION[workflow.status];
  const canRetry = workflow.status === "failed" && workflow.failure?.retryable;
  const canSkip =
    skipAllowed &&
    !["processing", "completed", "skipped"].includes(workflow.status);

  return (
    <section
      aria-labelledby="future-ai-try-on-title"
      data-stage-id="try_on"
      data-workflow-status={workflow.status}
      className="space-y-5 font-sans"
    >
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-heritage-green/20 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Custom Details
        </button>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 5 of 9
        </p>
        <h2
          id="future-ai-try-on-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          AI Try-on
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          AI Try-on will let you preview your selected garments, fabrics, and
          visual details when secure private-photo processing is available.
        </p>
      </div>

      <div className="rounded-2xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-6">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex min-w-0 items-start gap-3 rounded-xl border border-heritage-green/15 bg-heritage-cream/35 p-4"
        >
          {workflow.status === "failed" || workflow.status === "stale" ? (
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-gold"
              size={19}
            />
          ) : (
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-green"
              size={19}
            />
          )}
          <div className="min-w-0">
            <h3 className="break-words font-serif text-lg font-bold text-heritage-green">
              {presentation.title}
            </h3>
            <p className="mt-1 break-words text-sm leading-relaxed text-heritage-ink/70">
              {presentation.description}
            </p>
            {workflow.status === "failed" && workflow.failure && (
              <p id="future-ai-try-on-error" className="mt-2 text-xs text-red-700">
                Reference: {workflow.failure.code.replaceAll("_", " ")}.
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-heritage-ink/60">
          No body photo is requested or stored by this dormant stage. A real
          Try-on will require private ownership-bound photo and result storage.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              aria-describedby="future-ai-try-on-error"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              <RefreshCw aria-hidden="true" size={14} />
              Retry
            </button>
          )}
          {canSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-gold/40 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              <SkipForward aria-hidden="true" size={14} />
              Skip AI Try-on
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Custom Details
        </button>
        <button
          type="button"
          disabled
          aria-label="Continue to Measurement is locked"
          className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-heritage-green/35 px-5 text-xs font-bold uppercase tracking-wider text-white"
        >
          <LockKeyhole aria-hidden="true" size={14} />
          Continue to Measurement
        </button>
      </div>
    </section>
  );
};
