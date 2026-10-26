/**
 * Toasts auto-dismiss after 4s, centrally. A newer toast restarts the timer
 * (no stale timer cuts it short), and no component schedules its own clear.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement, useState } from "react";
import { act, create } from "react-test-renderer";
import {
  NOTIFICATION_AUTO_DISMISS_MS,
  useNotificationAutoDismiss,
} from "./src/hooks/useNotificationAutoDismiss";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Notif = { message: string; type: "success" | "info" } | null;

// Manual fake clock.
let now = 0;
let nextId = 1;
const timers = new Map<number, { at: number; fn: () => void }>();
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
(globalThis as any).setTimeout = (fn: () => void, ms = 0) => {
  const id = nextId++;
  timers.set(id, { at: now + ms, fn });
  return id;
};
(globalThis as any).clearTimeout = (id: number) => void timers.delete(id);
const advance = (ms: number) => {
  const target = now + ms;
  for (;;) {
    const due = [...timers.entries()]
      .filter(([, t]) => t.at <= target)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    timers.delete(due[0]);
    now = due[1].at;
    act(() => due[1].fn());
  }
  now = target;
};

let current: Notif = null;
let setter: (n: Notif) => void = () => {};
function Harness() {
  const [notification, setNotification] = useState<Notif>(null);
  current = notification;
  setter = setNotification;
  useNotificationAutoDismiss(notification, setNotification);
  return null;
}

assert.equal(NOTIFICATION_AUTO_DISMISS_MS, 4000);
act(() => {
  create(createElement(Harness));
});

// "Order cancelled" toast clears after 4s.
act(() =>
  setter({
    message: "Order cancelled. You can start a new design when ready.",
    type: "info",
  }),
);
assert.equal(current?.message.startsWith("Order cancelled"), true);
advance(3999);
assert.notEqual(current, null, "still visible just before 4s");
advance(1);
assert.equal(current, null, "cleared at 4s");

// A newer toast restarts the timer; the first toast's timer must not cut it short.
act(() => setter({ message: "first", type: "info" }));
advance(3000);
act(() => setter({ message: "second", type: "success" }));
advance(1500); // 4.5s after "first"
assert.equal(current?.message, "second", "stale timer did not clear newer toast");
advance(2500);
assert.equal(current, null, "second cleared 4s after it appeared");
assert.equal(timers.size, 0, "no leftover timers");

// Source guard: no per-caller clear timers remain in src/.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
const offenders = walk("src").filter(
  (f) =>
    !f.endsWith("useNotificationAutoDismiss.ts") &&
    /setTimeout\(\s*\(\)\s*=>\s*\{?\s*setNotification\(null\)/.test(readFileSync(f, "utf8")),
);
assert.deepEqual(offenders, [], "callers must not schedule their own toast clear");

globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;
console.log("test_notification_auto_dismiss: PASS");
