import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  X,
} from "lucide-react";
import { AI_TRY_ON_BACKGROUND_COPY } from "../utils/aiTryOnBackgroundCopy";
import {
  DesignStudioStepActions,
  studioContinueNavInteractionClass,
  STUDIO_CONTINUE_RING_BLINK_CLASS,
  studioOutlinedNavInteractionClass,
} from "./DesignStudioBackButton";
import type { AiTryOnWorkflowStateV1 } from "../types";
import { getAiTryOnWorkflowAllowedActions } from "../utils/aiTryOnWorkflow";
import { formatDesignStudioStepCounter } from "../utils/designSourceJourney";
import { useReportDesignStudioBlockingOverlay } from "./designStudioBlockingOverlay";
import {
  AI_TRY_ON_ACCURACY_DISCLAIMER_BODY,
  AI_TRY_ON_ACCURACY_DISCLAIMER_TITLE,
  AI_TRY_ON_ACCURACY_MODAL_CTA,
} from "../utils/aiTryOnOrderImageCopy";

interface DormantFutureAiTryOnStepProps {
  workflow: AiTryOnWorkflowStateV1;
  skipAllowed: boolean;
  onBack: () => void;
  onRetry: () => void;
  onSkip: () => void;
  onContinue: () => void;
  /**
   * The live photo panel (AiTryOnPhotoPanel), passed only when
   * `GET /api/ai-try-on` reports the gateway available. Without it the step
   * shows the unavailable state and the skip button.
   */
  livePanel?: ReactNode;
  /**
   * A preview is generating: the skip button reads "Continue while we make
   * your preview"; the request carries on in the background.
   */
  generating?: boolean;
  /**
   * What the server reported: "checking" while the availability request or
   * the design inputs are still loading (no status card then), "unavailable"
   * only when the server truly reported try-on off or capped.
   */
  availability?: "checking" | "available" | "unavailable";
  /** Step names still incomplete, e.g. ["Custom Details"]. */
  missingInputs?: readonly string[];
  /** Force open the disclaimer modal. */
  forceShowDisclaimerModal?: boolean;
}

/** "A", "A and B", "A, B and C". */
const joinStepNames = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** Statuses that still show the status card next to the live panel. */
const LIVE_STATUS_CARD = new Set<AiTryOnWorkflowStateV1["status"]>([
  "awaiting_input",
  "skipped",
  "stale",
]);

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
    description: "Your preview is still being made.",
  },
  completed: {
    title: "Completed",
    description: "A verified private Try-on result is available.",
  },
  failed: {
    title: "AI Try-on could not be completed",
    description:
      "No Try-on preview is available right now. You can continue without it or try again when this service is available.",
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
    title: "AI Try-on is currently unavailable",
    description: "You can continue with your order without a Try-on preview.",
  },
};

const AI_TRY_ON_ACCURACY_DISCLAIMER_SESSION_KEY = "odogwu_ai_try_on_accuracy_disclaimer_seen_v1";

