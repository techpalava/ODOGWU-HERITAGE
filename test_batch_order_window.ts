import assert from "node:assert/strict";
import type { Batch } from "./src/types";
import { BatchBusinessRules } from "./src/engine/BatchBusinessRules";
import { getBatchDateWindow } from "./src/utils/batchDateRange";
import {
  batchOrderWindowContextFields,
  getBatchOrderWindow,
} from "./src/utils/batchOrderWindow";
import {
  getCurrentRegistrationBatch,
  getHomepageClosedCurrentBatch,
  getNextOpenCommunityBatch,
  getNextUpcomingBatches,
  processDynamicBatches,
} from "./src/utils/batchUtils";
import {
  communityBatchFromRecord,
  isCommunityBatchClosedForOrders,
} from "./src/utils/communityBatchOrderClosure";
import { resolveCommunityOrderClosure } from "./src/server/communityBatchOrderGate";
import {
  getHomepageJoinBatchDeadlineLabel,
  getHomepageJoinBatchDescription,
  getHomepageOrderGatewayState,
  resolveHomepageCommunityBatchEntry,
} from "./src/utils/homepageOrderGateway";
import {
  getHomepageProvisionalJoinBatchView,
  readHomepageJoinBatchCache,
  writeHomepageJoinBatchCache,
} from "./src/utils/homepageJoinBatchCache";
import { getAdminBatchOrderState } from "./src/utils/adminBatchOrderState";
import { resolveFooterBatchLink } from "./src/utils/footerBatchLink";
import { resolveHomepageJoinSlot } from "./src/components/HomepageOrderGateway";

// 2026-10-26 12:00 WAT, the day Avatars showed "This batch is closed".
const NOW = new Date("2026-10-26T12:00:00.000+01:00");

// Firestore batches as read on 2026-10-26 (relevant fields only).
const record = (overrides: Record<string, unknown>) => ({
  pickupLocation: "ASML Veldhoven Campus",
  visibility: "PUBLIC",
  currentOrders: 0,
  currentCustomers: 0,
  currentGarments: 0,
  ...overrides,
});
const firestoreBatches = (avatarsOverrides: Record<string, unknown> = {}) => [
  record({ id: "batch-5", batchNumber: 5, name: "Gladiators", startDate: "2026-05-18", endDate: "2026-07-06", status: "COMPLETED", isAutoScheduled: false, isActive: false, targetGarments: 40 }),
  record({ id: "batch-6", batchNumber: 6, name: "Avatars", startDate: "2026-07-06", endDate: "2026-09-30", status: "OPEN", isAutoScheduled: false, isActive: true, allowOrders: true, targetGarments: 72, currentGarments: 26, ...avatarsOverrides }),
  record({ id: "batch-7", batchNumber: 7, name: "Power Rangers", startDate: "2026-09-07", endDate: "2026-10-12", status: "YET_TO_START", isAutoScheduled: false, isActive: false, targetGarments: 104 }),
  record({ id: "batch-8", batchNumber: 8, name: "Musketeers", startDate: "2026-10-12", endDate: "2026-11-16", status: "YET_TO_START", isAutoScheduled: false, isActive: false, targetGarments: 136 }),
  record({ id: "batch-9", batchNumber: 9, name: "Governors", startDate: "2026-11-16", endDate: "2026-12-21", status: "Yet To Start", targetGarments: 168 }),
  record({ id: "batch-10", batchNumber: 10, name: "Jesus Lovers", startDate: "2026-12-21", endDate: "2027-01-25", status: "Yet To Start", targetGarments: 232 }),
] as unknown as Batch[];

// --- Root cause: every reader agrees on Avatars ------------------------------
{
  const batches = firestoreBatches();
  const avatars = batches.find((b) => b.id === "batch-6")!;
  assert.equal(isCommunityBatchClosedForOrders(avatars, NOW), true, "Studio: closed");
  assert.equal(
    BatchBusinessRules.canAcceptOrders(avatars, NOW).canAcceptOrders,
    false,
    "BatchBusinessRules no longer reopens MANUAL + OPEN past its end date",
  );
  assert.equal(BatchBusinessRules.canAcceptOrders(avatars, NOW).statusCode, "EXPIRED");
  assert.equal(
    getCurrentRegistrationBatch(batches, NOW),
    undefined,
    "Homepage/footer no longer send customers into a batch the Studio calls closed",
  );
  assert.equal(getHomepageOrderGatewayState(batches, NOW).joinBatch, null);
  assert.deepEqual(
    resolveFooterBatchLink({ hasLoadedBatches: true, joinBatch: getCurrentRegistrationBatch(batches, NOW) }).target,
    { kind: "home-order-gateway" },
  );
  assert.equal(
    resolveHomepageCommunityBatchEntry(batches, "batch-6", "Eindhoven", NOW),
    null,
  );
}

