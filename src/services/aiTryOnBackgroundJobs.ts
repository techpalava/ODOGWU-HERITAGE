import { useSyncExternalStore } from "react";
import type { AiTryOnPreviewOutcome } from "./aiTryOnGateway";
import type { AiTryOnStoredPreviewSummary } from "../utils/aiTryOnGatewayContract";

/**
 * Background AI Try-on generation (one in-flight request per wearer).
 *
 * The request runs here, outside any step component, so the customer can
 * move on to Summary and later steps while Gemini works (the app is a
 * single page; steps never reload it). React hosts read the jobs:
 * - the AI Try-on panel applies a settled job to its own state (preview,
 *   tries left) whenever it is mounted, even if that is later;
 * - Design Studio records the completion on the order workflow and shows
 *   the toast and status chip.
 *
 * A small marker per running job is kept in localStorage. If the page
 * reloads or closes mid-request, `resume` asks the server for that
 * wearer's stored preview instead of sending a new request, so a try is
 * never charged twice.
 *
 * Busy retries: when the server answers PROVIDER_BUSY (Gemini over
 * capacity, try held), the same request is sent again with the job id
 * after about 15, 30, 45, 60 and 60 s (±20%), until 4 minutes after the
 * start; then the job is given up (the server refunds the try once).
 */

export const AI_TRY_ON_PENDING_STORAGE_KEY = "odogwu_ai_try_on_pending_v1";
/** Longest a request can run on the server (130 s maxDuration) plus slack. */
export const AI_TRY_ON_RESUME_WINDOW_MS = 150_000;
export const AI_TRY_ON_RESUME_POLL_MS = 8_000;
/** Waits before each busy retry (Xavier: about 15/30/45/60/60 s). */
export const AI_TRY_ON_BUSY_RETRY_DELAYS_MS = [15_000, 30_000, 45_000, 60_000, 60_000] as const;
export const AI_TRY_ON_BUSY_RETRY_JITTER = 0.2;
/** No busy retry starts later than this after the first request. */
export const AI_TRY_ON_BUSY_GIVE_UP_MS = 240_000;
/** Server previews are kept 30 days; createdAt = expiresAt - 30 days. */
const PREVIEW_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Clock-skew allowance between this device and the server. */
const RESUME_CLOCK_SLACK_MS = 60_000;

export type AiTryOnBackgroundJobStatus = "running" | "completed" | "failed";

export interface AiTryOnBackgroundJob {
  readonly wearerId: string;
  /** Wearer's display name for multi-wearer toasts; null for one wearer. */
  readonly wearerName: string | null;
  readonly inputFingerprint: string;
  readonly scope: string;
  readonly startedAt: number;
  /** When the job settled; null while running. */
  readonly settledAt: number | null;
  readonly status: AiTryOnBackgroundJobStatus;
  /** Settled outcome (live request). A resumed job has none. */
  readonly outcome: AiTryOnPreviewOutcome | null;
  /** Completed jobs: the preview, for the toast thumbnail and the panel. */
  readonly preview: { mimeType: string; data: string } | null;
  readonly storedPreviewId: string | null;
  readonly modelId: string | null;
  /** Restored after a reload: the request was not watched to the end. */
  readonly resumed: boolean;
  /** The panel showed this wearer when the job settled (no toast needed). */
  readonly seenInline: boolean;
  /** The panel applied the outcome to its state. */
  readonly appliedByPanel: boolean;
  /** Design Studio recorded the outcome (workflow, toast). */
  readonly handledByHost: boolean;
  readonly toast: "none" | "open" | "closed";
  /** "View preview" asked the panel to scroll to and highlight this preview. */
  readonly focusRequested: boolean;
  /** Gemini was busy: the request is being retried (chip/panel wording). */
  readonly busy: boolean;
}

/**
 * Reload marker. Holds no photo, name or design detail: only opaque ids,
 * the design fingerprint and the start time.
 */
