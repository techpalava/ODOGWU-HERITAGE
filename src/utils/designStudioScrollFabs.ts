/**
 * Design Studio Go to Top / Go to Bottom visibility via document scroll progress.
 * Below 40% shows Go to Bottom only. At or above 40% shows Go to Top only.
 * Kept free of React so Node tests can exercise attach/cleanup without
 * relying on react-test-renderer host refs (which stay null in this toolchain).
 */

export const DESIGN_STUDIO_SCROLL_FAB_SWITCH_PROGRESS = 0.4;

export type DesignStudioScrollFabKind = "top" | "bottom" | "none";

export function getDesignStudioScrollProgress(args?: {
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

export function isDesignStudioGoToBottomVisibleFromProgress(
  progress: number,
  hideAt: number = DESIGN_STUDIO_SCROLL_FAB_SWITCH_PROGRESS,
): boolean {
  return progress < hideAt;
}

export function isDesignStudioGoToTopVisibleFromProgress(
  progress: number,
  showAt: number = DESIGN_STUDIO_SCROLL_FAB_SWITCH_PROGRESS,
): boolean {
  return progress >= showAt;
}

export function resolveDesignStudioScrollFab(args: {
  progress: number;
  blockingOverlayOpen: boolean;
  switchAt?: number;
}): DesignStudioScrollFabKind {
  if (args.blockingOverlayOpen) return "none";
  return isDesignStudioGoToBottomVisibleFromProgress(
    args.progress,
    args.switchAt,
  )
    ? "bottom"
    : "top";
}

export function attachDesignStudioScrollProgressListener(args: {
  onProgressChange: (progress: number) => void;
  getProgress?: () => number;
}): () => void {
  if (
    typeof globalThis.window === "undefined" ||
    typeof globalThis.window.addEventListener !== "function"
  ) {
    return () => undefined;
  }

  const getProgress =
    args.getProgress ?? (() => getDesignStudioScrollProgress());

  const update = () => {
    args.onProgressChange(getProgress());
  };

  update();
  globalThis.window.addEventListener("scroll", update, { passive: true });
  globalThis.window.addEventListener("resize", update);

  return () => {
    globalThis.window.removeEventListener("scroll", update);
    globalThis.window.removeEventListener("resize", update);
  };
}

export function scrollDesignStudioToTop(args: {
  target: HTMLElement | null;
  scrollTo?: typeof window.scrollTo;
}): void {
  const target = args.target;
  if (target) {
    target.style.scrollMarginTop = "6rem";
    target.scrollIntoView?.({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      target.focus?.({ preventScroll: true });
    }, 320);
    return;
  }
  const scrollTo = args.scrollTo ?? window.scrollTo.bind(window);
  scrollTo({ top: 0, behavior: "smooth" });
}

export function scrollDesignStudioToBottom(args: {
  target: HTMLElement | null;
  scrollTo?: typeof window.scrollTo;
}): void {
  const target = args.target;
  if (target) {
    // Clears the docked Continue bar and other sticky stage chrome.
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
