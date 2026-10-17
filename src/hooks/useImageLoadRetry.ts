import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Remote catalogue images (Firebase Storage) can time out on slow or busy
 * connections. Retry a failed image once after a short pause, with a query
 * marker so the browser makes a fresh request, before showing a fallback.
 */
export const IMAGE_RETRY_DELAY_MS = 1500;
export const IMAGE_MAX_RETRIES = 1;

export const withImageRetryMarker = (url: string, attempt: number): string => {
  if (attempt <= 0 || !/^https?:\/\//i.test(url)) return url;
  const hashIndex = url.indexOf("#");
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  return `${base}${base.includes("?") ? "&" : "?"}imgRetry=${attempt}${hash}`;
};

export interface ImageLoadRetryState {
  /** URL to render, or "" when there is no image. */
  src: string;
  /** True once every attempt failed; render the fallback. */
  failed: boolean;
  onError: () => void;
}

export const useImageLoadRetry = (
  imageUrl: string | null | undefined,
  retryDelayMs: number = IMAGE_RETRY_DELAY_MS,
): ImageLoadRetryState => {
  const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [url]);

  const onError = useCallback(() => {
    if (attempt >= IMAGE_MAX_RETRIES) {
      setFailed(true);
      return;
    }
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setAttempt((current) => current + 1);
    }, retryDelayMs);
  }, [attempt, retryDelayMs]);

  return {
    src: url ? withImageRetryMarker(url, attempt) : "",
    failed: !url || failed,
    onError,
  };
};
