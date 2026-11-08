import {
  createElement,
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";

/**
 * Tab views are lazy chunks. A chunk request that fails or stalls used to
 * leave the tab on the Suspense spinner with no way forward. Each loader
 * retries a failed import once, and light views are prefetched while the
 * browser is idle so a later tab switch does not wait on the network.
 *
 * React.lazy keeps a rejected chunk forever, so the error card's Try Again
 * would render that same failure. A failed view is replaced only when Try
 * Again asks, and only that view asks for its script again.
 */
export const LAZY_VIEW_RETRY_DELAY_MS = 800;

export const retryImportOnce = async <T>(
  load: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> => {
  try {
    return await load();
  } catch (firstError) {
    await wait(LAZY_VIEW_RETRY_DELAY_MS);
    try {
      return await load();
    } catch {
      throw firstError;
    }
  }
};

const failedLazyViewResets = new Set<() => void>();

/** Lets the section error card load a failed chunk again. One call, no loop. */
export const retryFailedLazyViews = (): void => {
  const resets = [...failedLazyViewResets];
  failedLazyViewResets.clear();
  for (const reset of resets) reset();
};

export interface LazyViewLoader<P> {
  Component: ComponentType<P>;
  prefetch: () => Promise<unknown>;
}

export const lazyView = <P,>(
  load: () => Promise<{ default: ComponentType<P> }>,
  wait?: (ms: number) => Promise<void>,
): LazyViewLoader<P> => {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const loadOnce = () => {
    if (!pending) {
      pending = retryImportOnce(load, wait).catch((error) => {
        // Let a later attempt (prefetch or Try Again) try again.
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  const loadForRender = () =>
    loadOnce().catch((error) => {
      failedLazyViewResets.add(reset);
      throw error;
    });

  let rendered: LazyExoticComponent<ComponentType<P>> = lazy(loadForRender);

  function reset() {
    failedLazyViewResets.delete(reset);
    rendered = lazy(loadForRender);
  }

  const Component = (props: P) => createElement(rendered, props);

  return {
    Component,
    prefetch: () => loadOnce().catch(() => undefined),
  };
};

/** Prefetches loaders one after another once the browser is idle. */
export const prefetchWhenIdle = (
  loaders: readonly (() => Promise<unknown>)[],
): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  let cancelled = false;
  const run = async () => {
    for (const load of loaders) {
      if (cancelled) return;
      await load();
    }
  };
  const idle = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  });
  if (typeof idle.requestIdleCallback === "function") {
    const id = idle.requestIdleCallback(() => void run(), { timeout: 4000 });
    return () => {
      cancelled = true;
      idle.cancelIdleCallback?.(id);
    };
  }
  const timer = window.setTimeout(() => void run(), 2500);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
};