export interface AiTryOnPendingMarker {
  wearerId: string;
  inputFingerprint: string;
  scope: string;
  startedAt: number;
  /** Busy retries: the held job, so a reload can give it up (refund). */
  busyJobId?: string;
  /** Start of the latest request (busy retries); defaults to startedAt. */
  requestAt?: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Jobs = Readonly<Record<string, AiTryOnBackgroundJob>>;

const defaultOnPageLeave = (listener: (leaving: boolean) => void) => {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  window.addEventListener("beforeunload", () => {
    listener(true);
    // Another handler may cancel the reload; then this page carries on.
    setTimeout(() => listener(false), 3000);
  });
  window.addEventListener("pagehide", () => listener(true));
  // Back/forward cache: the same page is shown again.
  window.addEventListener("pageshow", () => listener(false));
};

const isSettled = (outcome: AiTryOnPreviewOutcome) => outcome.kind === "completed";

export const createAiTryOnBackgroundJobs = ({
  storage = typeof window !== "undefined" ? window.localStorage : null,
  now = Date.now,
  setTimer = (fn: () => void, ms: number) => setTimeout(fn, ms),
  onPageLeave = defaultOnPageLeave,
  random = Math.random,
}: {
  storage?: StorageLike | null;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** Calls back with true when the page is being left, false if it comes back. */
  onPageLeave?: (listener: (leaving: boolean) => void) => void;
  random?: () => number;
} = {}) => {
  let jobs: Jobs = {};
  // A reload or close aborts the request in the old page, which reports it
  // as a failure. Ignore that, so the marker survives for the next page.
  let leaving = false;
  onPageLeave((next) => {
    leaving = next;
  });
  let visibleWearerId: string | null = null;
  const listeners = new Set<() => void>();
  const resuming = new Set<string>();

  const emit = () => listeners.forEach((listener) => listener());
  const update = (wearerId: string, patch: Partial<AiTryOnBackgroundJob>) => {
    const current = jobs[wearerId];
    if (!current) return;
    jobs = { ...jobs, [wearerId]: { ...current, ...patch } };
    emit();
  };

  const readMarkers = (): AiTryOnPendingMarker[] => {
    try {
      const parsed = JSON.parse(storage?.getItem(AI_TRY_ON_PENDING_STORAGE_KEY) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter(
            (entry): entry is AiTryOnPendingMarker =>
              entry &&
              typeof entry.wearerId === "string" &&
              typeof entry.inputFingerprint === "string" &&
              typeof entry.scope === "string" &&
              typeof entry.startedAt === "number" &&
              (entry.busyJobId === undefined || typeof entry.busyJobId === "string") &&
              (entry.requestAt === undefined || typeof entry.requestAt === "number"),
          )
        : [];
    } catch {
      return [];
    }
  };
  const writeMarkers = (markers: AiTryOnPendingMarker[]) => {
    try {
      if (markers.length) storage?.setItem(AI_TRY_ON_PENDING_STORAGE_KEY, JSON.stringify(markers));
      else storage?.removeItem(AI_TRY_ON_PENDING_STORAGE_KEY);
    } catch {
      // Private mode or full storage: only reload recovery is lost.
    }
  };
  const addMarker = (marker: AiTryOnPendingMarker) =>
    writeMarkers([
      ...readMarkers().filter(
        (entry) => !(entry.scope === marker.scope && entry.wearerId === marker.wearerId),
      ),
      marker,
    ]);
  const patchMarker = (scope: string, wearerId: string, patch: Partial<AiTryOnPendingMarker>) =>
    writeMarkers(
      readMarkers().map((entry) =>
        entry.scope === scope && entry.wearerId === wearerId ? { ...entry, ...patch } : entry,
      ),
    );
  const sleep = (ms: number) => new Promise<void>((resolve) => void setTimer(resolve, ms));
  const removeMarker = (scope: string, wearerId: string) =>
    writeMarkers(
      readMarkers().filter((entry) => !(entry.scope === scope && entry.wearerId === wearerId)),
    );

  const settle = (wearerId: string, patch: Partial<AiTryOnBackgroundJob>) => {
    const job = jobs[wearerId];
    if (!job || leaving) return;
    removeMarker(job.scope, wearerId);
    const seenInline = visibleWearerId === wearerId;
    update(wearerId, { ...patch, settledAt: now(), seenInline, toast: seenInline ? "none" : "open" });
  };

  const api = {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): Jobs => jobs,

    isRunning: (wearerId: string) => jobs[wearerId]?.status === "running",

    /**
     * Starts one request for a wearer. Returns false (and sends nothing)
     * while that wearer already has one running.
     */
    start({
      wearerId,
      wearerName,
      inputFingerprint,
      scope,
      modelId = null,
      run,
      giveUpBusy = async () => undefined,
    }: {
      wearerId: string;
      wearerName: string | null;
      inputFingerprint: string;
      scope: string;
      modelId?: string | null;
      /** One request; `busyJobId` is set on a busy retry. */
      run: (busyJobId: string | null) => Promise<AiTryOnPreviewOutcome>;
      /** Tells the server the busy retries are over (refund the held try). */
      giveUpBusy?: (jobId: string) => Promise<unknown>;
    }): boolean {
      if (api.isRunning(wearerId)) return false;
      const startedAt = now();
      jobs = {
        ...jobs,
        [wearerId]: {
          wearerId,
          wearerName,
          inputFingerprint,
          scope,
          startedAt,
          settledAt: null,
          status: "running",
          outcome: null,
          preview: null,
          storedPreviewId: null,
          modelId,
          resumed: false,
          seenInline: false,
          appliedByPanel: false,
          handledByHost: false,
          toast: "none",
          focusRequested: false,
          busy: false,
        },
      };
      addMarker({ wearerId, inputFingerprint, scope, startedAt });
      emit();
      const alive = () => jobs[wearerId]?.startedAt === startedAt && !leaving;
      const request = (busyJobId: string | null) =>
        run(busyJobId).catch((): AiTryOnPreviewOutcome => ({ kind: "failed", orderTriesRemaining: null }));
      const loop = async (): Promise<AiTryOnPreviewOutcome | null> => {
        let busyJobId: string | null = null;
        let retries = 0;
        for (;;) {
          const outcome = await request(busyJobId);
          if (!alive()) return null;
          const busyAgain =
            outcome.kind === "busy" || (busyJobId !== null && outcome.kind === "rate_limited");
          if (!busyAgain) return outcome;
          if (outcome.kind === "busy") busyJobId = outcome.jobId;
          if (!jobs[wearerId]?.busy) update(wearerId, { busy: true });
          patchMarker(scope, wearerId, { busyJobId: busyJobId! });
          const base = AI_TRY_ON_BUSY_RETRY_DELAYS_MS[retries];
          const delay =
            base === undefined
              ? Infinity
              : Math.round(base * (1 - AI_TRY_ON_BUSY_RETRY_JITTER + random() * 2 * AI_TRY_ON_BUSY_RETRY_JITTER));
          if (now() + delay - startedAt > AI_TRY_ON_BUSY_GIVE_UP_MS) {
            void giveUpBusy(busyJobId!).catch(() => undefined);
            return { kind: "busy_failed", orderTriesRemaining: null };
          }
          await sleep(delay);
          if (!alive()) return null;
          retries += 1;
          patchMarker(scope, wearerId, { requestAt: now() });
        }
      };
      void loop()
        .catch((): AiTryOnPreviewOutcome => ({ kind: "failed", orderTriesRemaining: null }))
        .then((outcome) => {
          if (!outcome || jobs[wearerId]?.startedAt !== startedAt) return;
          settle(wearerId, {
            status: isSettled(outcome) ? "completed" : "failed",
            outcome,
            preview: outcome.kind === "completed" ? outcome.preview : null,
            storedPreviewId: outcome.kind === "completed" ? outcome.storedPreviewId ?? null : null,
          });
        });
      return true;
    },

    /**
     * After a reload: for each marker of this scope, look for the wearer's
     * stored preview on the server (made after the request started) until
     * the request must have ended. Never sends a new request.
     */
    resume({
      scope,
      listStoredPreviews,
      loadStoredPreview,
      giveUpBusy = async () => false,
    }: {
      scope: string;
      listStoredPreviews: () => Promise<readonly AiTryOnStoredPreviewSummary[] | null>;
      loadStoredPreview: (previewId: string) => Promise<{ mimeType: string; data: string } | null>;
      /** Busy job left by the old page: refund its held try. True when refunded. */
      giveUpBusy?: (wearerId: string, jobId: string) => Promise<boolean>;
    }) {
      const markers = readMarkers();
      // Drop markers far past any possible end (and other scopes' stale ones).
      writeMarkers(markers.filter((marker) => now() - marker.startedAt < AI_TRY_ON_RESUME_WINDOW_MS * 4));
      for (const marker of markers) {
        if (marker.scope !== scope || jobs[marker.wearerId] || resuming.has(marker.wearerId)) continue;
        if (now() - marker.startedAt >= AI_TRY_ON_RESUME_WINDOW_MS * 4) continue;
        resuming.add(marker.wearerId);
        jobs = {
          ...jobs,
          [marker.wearerId]: {
            wearerId: marker.wearerId,
            wearerName: null,
            inputFingerprint: marker.inputFingerprint,
            scope: marker.scope,
            startedAt: marker.startedAt,
            settledAt: null,
            status: "running",
            outcome: null,
            preview: null,
            storedPreviewId: null,
            modelId: null,
            resumed: true,
            seenInline: false,
            appliedByPanel: false,
            handledByHost: false,
            toast: "none",
            focusRequested: false,
            busy: Boolean(marker.busyJobId),
          },
        };
        emit();
        // The photo is not kept across a reload, so busy retries cannot go
        // on: wait for a request that may still be running, then give up.
        const lastRequestAt = marker.requestAt ?? marker.startedAt;
        const poll = async () => {
          // Discarded (e.g. the order was placed or cleared) while waiting.
          if (jobs[marker.wearerId]?.startedAt !== marker.startedAt) {
            resuming.delete(marker.wearerId);
            return;
          }
          const summaries = await listStoredPreviews().catch(() => null);
          const found = summaries?.find(
            (summary) =>
              summary.wearerKey === marker.wearerId &&
              summary.inputFingerprint === marker.inputFingerprint &&
              Date.parse(summary.expiresAt) - PREVIEW_RETENTION_MS >= marker.startedAt - RESUME_CLOCK_SLACK_MS,
          );
          if (found) {
            const image = await loadStoredPreview(found.previewId).catch(() => null);
            if (jobs[marker.wearerId]?.startedAt !== marker.startedAt) {
              resuming.delete(marker.wearerId);
              return;
            }
            if (image) {
              resuming.delete(marker.wearerId);
              settle(marker.wearerId, {
                status: "completed",
                preview: image,
                storedPreviewId: found.previewId,
                modelId: found.modelId ?? null,
              });
              return;
            }
          }
          if (now() - lastRequestAt >= AI_TRY_ON_RESUME_WINDOW_MS) {
            const refunded = marker.busyJobId
              ? await giveUpBusy(marker.wearerId, marker.busyJobId).catch(() => false)
              : false;
            resuming.delete(marker.wearerId);
            if (jobs[marker.wearerId]?.startedAt !== marker.startedAt) return;
            settle(marker.wearerId, {
              status: "failed",
              ...(refunded ? { outcome: { kind: "busy_failed", orderTriesRemaining: null } as const } : {}),
            });
            return;
          }
          setTimer(() => void poll(), AI_TRY_ON_RESUME_POLL_MS);
        };
        void poll();
      }
    },

    /** The wearer the panel is showing now (null when it is not mounted). */
    setVisibleWearer(wearerId: string | null) {
      visibleWearerId = wearerId;
    },
    markAppliedByPanel: (wearerId: string) => update(wearerId, { appliedByPanel: true }),
    markHandledByHost: (wearerId: string) => update(wearerId, { handledByHost: true }),
    closeToast: (wearerId: string) => update(wearerId, { toast: "closed" }),
    requestFocus: (wearerId: string) => update(wearerId, { toast: "closed", focusRequested: true }),
    clearFocus: (wearerId: string) => update(wearerId, { focusRequested: false }),
    /** Removes a settled job (e.g. "Try again" or a new order). */
    forget(wearerId: string) {
      const job = jobs[wearerId];
      if (!job || job.status === "running") return;
      const next = { ...jobs };
      delete next[wearerId];
      jobs = next;
      emit();
    },
    /**
     * The order was placed or cleared: drop every job and marker. A request
     * still running ends silently (its result is ignored; the server
     * removes a preview saved after its session closed).
     */
    discardAll() {
      jobs = {};
      resuming.clear();
      writeMarkers([]);
      emit();
    },
    /** Test helper. */
    reset() {
      jobs = {};
      visibleWearerId = null;
      resuming.clear();
      emit();
    },
  };
  return api;
};

export type AiTryOnBackgroundJobs = ReturnType<typeof createAiTryOnBackgroundJobs>;

export const aiTryOnBackgroundJobs = createAiTryOnBackgroundJobs();

export const useAiTryOnBackgroundJobs = (store: AiTryOnBackgroundJobs = aiTryOnBackgroundJobs): Jobs =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
