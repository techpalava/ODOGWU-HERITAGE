/**
 * Step 4 "Go to Top" visibility via IntersectionObserver on a top sentinel.
 * Kept free of React so Node tests can exercise observer attach/cleanup without
 * relying on react-test-renderer host refs (which stay null in this toolchain).
 */

export const CUSTOM_DETAILS_GO_TO_TOP_ROOT_MARGIN = "-320px 0px 0px 0px";

export function attachCustomDetailsGoToTopObserver(args: {
  sentinel: Element;
  onVisibilityChange: (showGoToTop: boolean) => void;
  rootMargin?: string;
}): () => void {
  if (typeof globalThis.IntersectionObserver === "undefined") {
    return () => undefined;
  }
  const observer = new globalThis.IntersectionObserver(
    ([entry]) => {
      args.onVisibilityChange(!entry.isIntersecting);
    },
    {
      root: null,
      threshold: 0,
      rootMargin: args.rootMargin ?? CUSTOM_DETAILS_GO_TO_TOP_ROOT_MARGIN,
    },
  );
  observer.observe(args.sentinel);
  return () => observer.disconnect();
}

export function scrollCustomDetailsToTop(args: {
  title: HTMLElement | null;
  scrollTo?: typeof window.scrollTo;
}): void {
  const title = args.title;
  if (title) {
    title.style.scrollMarginTop = "6rem";
    title.scrollIntoView?.({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      title.focus?.({ preventScroll: true });
    }, 320);
    return;
  }
  const scrollTo = args.scrollTo ?? window.scrollTo.bind(window);
  scrollTo({ top: 0, behavior: "smooth" });
}
