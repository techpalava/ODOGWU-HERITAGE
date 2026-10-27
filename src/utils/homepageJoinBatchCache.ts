import type { Batch } from "../types";
import { isCommunityBatchClosedForOrders } from "./communityBatchOrderClosure";
import {
  formatHomepageBatchDeadline,
  getHomepageJoinBatchDeadline,
  getHomepageJoinBatchDeadlineLabelFor,
  getHomepageJoinBatchDeadlineText,
  type HomepageJoinBatchDeadline,
} from "./homepageOrderGateway";

/**
 * Last homepage Join card outcome, kept in localStorage so a returning visitor
 * sees the Join card at once instead of a placeholder while Firestore's first
 * batches snapshot is in flight (about 1-2 s). Display only: the Join click
 * stays blocked until the live snapshot confirms the batch (hasLoadedBatches),
 * and the live handler re-validates it as before.
 *
 * Only public fields are stored: id, name and the ordering deadline of an
 * open community batch, or a "none" marker when the last live snapshot had no
 * open batch. `endDate` is the customer-facing deadline (the "Open until"
 * date for a batch kept open past its end date, "" when ongoing) and
 * `deadlineKind` marks those two keep-open cases; older entries omit it.
 */
export const HOMEPAGE_JOIN_BATCH_CACHE_KEY = "odg.homepageJoinBatch.v1";

export interface HomepageCachedJoinBatch {
  id: string;
  name: string;
  endDate: string;
  deadlineKind?: "open_until" | "ongoing";
}

export type HomepageJoinBatchCacheEntry =
  | { kind: "batch"; batch: HomepageCachedJoinBatch }
  | { kind: "none" };

export interface HomepageProvisionalJoinBatchView {
  id: string;
  name: string;
  text: string;
  deadlinePill: string | null;
  deadlineLabel: string | null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const MAX_ID = 200;
const MAX_NAME = 120;
const MAX_END_DATE = 64;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
};

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;

const parseEntry = (raw: string): HomepageJoinBatchCacheEntry | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Record<string, unknown>;
  if (value.v !== 1) return null;
  if (value.kind === "none") return { kind: "none" };
  if (value.kind !== "batch") return null;
  const { id, name, endDate, deadlineKind } = value;
  if (
    !isBoundedString(id, MAX_ID) ||
    !id.trim() ||
    !isBoundedString(name, MAX_NAME) ||
    !name.trim() ||
    !isBoundedString(endDate, MAX_END_DATE) ||
    (deadlineKind !== undefined &&
      deadlineKind !== "open_until" &&
      deadlineKind !== "ongoing")
  ) {
    return null;
  }
  return {
    kind: "batch",
    batch: {
      id,
      name: name.trim(),
      endDate,
      ...(deadlineKind === "open_until" || deadlineKind === "ongoing"
        ? { deadlineKind }
        : {}),
    },
  };
};

/** Reads the cache; a corrupt or unreadable entry is removed and ignored. */
export function readHomepageJoinBatchCache(
  storage: StorageLike | null = defaultStorage(),
): HomepageJoinBatchCacheEntry | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(HOMEPAGE_JOIN_BATCH_CACHE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const entry = parseEntry(raw);
  if (!entry) {
    try {
      storage.removeItem(HOMEPAGE_JOIN_BATCH_CACHE_KEY);
    } catch {
      // Storage unavailable: nothing else to clean up.
    }
  }
  return entry;
}

/**
 * Records the live outcome after the batches snapshot: the open Join batch,
 * or "none" when there is no batch or it is closed for orders.
 */
export function writeHomepageJoinBatchCache(
  liveJoinBatch: Batch | null | undefined,
  storage: StorageLike | null = defaultStorage(),
  now: Date = new Date(),
): HomepageJoinBatchCacheEntry {
  const open =
    liveJoinBatch &&
    typeof liveJoinBatch.id === "string" &&
    liveJoinBatch.id.trim() &&
    typeof liveJoinBatch.name === "string" &&
    liveJoinBatch.name.trim() &&
    !isCommunityBatchClosedForOrders(liveJoinBatch, now);
  const deadline = open ? getHomepageJoinBatchDeadline(liveJoinBatch, now) : null;
  const entry: HomepageJoinBatchCacheEntry = open && deadline
    ? {
        kind: "batch",
        batch: {
          id: liveJoinBatch.id.slice(0, MAX_ID),
          name: liveJoinBatch.name.trim().slice(0, MAX_NAME),
          endDate:
            deadline.kind === "closes" || deadline.kind === "open_until"
              ? deadline.date.slice(0, MAX_END_DATE)
              : deadline.kind === "none" &&
                  typeof liveJoinBatch.endDate === "string"
                ? liveJoinBatch.endDate.slice(0, MAX_END_DATE)
                : "",
          ...(deadline.kind === "open_until" || deadline.kind === "ongoing"
            ? { deadlineKind: deadline.kind }
            : {}),
        },
      }
    : { kind: "none" };
  if (storage) {
    try {
      storage.setItem(
        HOMEPAGE_JOIN_BATCH_CACHE_KEY,
        JSON.stringify(
          entry.kind === "batch"
            ? { v: 1, kind: "batch", ...entry.batch }
            : { v: 1, kind: "none" },
        ),
      );
    } catch {
      // Quota or privacy mode: the homepage simply shows the placeholder.
    }
  }
  return entry;
}

/** Last moment orders are accepted for a cached endDate, or null if unreadable. */
const cachedDeadlineEnd = (endDate: string): number | null => {
  const trimmed = endDate.trim();
  if (!trimmed) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const time = dateOnly
    ? Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
        23,
        59,
        59,
        999,
      )
    : new Date(trimmed).getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Join card content from a cached batch while the live snapshot loads, or null
 * when the cached deadline has already passed (the placeholder is shown then).
 */
export function getHomepageProvisionalJoinBatchView(
  cached: HomepageCachedJoinBatch | null | undefined,
  now: Date = new Date(),
): HomepageProvisionalJoinBatchView | null {
  if (!cached) return null;
  const ongoing = cached.deadlineKind === "ongoing";
  const end = ongoing ? null : cachedDeadlineEnd(cached.endDate);
  if (end !== null && end < now.getTime()) return null;
  const deadline: HomepageJoinBatchDeadline = ongoing
    ? { kind: "ongoing" }
    : end === null
      ? { kind: "none" }
      : cached.deadlineKind === "open_until"
        ? { kind: "open_until", date: cached.endDate }
        : { kind: "closes", date: cached.endDate };
  return {
    id: cached.id,
    name: cached.name,
    text: getHomepageJoinBatchDeadlineText(
      deadline.kind === "none" ? { kind: "closes", date: cached.endDate } : deadline,
    ),
    deadlinePill:
      end === null ? null : formatHomepageBatchDeadline(cached.endDate, "short"),
    deadlineLabel: getHomepageJoinBatchDeadlineLabelFor(deadline),
  };
}