// --- With the keep-open toggle every reader says open -----------------------
{
  const batches = firestoreBatches({ keepOpenAfterEndDate: true });
  const avatars = batches.find((b) => b.id === "batch-6")!;
  const window = getBatchOrderWindow(avatars, NOW);
  assert.equal(window.open, true);
  assert.equal(window.ongoing, true);
  assert.equal(window.effectiveCloseDate, null);
  assert.equal(isCommunityBatchClosedForOrders(avatars, NOW), false);
  assert.equal(getCurrentRegistrationBatch(batches, NOW)?.id, "batch-6");
  const entry = resolveHomepageCommunityBatchEntry(batches, "batch-6", "Eindhoven", NOW);
  assert.equal(entry?.batch.id, "batch-6");
  assert.equal(entry?.orderContext.keepOpenAfterEndDate, true);
  assert.equal(
    BatchBusinessRules.canAcceptOrders(entry!.orderContext, NOW).canAcceptOrders,
    true,
    "An OrderContext built from the live batch carries the toggle",
  );
  assert.equal(getHomepageJoinBatchDeadlineLabel(avatars, NOW), "Open \u00b7 ongoing");
  assert.equal(
    getHomepageJoinBatchDescription(avatars, NOW).text,
    "Join the currently open community batch. Ordering is ongoing.",
  );
  assert.equal(getAdminBatchOrderState(avatars, NOW)?.label, "OPEN \u00b7 ongoing");

  const until = { ...avatars, ongoingUntil: "2026-11-30" };
  assert.equal(getHomepageJoinBatchDeadlineLabel(until, NOW), "Open until 30 Nov 2026");
  assert.match(getHomepageJoinBatchDescription(until, NOW).text, /closes on 30 November 2026\./);
  assert.equal(getAdminBatchOrderState(until, NOW)?.label, "OPEN \u00b7 ongoing until 30 Nov 2026");
}

// --- Default (toggle off) admin note explains the disagreement --------------
{
  const avatars = firestoreBatches().find((b) => b.id === "batch-6")!;
  const expired = getAdminBatchOrderState(avatars, NOW);
  assert.equal(expired?.customersCanOrder, false);
  // en-GB short month is "Sept" on current ICU, "Sep" on older ones.
  assert.match(expired?.label ?? "", /^OPEN \(expired 30 Sept? 2026 \u2014 customers see closed\)$/);
  assert.equal(
    getAdminBatchOrderState({ ...avatars, keepOpenAfterEndDate: true, ongoingUntil: "2026-10-20" }, NOW)?.label,
    "OPEN (open until 20 Oct 2026 has passed \u2014 customers see closed)",
  );
  assert.equal(
    getAdminBatchOrderState({ ...avatars, keepOpenAfterEndDate: true, allowOrders: false }, NOW)?.customersCanOrder,
    false,
  );
  assert.equal(getAdminBatchOrderState({ ...avatars, status: "COMPLETED" }, NOW), null);
  // An open batch inside its dates needs no note.
  assert.equal(getAdminBatchOrderState({ ...avatars, endDate: "2026-12-31" }, NOW), null);
}

// --- Date window boundaries --------------------------------------------------
{
  const end = { endDate: "2026-09-30" };
  assert.equal(getBatchDateWindow(end, new Date("2026-09-30T23:59:59.999+01:00")).open, true);
  assert.equal(getBatchDateWindow(end, new Date("2026-10-01T00:00:00.000+01:00")).open, false);
  // "Open until" never closes a batch before its own end date.
  const early = getBatchDateWindow(
    { endDate: "2026-09-30", keepOpenAfterEndDate: true, ongoingUntil: "2026-09-01" },
    new Date("2026-09-15T12:00:00+01:00"),
  );
  assert.equal(early.open, true);
  assert.equal(early.effectiveCloseDate?.toISOString(), "2026-09-30T22:59:59.999Z");
  // A malformed Open until is ignored (same as blank) on client and server.
  const malformed = { endDate: "2026-09-30", keepOpenAfterEndDate: true, ongoingUntil: "30/10/2026" };
  assert.equal(getBatchDateWindow(malformed, NOW).reason, "ongoing");
  assert.equal(
    communityBatchFromRecord("batch-6", { ...malformed, status: "OPEN" })?.ongoingUntil,
    undefined,
  );
  // ongoingUntil without the toggle does nothing.
  assert.equal(
    getBatchDateWindow({ endDate: "2026-09-30", ongoingUntil: "2026-12-31" }, NOW).open,
    false,
  );
  assert.deepEqual(batchOrderWindowContextFields({ keepOpenAfterEndDate: false } as Batch), {});
}

