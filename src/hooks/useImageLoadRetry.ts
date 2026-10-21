import { useCallback, useEffect, useRef, useState } from "react";
import type { OptimizedImageSources } from "../utils/optimizedImageUrl";
import { reportClientImageError } from "../utils/clientImageErrorReport";
import type { ClientImageErrorSurface } from "../utils/clientImageErrorSchema";

/**
 * Remote catalogue images (Firebase Storage) can fail on slow, flaky or
 * filtered connections. The hook:
 *
 * 1. tries the resized `/_vercel/image` URL first when one is given, and on
 *    an error falls back straight away to the original URL;
 * 2. when the original also fails, waits and retries with growing gaps
 *    (1 s, 2 s, 4 s, 8 s; capped), each retry starting again from the resized
 *    URL, with a query marker on the original so the browser asks again;
 * 3. after the last retry reports `failed` (callers show the colour block plus
 *    a "Tap to reload photo" button wired to `retry`);
 * 4. starts again with a fresh retry budget when the browser fires `online`
 *    or the customer taps reload.
 *
 * Optional `report` sends a sampled first-failure event and one final-failure
 * event per image per session to `/api/client-image-error`.
 */
export const IMAGE_RETRY_DELAY_MS = 1000;
export const IMAGE_RETRY_MAX_DELAY_MS = 8000;
export const IMAGE_MAX_RETRIES = 4;

/** Exponential schedule: base, 2×base, 4×base … capped at `capMs`. */
export const buildImageRetryDelays = (
  baseMs: number = IMAGE_RETRY_DELAY_MS,
  retries: number = IMAGE_MAX_RETRIES,
  capMs: number = IMAGE_RETRY_MAX_DELAY_MS,
): number[] =>
  Array.from({ length: Math.max(0, retries) }, (_, index) =>
    Math.min(capMs, baseMs * 2 ** index),
  );

/** Default schedule: 1 s, 2 s, 4 s, 8 s. */
export const IMAGE_RETRY_DELAYS_MS: readonly number[] = buildImageRetryDelays();

let defaultDelaysOverride: readonly number[] | null = null;

/** Test hook: shorten the default schedule (pass null to restore it). */
export const setDefaultImageRetryDelaysForTests = (
  delays: readonly number[] | null,
): void => {
  defaultDelaysOverride = delays;
};

