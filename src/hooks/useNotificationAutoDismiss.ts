import { useEffect } from "react";

export const NOTIFICATION_AUTO_DISMISS_MS = 4000;

/**
 * Clears the global toast a fixed time after it appears. Callers only call
 * setNotification({...}); they must not schedule their own clear. Before this,
 * many callers (e.g. the Design Studio "Order cancelled" handler) never cleared
 * the toast, so it stayed on screen, and the callers that did used unkeyed
 * timers that could cut a newer toast short. Keying on the notification object
 * restarts the timer for every new toast and cancels the stale one.
 */
export function useNotificationAutoDismiss<T>(
  notification: T | null,
  setNotification: (next: null) => void,
  delayMs: number = NOTIFICATION_AUTO_DISMISS_MS,
) {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), delayMs);
    return () => clearTimeout(timer);
  }, [notification, setNotification, delayMs]);
}