// --- AUTO batch with the toggle stays OPEN and active ------------------------
{
  const auto = {
    ...firestoreBatches().find((b) => b.id === "batch-6")!,
    isAutoScheduled: true,
    keepOpenAfterEndDate: true,
  } as Batch;
  const processed = processDynamicBatches([auto], NOW)[0];
  assert.equal(processed.status, "OPEN");
  assert.equal(processed.isActive, true);
  const processedOff = processDynamicBatches([{ ...auto, keepOpenAfterEndDate: false }], NOW)[0];
  assert.equal(processedOff.status, "CLOSED");
}

// --- Next batch selection skips windows that have passed --------------------
{
  const batches = firestoreBatches();
  assert.deepEqual(
    getNextUpcomingBatches(batches, 3, NOW).map((b) => b.id),
    ["batch-8", "batch-9", "batch-10"],
    "Power Rangers (ended 12 Oct) is never offered as upcoming",
  );
  assert.equal(
    getNextOpenCommunityBatch(batches, "batch-6", NOW),
    undefined,
    "No batch is joinable today, so no Join next button",
  );
  // Musketeers opened by the admin: it is the next open batch.
  const withMusketeers = batches.map((b) =>
    b.id === "batch-8" ? { ...b, status: "OPEN", isActive: true } as Batch : b,
  );
  assert.equal(getNextOpenCommunityBatch(withMusketeers, "batch-6", NOW)?.id, "batch-8");
  // An OPEN batch whose window passed is never the next open batch.
  const stale = batches.map((b) =>
    b.id === "batch-7" ? { ...b, status: "OPEN" } as Batch : b,
  );
  assert.equal(getNextOpenCommunityBatch(stale, "batch-6", NOW), undefined);
  // The closed batch itself is never offered.
  const ongoing = firestoreBatches({ keepOpenAfterEndDate: true });
  assert.equal(getNextOpenCommunityBatch(ongoing, "batch-6", NOW), undefined);
}

// --- Client and server agree for every record shape -------------------------
{
  const shapes: Record<string, unknown>[] = [
    {},
    { keepOpenAfterEndDate: true },
    { keepOpenAfterEndDate: true, ongoingUntil: "2026-10-25" },
    { keepOpenAfterEndDate: true, ongoingUntil: "2026-10-26" },
    { keepOpenAfterEndDate: true, ongoingUntil: "2026-12-31" },
    { keepOpenAfterEndDate: true, ongoingUntil: "garbage" },
    { keepOpenAfterEndDate: "true" },
    { keepOpenAfterEndDate: true, allowOrders: false },
    { keepOpenAfterEndDate: true, currentGarments: 72 },
    { keepOpenAfterEndDate: true, status: "SHIPPED" },
    { keepOpenAfterEndDate: true, isAutoScheduled: true },
    { endDate: "2026-12-31" },
    { endDate: "2026-12-31", isActive: false },
  ];
  for (const shape of shapes) {
    const raw = firestoreBatches(shape).find((b) => b.id === "batch-6")!;
    const clientClosed = isCommunityBatchClosedForOrders(raw, NOW);
    const server = await resolveCommunityOrderClosure({
      identity: { orderType: "Community", batchId: "batch-6" },
      readBatch: async () => raw,
      now: NOW,
    });
    assert.equal(
      server.status === "closed",
      clientClosed,
      `client and server disagree for ${JSON.stringify(shape)}`,
    );
  }
}

// --- Homepage cache keeps the ongoing / open-until label --------------------
{
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const avatars = firestoreBatches({ keepOpenAfterEndDate: true }).find((b) => b.id === "batch-6")!;
  writeHomepageJoinBatchCache(avatars, storage, NOW);
  const cached = readHomepageJoinBatchCache(storage);
  assert.equal(cached?.kind, "batch");
  const view = getHomepageProvisionalJoinBatchView(
    cached?.kind === "batch" ? cached.batch : null,
    NOW,
  );
  assert.equal(view?.deadlineLabel, "Open \u00b7 ongoing");
  assert.equal(view?.text, "Join the currently open community batch. Ordering is ongoing.");

  writeHomepageJoinBatchCache({ ...avatars, ongoingUntil: "2026-11-30" }, storage, NOW);
  const cachedUntil = readHomepageJoinBatchCache(storage);
  const untilView = getHomepageProvisionalJoinBatchView(
    cachedUntil?.kind === "batch" ? cachedUntil.batch : null,
    NOW,
  );
  assert.equal(untilView?.deadlineLabel, "Open until 30 Nov 2026");
  assert.equal(
    getHomepageProvisionalJoinBatchView(
      cachedUntil?.kind === "batch" ? cachedUntil.batch : null,
      new Date("2026-12-01T12:00:00+01:00"),
    ),
    null,
    "A cached Open until date that passed shows the placeholder",
  );
  // Default batches keep the "Closes" label.
  const open = { ...avatars, keepOpenAfterEndDate: false, endDate: "2026-11-16" } as Batch;
  writeHomepageJoinBatchCache(open, storage, NOW);
  const cachedOpen = readHomepageJoinBatchCache(storage);
  assert.equal(
    getHomepageProvisionalJoinBatchView(
      cachedOpen?.kind === "batch" ? cachedOpen.batch : null,
      NOW,
    )?.deadlineLabel,
    "Closes 16 Nov 2026",
  );
}

