import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Tab views are lazy chunks. A chunk request that fails or stalls used to
 * leave the tab on the Suspense spinner with no way forward. Each loader
 * retries a failed import once, and light views are prefetched while the
 * browser is idle so a later tab switch does not wait on the network.
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

export interface LazyViewLoader<P> {
  Component: LazyExoticComponent<ComponentType<P>>;
  prefetch: () => Promise<unknown>;
}

export const lazyView = <P,>(
  load: () => Promise<{ default: ComponentType<P> }>,
): LazyViewLoader<P> => {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const loadOnce = () => {
    if (!pending) {
      pending = retryImportOnce(load).catch((error) => {
        // Let a later attempt (prefetch or render) try again.
        pending = null;
        throw error;
      });
    }
    return pending;
  };
  return {
    Component: lazy(loadOnce),
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
