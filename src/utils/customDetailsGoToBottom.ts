/**
 * Step 4 "Go to Bottom" visibility via document scroll progress.
 * Kept free of React so Node tests can exercise attach/cleanup without
 * relying on react-test-renderer host refs (which stay null in this toolchain).
 */

export const CUSTOM_DETAILS_GO_TO_BOTTOM_HIDE_AT_PROGRESS = 0.4;

export function getCustomDetailsScrollProgress(args?: {
  scrollY?: number;
  scrollHeight?: number;
  clientHeight?: number;
}): number {
  const scrollY =
    args?.scrollY ??
    (typeof globalThis.window !== "undefined" ? globalThis.window.scrollY : 0);
  const scrollHeight =
    args?.scrollHeight ??
    (typeof globalThis.document !== "undefined"
      ? globalThis.document.documentElement.scrollHeight
      : 0);
  const clientHeight =
    args?.clientHeight ??
    (typeof globalThis.window !== "undefined"
      ? globalThis.window.innerHeight
      : 0);
  const maxScroll = Math.max(1, scrollHeight - clientHeight);
  return Math.min(1, Math.max(0, scrollY / maxScroll));
}

export function isCustomDetailsGoToBottomVisibleFromProgress(
  progress: number,
  hideAt: number = CUSTOM_DETAILS_GO_TO_BOTTOM_HIDE_AT_PROGRESS,
): boolean {
  return progress < hideAt;
}

export function attachCustomDetailsGoToBottomScrollListener(args: {
  onVisibilityChange: (showGoToBottom: boolean) => void;
  hideAtProgress?: number;
  getProgress?: () => number;
}): () => void {
  if (
    typeof globalThis.window === "undefined" ||
    typeof globalThis.window.addEventListener !== "function"
  ) {
    return () => undefined;
  }

  const hideAt =
    args.hideAtProgress ?? CUSTOM_DETAILS_GO_TO_BOTTOM_HIDE_AT_PROGRESS;
  const getProgress =
    args.getProgress ?? (() => getCustomDetailsScrollProgress());

  const update = () => {
    args.onVisibilityChange(
      isCustomDetailsGoToBottomVisibleFromProgress(getProgress(), hideAt),
    );
  };

  update();
  globalThis.window.addEventListener("scroll", update, { passive: true });
  globalThis.window.addEventListener("resize", update);

  return () => {
    globalThis.window.removeEventListener("scroll", update);
    globalThis.window.removeEventListener("resize", update);
  };
}

export function scrollCustomDetailsToBottom(args: {
  target: HTMLElement | null;
  scrollTo?: typeof window.scrollTo;
}): void {
  const target = args.target;
  if (target) {
    target.style.scrollMarginBottom = "6rem";
    target.scrollIntoView?.({ behavior: "smooth", block: "end" });
    window.setTimeout(() => {
      target.focus?.({ preventScroll: true });
    }, 320);
    return;
  }
  const scrollTo = args.scrollTo ?? window.scrollTo.bind(window);
  const top =
    typeof globalThis.document !== "undefined"
      ? globalThis.document.documentElement.scrollHeight
      : Number.MAX_SAFE_INTEGER;
  scrollTo({ top, behavior: "smooth" });
}