export const DormantFutureAiTryOnStep = ({
  workflow,
  skipAllowed,
  onBack,
  onRetry,
  onSkip,
  onContinue,
  livePanel,
  generating = false,
  availability,
  missingInputs,
  forceShowDisclaimerModal = false,
}: DormantFutureAiTryOnStepProps) => {
  const [disclaimerModalOpen, setDisclaimerModalOpen] = useState(Boolean(forceShowDisclaimerModal));
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  const isLive = Boolean(livePanel);

  useEffect(() => {
    if (forceShowDisclaimerModal) return;
    if (typeof window === "undefined") return;
    if (!isLive && availability !== "available") return;
    try {
      if (window.sessionStorage.getItem(AI_TRY_ON_ACCURACY_DISCLAIMER_SESSION_KEY) !== "1") {
        setDisclaimerModalOpen(true);
      }
    } catch {
      // sessionStorage can be blocked; the banner still shows.
    }
  }, [isLive, availability, forceShowDisclaimerModal]);

  useReportDesignStudioBlockingOverlay("ai-try-on-disclaimer-modal", disclaimerModalOpen);

  const closeDisclaimer = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(AI_TRY_ON_ACCURACY_DISCLAIMER_SESSION_KEY, "1");
    } catch {
      // Closing still dismisses the dialog when storage is blocked.
    }
    setDisclaimerModalOpen(false);
    lastFocusedElement.current?.focus();
  }, []);

  useEffect(() => {
    if (!disclaimerModalOpen || typeof document === "undefined") return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog?.contains(previouslyFocused)) {
      lastFocusedElement.current = previouslyFocused;
    }
    ctaRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeDisclaimer();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const outside = !(active instanceof Node) || !dialog.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [disclaimerModalOpen, closeDisclaimer]);
  // One honest status: "unavailable" only when the server said so, nothing
  // while still checking, and a skip only when the customer chose it.
  const continuedWhileGenerating =
    workflow.status === "skipped" && workflow.skipOrigin === "continued_while_generating";
  const statusHidden =
    availability === "checking" ||
    continuedWhileGenerating ||
    (workflow.status === "unavailable" && availability === "available") ||
    (workflow.status === "awaiting_input" && missingInputs !== undefined && missingInputs.length === 0);
  const showStatusCard =
    !statusHidden && (!isLive || LIVE_STATUS_CARD.has(workflow.status));
  const basePresentation = STATUS_PRESENTATION[workflow.status];
  const presentation =
    workflow.status === "awaiting_input" && missingInputs && missingInputs.length > 0
      ? {
          ...basePresentation,
          description: `Finish ${joinStepNames(missingInputs)} before using AI Try-on.`,
        }
      : basePresentation;
  const { canRetry, canSkip } = getAiTryOnWorkflowAllowedActions({
    state: workflow,
    skipAllowed,
  });
  // Measurement is the step immediately before AI Try-on.
  const previousStageLabel = "Measurement";
  const nextStageLabel = "Summary";

  return (
    <section
      aria-labelledby="future-ai-try-on-title"
      data-stage-id="try_on"
      data-workflow-status={workflow.status}
      className="space-y-5 font-sans"
    >
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioStepActions
          slot="header"
          backDestination={previousStageLabel}
          onBack={onBack}
          className="mb-5"
          forward={{
            destination: nextStageLabel,
            onClick: onContinue,
            disabled: !(workflow.status === "completed" || workflow.status === "skipped"),
            locked: !(workflow.status === "completed" || workflow.status === "skipped"),
            ariaLabel: workflow.status === "completed" || workflow.status === "skipped"
              ? "Continue to Summary"
              : "Continue to Summary is locked",
            label: workflow.status === "completed" || workflow.status === "skipped"
              ? undefined
              : "Summary is locked",
          }}
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          {formatDesignStudioStepCounter("try_on")}
        </p>
        <h2
          id="future-ai-try-on-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          AI Try-on
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          {isLive || availability === "available" || availability === "checking"
            ? "Upload a photo or pick a model to preview your selected garments, fabrics, and visual details on you."
            : "AI Try-on will let you preview your selected garments, fabrics, and visual details when secure private-photo processing is available."}
        </p>
      </div>

      {disclaimerModalOpen && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          data-ai-try-on-accuracy-modal="true"
          aria-labelledby="accuracy-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-heritage-green/50 backdrop-blur-sm"
            onClick={closeDisclaimer}
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={closeDisclaimer}
              className="absolute right-4 top-4 rounded-full p-2 text-heritage-ink/50 hover:bg-heritage-cream hover:text-heritage-green"
              aria-label="Close AI preview disclaimer"
            >
              <X size={20} />
            </button>
            <h2 id="accuracy-modal-title" className="font-serif text-xl font-bold text-heritage-green">
              {AI_TRY_ON_ACCURACY_DISCLAIMER_TITLE}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-heritage-ink/70">
              {AI_TRY_ON_ACCURACY_DISCLAIMER_BODY}
            </p>
            <button
              ref={ctaRef}
              type="button"
              onClick={closeDisclaimer}
              className="mt-6 w-full rounded-xl bg-heritage-green py-3 text-sm font-bold text-white hover:bg-heritage-green/90"
            >
              {AI_TRY_ON_ACCURACY_MODAL_CTA}
            </button>
          </div>
        </div>
      )}

      {(isLive || availability === "available") && (
        <div
          data-ai-try-on-accuracy-disclaimer="true"
          className="rounded-xl border border-heritage-gold/20 bg-heritage-cream/20 p-4"
        >
          <h3 className="font-serif text-base font-bold text-heritage-green">
            {AI_TRY_ON_ACCURACY_DISCLAIMER_TITLE}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
            {AI_TRY_ON_ACCURACY_DISCLAIMER_BODY}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-6">
        {showStatusCard && (
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
            {workflow.status === "failed" && (
              <p id="future-ai-try-on-error" className="mt-2 text-xs font-medium text-heritage-ink/70">
                You can continue without AI Try-on.
              </p>
            )}
          </div>
        </div>
        )}

        {isLive && <div className={showStatusCard ? "mt-5" : ""}>{livePanel}</div>}

        <p className="mt-4 text-xs leading-relaxed text-heritage-ink/60">
          AI Try-on is optional. You can continue your order without it.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              aria-describedby="future-ai-try-on-error"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 bg-white px-5 text-xs font-bold uppercase tracking-wider text-heritage-green ${studioOutlinedNavInteractionClass}`}
            >
              <RefreshCw aria-hidden="true" size={14} />
              Retry
            </button>
          )}
          {canSkip && (
            <button
              type="button"
              onClick={onSkip}
              data-continue-unlock-glow="on"
              className={`inline-flex min-h-11 max-w-full min-w-0 items-center justify-center gap-2 rounded-xl px-5 text-center text-xs font-bold uppercase leading-snug tracking-wide [overflow-wrap:normal] ${studioContinueNavInteractionClass} ${STUDIO_CONTINUE_RING_BLINK_CLASS}`}
            >
              <SkipForward aria-hidden="true" size={14} className="shrink-0" />
              <span className="min-w-0 text-balance">
                {generating ? AI_TRY_ON_BACKGROUND_COPY.continueWhileGenerating : "Continue without AI Try-on"}
              </span>
            </button>
          )}
        </div>
      </div>

      <DesignStudioStepActions
        slot="footer"
        backDestination={previousStageLabel}
        onBack={onBack}
        forward={{
          destination: nextStageLabel,
          onClick: onContinue,
          disabled: !(workflow.status === "completed" || workflow.status === "skipped"),
          locked: !(workflow.status === "completed" || workflow.status === "skipped"),
          ariaLabel: workflow.status === "completed" || workflow.status === "skipped"
            ? "Continue to Summary"
            : "Continue to Summary is locked",
          label: workflow.status === "completed" || workflow.status === "skipped"
            ? undefined
            : "Summary is locked",
        }}
      />
    </section>
  );
};
