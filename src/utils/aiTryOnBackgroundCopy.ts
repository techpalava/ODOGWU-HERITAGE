/**
 * Customer-facing wording for background AI Try-on (Phase B).
 * PENDING XAVIER'S APPROVAL: every string here is a draft.
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
  /** Toast: ready. */
  readyTitle: (name: string | null) => `${capitalise(aiTryOnPossessive(name))} preview is ready`,
  readyAction: "View preview",
  /** Toast: failed (live request; no try was used). */
  failedTitle: (name: string | null) => `We couldn't create ${aiTryOnPossessive(name)} preview`,
  failedBody: "This try wasn't counted.",
  /** Toast: the page reloaded mid-request and no preview turned up. */
  resumeFailedBody: "The page reloaded before it finished. Check AI Try-on for how many tries you have left.",
  retryAction: "Try again",
  /** Toast: ready, but the design changed while it was being made. */
  staleTitle: (name: string | null) => `${capitalise(aiTryOnPossessive(name))} preview no longer matches your design`,
  staleBody: "You changed the design while we were making it. You can make a new one in AI Try-on.",
  staleAction: "Go to AI Try-on",
  close: "Close",
  /** Shown above AI Try-on after "View preview" from another step. */
  backTo: (stepName: string) => `Back to ${stepName}`,
} as const;