export const withImageRetryMarker = (url: string, attempt: number): string => {
  if (attempt <= 0 || !/^https?:\/\//i.test(url)) return url;
  const hashIndex = url.indexOf("#");
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  return `${base}${base.includes("?") ? "&" : "?"}imgRetry=${attempt}${hash}`;
};

export type ImageLoadSource = "optimized" | "original";

export interface ImageLoadRetryOptions {
  /** Gaps before each retry of the original URL. Defaults to IMAGE_RETRY_DELAYS_MS. */
  retryDelaysMs?: readonly number[];
  /** Resized URLs to try before the original (null/undefined: original only). */
  optimized?: OptimizedImageSources | null;
  /** When set, failures are reported to `/api/client-image-error`. */
  report?: { surface: ClientImageErrorSurface; fabricCode: string } | null;
}

export interface ImageLoadRetryState {
  /** URL to render, or "" when there is no image. */
  src: string;
  /** `srcSet` for the resized source; undefined for the original URL. */
  srcSet?: string;
  sizes?: string;
  /** True once every attempt failed; render the fallback. */
  failed: boolean;
  onError: () => void;
  /** Start again with a fresh retry budget ("Tap to reload photo"). */
  retry: () => void;
  /** Changes on every attempt; use as the <img> `key` so each attempt is a fresh request. */
  imageKey: string;
  /** Which URL `src` points at. */
  source: ImageLoadSource;
  /** Failed loads so far for this image. */
  attempts: number;
  /** True while waiting for the next automatic retry. */
  retryPending: boolean;
}

interface RetryState {
  generation: number;
  retriesUsed: number;
  source: ImageLoadSource;
  failed: boolean;
  errors: number;
  retryPending: boolean;
}

const initialState = (hasOptimized: boolean): RetryState => ({
  generation: 0,
  retriesUsed: 0,
  source: hasOptimized ? "optimized" : "original",
  failed: false,
  errors: 0,
  retryPending: false,
});

type OnlineTarget = {
  addEventListener: (type: "online", listener: () => void) => void;
  removeEventListener: (type: "online", listener: () => void) => void;
};

const getOnlineTarget = (): OnlineTarget | null => {
  if (typeof window === "undefined") return null;
  const target = window as unknown as Partial<OnlineTarget>;
  return typeof target.addEventListener === "function" &&
    typeof target.removeEventListener === "function"
    ? (target as OnlineTarget)
    : null;
};

const normalizeOptions = (
  value: number | ImageLoadRetryOptions | undefined,
): ImageLoadRetryOptions =>
  typeof value === "number"
    ? { retryDelaysMs: buildImageRetryDelays(value, IMAGE_MAX_RETRIES, value * 8) }
    : value ?? {};

export const useImageLoadRetry = (
  imageUrl: string | null | undefined,
  retryDelaysOrOptions?: number | ImageLoadRetryOptions,
): ImageLoadRetryState => {
  const options = normalizeOptions(retryDelaysOrOptions);
  const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const optimized = url && options.optimized?.src ? options.optimized : null;
  const hasOptimized = Boolean(optimized);
  const delays = options.retryDelaysMs ?? defaultDelaysOverride ?? IMAGE_RETRY_DELAYS_MS;
  const delaysKey = delays.join(",");
  const resetKey = `${url}|${optimized?.src ?? ""}`;

  const [state, setState] = useState<RetryState>(() => initialState(hasOptimized));
  const [stateKey, setStateKey] = useState(resetKey);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledAttemptRef = useRef<string | null>(null);

  // Reset synchronously during render when the image changes, so a new URL
  // never inherits the old one's failed state for a frame.
  let current = state;
  if (stateKey !== resetKey) {
    current = initialState(hasOptimized);
    setStateKey(resetKey);
    setState(current);
  }
  const stateRef = useRef(current);
  stateRef.current = current;
  const reportRef = useRef(options.report);
  reportRef.current = options.report;
  const optimizedSrcRef = useRef(optimized?.src ?? "");
  optimizedSrcRef.current = optimized?.src ?? "";

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    handledAttemptRef.current = null;
    return clearTimer;
  }, [resetKey]);

  const sendReport = useCallback(
    (kind: "first" | "final", failedSource: ImageLoadSource, attempts: number) => {
      const report = reportRef.current;
      if (!report || !url) return;
      reportClientImageError({
        kind,
        fabricCode: report.fabricCode,
        imageUrl:
          failedSource === "optimized" && optimizedSrcRef.current
            ? optimizedSrcRef.current
            : url,
        attempts,
        surface: report.surface,
        source: failedSource,
      });
    },
    [url],
  );

  const restart = useCallback(() => {
    clearTimer();
    handledAttemptRef.current = null;
    setState((prev) => ({
      ...prev,
      generation: prev.generation + 1,
      retriesUsed: 0,
      source: hasOptimized ? "optimized" : "original",
      failed: false,
      retryPending: false,
    }));
  }, [hasOptimized]);

  const onError = useCallback(() => {
    const snapshot = stateRef.current;
    if (!url || snapshot.failed) return;
    const attemptKey = `${snapshot.generation}:${snapshot.source}`;
    // One error per attempt: ignore duplicate events for the same request.
    if (handledAttemptRef.current === attemptKey) return;
    handledAttemptRef.current = attemptKey;
    const errors = snapshot.errors + 1;
    if (errors === 1) sendReport("first", snapshot.source, errors);

    if (snapshot.source === "optimized") {
      // Resized URL failed: try the original right away.
      setState((prev) => ({ ...prev, source: "original", errors }));
      return;
    }
    if (snapshot.retriesUsed >= delays.length) {
      clearTimer();
      setState((prev) => ({ ...prev, failed: true, errors, retryPending: false }));
      sendReport("final", snapshot.source, errors);
      return;
    }
    const delay = delays[snapshot.retriesUsed]!;
    setState((prev) => ({ ...prev, errors, retryPending: true }));
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setState((prev) => ({
        ...prev,
        generation: prev.generation + 1,
        retriesUsed: prev.retriesUsed + 1,
        source: hasOptimized ? "optimized" : "original",
        retryPending: false,
      }));
    }, delay);
    // `delaysKey` (not the array) keeps the callback stable for an equal schedule.
  }, [url, delaysKey, hasOptimized, sendReport]);

  // Connection back: retry a failed or waiting image now, with a fresh budget.
  useEffect(() => {
    if (!url) return undefined;
    const target = getOnlineTarget();
    if (!target) return undefined;
    const handleOnline = () => {
      const snapshot = stateRef.current;
      if (snapshot.failed || snapshot.retryPending) restart();
    };
    target.addEventListener("online", handleOnline);
    return () => target.removeEventListener("online", handleOnline);
  }, [url, restart]);

  const retry = useCallback(() => {
    if (url) restart();
  }, [url, restart]);

  const useOptimized = current.source === "optimized" && optimized;
  return {
    src: !url
      ? ""
      : useOptimized
        ? optimized!.src
        : withImageRetryMarker(url, current.generation),
    srcSet: useOptimized ? optimized!.srcSet : undefined,
    sizes: useOptimized ? optimized!.sizes : undefined,
    failed: !url || current.failed,
    onError,
    retry,
    imageKey: `${current.generation}:${current.source}`,
    source: current.source,
    attempts: current.errors,
    retryPending: current.retryPending,
  };
};
