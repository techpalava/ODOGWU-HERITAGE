/**
 * Customer-facing wording for background AI Try-on (Phase B).
 * Failure notices distinguish confirmed refunds from unknown network outcomes.
 */

/** "your" for the sole wearer or "You"; otherwise "Ada's". */
export const aiTryOnPossessive = (name: string | null): string =>
  !name || name.trim() === "" || name.trim() === "You" ? "your" : `${name.trim()}'s`;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const AI_TRY_ON_BACKGROUND_COPY = {
  /** Panel, while that wearer's request runs. */
  panelGenerating: (name: string | null) =>
    `Creating ${aiTryOnPossessive(name)} preview. This can take up to a minute. You can carry on with the next steps; we'll let you know when it's ready.`,
  /** Step 6 button while a request runs (replaces "Continue without AI Try-on"). */
  continueWhileGenerating: "Continue while we make your preview",
  /** Status chip by the step bar. */
  chipOne: (name: string | null) => `Making ${aiTryOnPossessive(name)} preview…`,
  chipMany: (count: number) => `Making ${count} previews…`,
  /** Status chip while Gemini is busy and we keep retrying (approved, option A). */
  chipBusy: (name: string | null) => `Still making ${aiTryOnPossessive(name)} preview… it's busy right now`,
  /** Panel, while that wearer's request is being retried (approved, option A). */
  panelBusy:
    "Lots of people are making previews right now. We'll keep trying for a few minutes; you can carry on and we'll let you know.",
  /** Toast: ready. */
  readyTitle: (name: string | null) => `${capitalise(aiTryOnPossessive(name))} preview is ready`,
  readyAction: "View preview",
  /** Toast: failed; the response may have been lost. */
  failedTitle: (name: string | null) => `We couldn't create ${aiTryOnPossessive(name)} preview`,
  failedBody: "Your preview didn’t finish. We couldn’t confirm whether a try was used. Check AI Try-on for your latest tries remaining.",
  /** Busy retries ended; refund confirmation may not have reached the browser. */
  busyFailedBody: "It’s still too busy and your preview didn’t finish. We couldn’t confirm whether a try was used. Check AI Try-on for your latest tries remaining.",
  /** Toast: the page reloaded mid-request and no preview turned up. */
  resumeFailedBody: "Your preview didn’t finish after the page reloaded. We couldn’t confirm whether a try was used. Check AI Try-on for your latest tries remaining.",
  refundedBody: "Your preview didn’t finish. This try was refunded and wasn’t counted.",
  retryAction: "Try again",
  /** Toast: ready, but the design changed while it was being made. */
  staleTitle: (name: string | null) => `${capitalise(aiTryOnPossessive(name))} preview no longer matches your design`,
  staleBody: "You changed the design while we were making it. You can make a new one in AI Try-on.",
  staleAction: "Go to AI Try-on",
  close: "Close",
  /** Shown above AI Try-on after "View preview" from another step. */
  backTo: (stepName: string) => `Back to ${stepName}`,
} as const;