// --- Homepage keeps a closed Join card for the current batch ---------------
{
  // Today's data: Avatars closed by its end date and nothing else open.
  const batches = firestoreBatches();
  assert.equal(getHomepageClosedCurrentBatch(batches, NOW)?.id, "batch-6");
  const state = getHomepageOrderGatewayState(batches, NOW);
  assert.equal(state.closedBatch?.id, "batch-6");
  assert.equal(state.nextOpenBatch, null);
  assert.equal(state.joinBatch, null);
  const slot = resolveHomepageJoinSlot(state.joinBatch, false, null, NOW, state);
  assert.equal(slot.kind, "live");
  if (slot.kind === "live") {
    assert.equal(slot.name, "Avatars");
    assert.equal(slot.closed, true);
    assert.match(slot.text, /^The Avatars batch closed on 30 Sept? 2026\./);
    assert.equal(slot.label, null, "No next open batch: no join button");
    assert.equal(slot.joinTarget, null);
  }

  // Musketeers opened by the admin: the closed card offers it, never moves anyone.
  const withMusketeers = batches.map((b) =>
    b.id === "batch-8" ? { ...b, status: "OPEN", isActive: true } as Batch : b,
  );
  const nextState = getHomepageOrderGatewayState(withMusketeers, NOW);
  assert.equal(nextState.closedBatch?.id, "batch-6");
  assert.equal(nextState.nextOpenBatch?.id, "batch-8");
  const nextSlot = resolveHomepageJoinSlot(nextState.joinBatch, false, null, NOW, nextState);
  assert.equal(nextSlot.kind, "live");
  if (nextSlot.kind === "live") {
    assert.equal(nextSlot.name, "Avatars");
    assert.equal(nextSlot.closed, true);
    assert.equal(nextSlot.label, "Join next open batch: Musketeers");
    assert.equal(nextSlot.joinTarget?.id, "batch-8");
  }
  // The next batch is one the join flow accepts.
  assert.ok(resolveHomepageCommunityBatchEntry(withMusketeers, "batch-8", "Eindhoven", NOW));

  // A stale OPEN batch whose window passed is never offered as next.
  const stale = batches.map((b) =>
    b.id === "batch-7" ? { ...b, status: "OPEN" } as Batch : b,
  );
  assert.equal(getHomepageOrderGatewayState(stale, NOW).nextOpenBatch, null);

  // Kept open (ongoing): no closed card, Avatars is the open Join card.
  const ongoing = getHomepageOrderGatewayState(
    firestoreBatches({ keepOpenAfterEndDate: true }),
    NOW,
  );
  assert.equal(ongoing.closedBatch, null);
  assert.equal(ongoing.joinBatch?.id, "batch-6");
  // "Open until" date passed: closed card dated to that day.
  const untilPassed = firestoreBatches({ keepOpenAfterEndDate: true, ongoingUntil: "2026-10-20" });
  const untilState = getHomepageOrderGatewayState(untilPassed, NOW);
  assert.equal(untilState.closedBatch?.id, "batch-6");
  assert.match(
    getHomepageJoinBatchDescription(untilState.closedBatch, NOW).text,
    /^The Avatars batch closed on 20 Oct 2026\./,
  );
  // Closed by orders being turned off, not by its date: no closed card.
  assert.equal(getHomepageClosedCurrentBatch(firestoreBatches({ allowOrders: false }), NOW), undefined);
  // Inactive manual batch past its dates is not the current batch.
  assert.equal(getHomepageClosedCurrentBatch(firestoreBatches({ isActive: false }), NOW), undefined);

  // Footer: App passes no join batch while the closed card shows, so the
  // footer link points at the homepage order section.
  assert.deepEqual(
    resolveFooterBatchLink({ hasLoadedBatches: true, joinBatch: null }).target,
    { kind: "home-order-gateway" },
  );
}

console.log("PASS: batch order window (keep open after end date) is one rule everywhere");
