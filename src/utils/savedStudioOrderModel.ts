import type {
  DesignStudioResumeLocusV1,
  DesignStudioStageId,
  Fabric,
  GuestDesignDraft,
} from "../types";
import type { Batch } from "../types";
import { getStep1GarmentDisplayLabel } from "./garmentConstructionPricing";
import {
  getDesignStudioStepCounter,
  DESIGN_STUDIO_STAGE_IDS,
} from "./designSourceJourney";
import { normalizeDesignStudioResumeLocus } from "./designStudioResumeLocus";
import { inspectUploadedDesignSourceRegistry } from "./uploadedDesignSourceRegistry";
import { isValidUploadedDesignDraftSource } from "./designSourceState";
import { getPersistedDraftOrderIdentity } from "./orderContextIdentity";
import { getRetainedCommunityBatchEligibilityBlocker } from "./futureOrderCandidate";

export const SAVED_STUDIO_ORDER_SCHEMA_VERSION = 1 as const;
export const SAVED_STUDIO_ORDER_MAX_PER_CUSTOMER = 5;
export const SAVED_STUDIO_ORDER_NAME_MAX_LENGTH = 60;
export const SAVED_STUDIO_ORDER_COLLECTION = "savedStudioOrders";

export const SAVED_STUDIO_ORDER_CAP_MESSAGE =
  "You have 5 saved orders. Delete one to save another.";
export const SAVED_STUDIO_ORDER_CONFIRMATION_MESSAGE =
  "Saved to your dashboard and cart";
export const SAVED_STUDIO_ORDER_GARMENT_GATE_REASON =
  "Choose a garment type to save this order.";
export const SAVED_STUDIO_ORDER_RETRY_MESSAGE =
  "We couldn't save this order. Check your connection and try again. Your current order is still here.";
export const SAVED_STUDIO_ORDER_DASHBOARD_HASH = "saved-orders";

export type SavedStudioOrderPriceSnapshotV1 = {
  schemaVersion: 1;
  total: number | null;
  garmentConstructionSubtotal: number | null;
  customDetailsPrice: number | null;
  capturedAt: string;
};

export type SavedStudioOrderItemV1 = {
  schemaVersion: 1;
  savedOrderId: string;
  ownerUid: string;
  name: string;
  garmentSummary: string;
  savedStage: DesignStudioStageId;
  savedStep: number;
  resumeLocus: DesignStudioResumeLocusV1 | null;
  draft: GuestDesignDraft;
  priceSnapshot: SavedStudioOrderPriceSnapshotV1;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type SavedStudioOrderIndexV1 = {
  schemaVersion: 1;
  ownerUid: string;
  itemIds: string[];
  updatedAt: string;
};

export type SavedStudioOrderChangeWarning = {
  code: "fabric_unavailable" | "community_batch_ineligible" | "price_changed";
  message: string;
};

export type SavedStudioOrderSaveGate =
  | { ok: true }
  | { ok: false; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toIsoString = (value: unknown): string | null => {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (isRecord(value) && typeof value.toDate === "function") {
    const date = (value as { toDate(): Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
};

export const isDesignStudioStageId = (
  value: unknown,
): value is DesignStudioStageId =>
  typeof value === "string" &&
  (DESIGN_STUDIO_STAGE_IDS as readonly string[]).includes(value);

export const getSavedStudioOrderGate = (
  draft: Pick<GuestDesignDraft, "garmentTypeSelection"> | null | undefined,
): SavedStudioOrderSaveGate => {
  const garmentTypes = draft?.garmentTypeSelection?.garmentTypes;
  if (!garmentTypes || garmentTypes.length === 0) {
    return { ok: false, reason: SAVED_STUDIO_ORDER_GARMENT_GATE_REASON };
  }
  return { ok: true };
};

export const formatSavedStudioOrderDate = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
};

export const buildSavedStudioOrderGarmentSummary = (
  draft: Pick<GuestDesignDraft, "garmentTypeSelection">,
): string => {
  const garmentTypes = draft.garmentTypeSelection?.garmentTypes ?? [];
  const labels: string[] = [];
  for (const garmentType of garmentTypes) {
    const label = getStep1GarmentDisplayLabel(garmentType);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join(" + ");
};

export const generateSavedStudioOrderName = (
  draft: Pick<GuestDesignDraft, "garmentTypeSelection">,
  now: Date = new Date(),
): string => {
  const summary = buildSavedStudioOrderGarmentSummary(draft);
  const date = formatSavedStudioOrderDate(now);
  const raw = summary && date ? `${summary}, ${date}` : summary || date || "Saved order";
  return raw.slice(0, SAVED_STUDIO_ORDER_NAME_MAX_LENGTH);
};

export const normalizeSavedStudioOrderName = (
  value: unknown,
): { name: string } | { error: "empty" | "too_long" } => {
  if (typeof value !== "string") return { error: "empty" };
  const name = value.trim();
  if (name.length < 1) return { error: "empty" };
  if (name.length > SAVED_STUDIO_ORDER_NAME_MAX_LENGTH) return { error: "too_long" };
  return { name };
};

export const createSavedStudioOrderPriceSnapshot = (
  draft: Pick<GuestDesignDraft, "pricingBreakdown">,
  capturedAt: string = new Date().toISOString(),
): SavedStudioOrderPriceSnapshotV1 => {
  const breakdown = draft.pricingBreakdown;
  const total =
    typeof breakdown?.total === "number" && Number.isFinite(breakdown.total)
      ? breakdown.total
      : null;
  const garmentConstructionSubtotal =
    typeof breakdown?.garmentConstructionSubtotal === "number" &&
    Number.isFinite(breakdown.garmentConstructionSubtotal)
      ? breakdown.garmentConstructionSubtotal
      : null;
  const customDetailsPrice =
    typeof breakdown?.customDetailsPrice === "number" &&
    Number.isFinite(breakdown.customDetailsPrice)
      ? breakdown.customDetailsPrice
      : null;
  return {
    schemaVersion: 1,
    total,
    garmentConstructionSubtotal,
    customDetailsPrice,
    capturedAt,
  };
};

export const resolveSavedStudioOrderStep = (
  stageId: DesignStudioStageId,
  draftStep?: number,
): number => {
  try {
    return getDesignStudioStepCounter(stageId).step;
  } catch {
    return Number.isSafeInteger(draftStep) && (draftStep as number) >= 1
      ? (draftStep as number)
      : 1;
  }
};

export const getSavedStudioOrderStageTitle = (
  stageId: DesignStudioStageId,
): string => {
  try {
    return getDesignStudioStepCounter(stageId).title;
  } catch {
    return stageId;
  }
};

const collectUploadedSourceRefFromUnknown = (
  source: unknown,
  refs: Set<string>,
) => {
  if (!isRecord(source) || source.kind !== "uploaded") return;
  const uploadReference = source.uploadReference;
  if (!isRecord(uploadReference)) return;
  const sourceRef = uploadReference.designReferenceId;
  if (typeof sourceRef === "string" && sourceRef.trim()) refs.add(sourceRef);
};

export const collectUploadedSourceRefsFromDraft = (
  draft: GuestDesignDraft,
): string[] => {
  const refs = new Set<string>();
  const registry = inspectUploadedDesignSourceRegistry(draft);
  if (registry.status === "valid") {
    for (const [sourceRef, source] of Object.entries(
      registry.registry.sourcesByUploadedSourceRef,
    )) {
      if (sourceRef) refs.add(sourceRef);
      collectUploadedSourceRefFromUnknown(source, refs);
    }
  }
  collectUploadedSourceRefFromUnknown(draft.designSource, refs);
  if (isValidUploadedDesignDraftSource(draft.designSource)) {
    const sourceRef = draft.designSource.uploadReference.designReferenceId;
    if (sourceRef) refs.add(sourceRef);
  }
  return [...refs];
};

export const isUploadedSourceReferencedBySavedOrders = (
  sourceRef: string,
  items: readonly Pick<SavedStudioOrderItemV1, "draft">[],
): boolean => {
  if (!sourceRef) return false;
  return items.some((item) =>
    collectUploadedSourceRefsFromDraft(item.draft).includes(sourceRef),
  );
};

const collectDraftFabricCodes = (draft: GuestDesignDraft): string[] => {
  const codes: string[] = [];
  const seen = new Set<string>();
  const add = (code: unknown) => {
    if (typeof code === "string" && code.trim() && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  };
  add(draft.selectedFabricCode);
  add(draft.priceActivatedFabricCode);
  for (const allocation of draft.fabricAllocations ?? []) {
    add(allocation.fabricCode);
  }
  return codes;
};

const isFabricSoldOutOrUnlisted = (
  fabricCode: string,
  liveFabrics: readonly Fabric[],
): "unlisted" | "sold_out" | null => {
  const fabric = liveFabrics.find((entry) => entry.code === fabricCode);
  if (!fabric) return "unlisted";
  if (
    fabric.stockStatus === "OUT_OF_STOCK" ||
    fabric.stockStatus === "HIDDEN" ||
    fabric.stock === 0
  ) {
    return "sold_out";
  }
  return null;
};

export const SAVED_STUDIO_ORDER_PRICE_CHANGED_MESSAGE =
  "Prices have changed since this order was saved. You will be charged current prices.";

/**
 * Compares the total captured when the order was saved with the total the
 * Studio recomputes from the live catalogue after Continue. Returns null when
 * either side is unknown, so a missing catalogue never raises a false alarm.
 */
export const evaluateSavedStudioOrderPriceChange = ({
  savedTotal,
  liveTotal,
}: {
  savedTotal: number | null | undefined;
  liveTotal: number | null | undefined;
}): SavedStudioOrderChangeWarning | null => {
  if (
    typeof savedTotal !== "number" ||
    !Number.isFinite(savedTotal) ||
    typeof liveTotal !== "number" ||
    !Number.isFinite(liveTotal)
  ) {
    return null;
  }
  if (Math.abs(savedTotal - liveTotal) < 0.005) return null;
  return { code: "price_changed", message: SAVED_STUDIO_ORDER_PRICE_CHANGED_MESSAGE };
};

export const evaluateSavedStudioOrderChangeWarnings = ({
  item,
  liveFabrics,
  liveBatches,
  fabricCatalogueLoaded = liveFabrics.length > 0,
  recomputedTotal = null,
}: {
  item: Pick<SavedStudioOrderItemV1, "draft" | "priceSnapshot">;
  liveFabrics: readonly Fabric[];
  liveBatches: readonly Batch[];
  /** Skip the sold-out/unlisted check until the live catalogue has loaded. */
  fabricCatalogueLoaded?: boolean;
  /** Live Studio total recomputed from the current catalogue, if known. */
  recomputedTotal?: number | null;
}): SavedStudioOrderChangeWarning[] => {
  const warnings: SavedStudioOrderChangeWarning[] = [];
  const fabricCodes = collectDraftFabricCodes(item.draft);
  const unavailable: string[] = [];
  if (fabricCatalogueLoaded) {
    for (const fabricCode of fabricCodes) {
      const status = isFabricSoldOutOrUnlisted(fabricCode, liveFabrics);
      if (status) unavailable.push(fabricCode);
    }
  }
  if (unavailable.length > 0) {
    warnings.push({
      code: "fabric_unavailable",
      message:
        unavailable.length === 1
          ? `Fabric ${unavailable[0]} is sold out or no longer listed.`
          : `These fabrics are sold out or no longer listed: ${unavailable.join(", ")}.`,
    });
  }

  const identity = getPersistedDraftOrderIdentity(item.draft);
  if (identity) {
    const blocker = getRetainedCommunityBatchEligibilityBlocker(
      identity,
      liveBatches,
    );
    if (blocker) {
      warnings.push({
        code: "community_batch_ineligible",
        message: blocker.message,
      });
    }
  }

  const priceChange = evaluateSavedStudioOrderPriceChange({
    savedTotal: item.priceSnapshot.total,
    liveTotal: recomputedTotal,
  });
  if (priceChange) warnings.push(priceChange);

  return warnings;
};

const normalizePriceSnapshot = (
  value: unknown,
): SavedStudioOrderPriceSnapshotV1 | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const total =
    value.total === null ||
    (typeof value.total === "number" && Number.isFinite(value.total))
      ? (value.total as number | null)
      : null;
  const garmentConstructionSubtotal =
    value.garmentConstructionSubtotal === null ||
    (typeof value.garmentConstructionSubtotal === "number" &&
      Number.isFinite(value.garmentConstructionSubtotal))
      ? (value.garmentConstructionSubtotal as number | null)
      : null;
  const customDetailsPrice =
    value.customDetailsPrice === null ||
    (typeof value.customDetailsPrice === "number" &&
      Number.isFinite(value.customDetailsPrice))
      ? (value.customDetailsPrice as number | null)
      : null;
  const capturedAt = toIsoString(value.capturedAt);
  if (!capturedAt) return null;
  return {
    schemaVersion: 1,
    total,
    garmentConstructionSubtotal,
    customDetailsPrice,
    capturedAt,
  };
};

export const stampLinkedSavedOrderId = (
  draft: GuestDesignDraft,
  savedOrderId: string,
): GuestDesignDraft => ({
  ...draft,
  linkedSavedOrderId: savedOrderId,
});

export type SavedStudioOrderDraftNormalizer = (
  value: unknown,
) => { draft: GuestDesignDraft | null; reason: string | null };

export const normalizeSavedStudioOrderItem = (
  value: unknown,
  normalizeDraft: SavedStudioOrderDraftNormalizer,
  expectedOwnerUid?: string,
): { item: SavedStudioOrderItemV1 | null; reason: string | null } => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SAVED_STUDIO_ORDER_SCHEMA_VERSION ||
    typeof value.savedOrderId !== "string" ||
    value.savedOrderId.length < 8 ||
    value.savedOrderId.length > 80 ||
    typeof value.ownerUid !== "string" ||
    typeof value.name !== "string" ||
    typeof value.garmentSummary !== "string" ||
    !isDesignStudioStageId(value.savedStage) ||
    !Number.isSafeInteger(value.savedStep) ||
    (value.savedStep as number) < 1 ||
    (value.savedStep as number) > 10 ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1
  ) {
    return { item: null, reason: "invalid_saved_order_envelope" };
  }
  if (expectedOwnerUid && value.ownerUid !== expectedOwnerUid) {
    return { item: null, reason: "saved_order_owner_mismatch" };
  }
  const name = normalizeSavedStudioOrderName(value.name);
  if ("error" in name) {
    return { item: null, reason: `invalid_saved_order_name:${name.error}` };
  }
  const createdAt = toIsoString(value.createdAt);
  const updatedAt = toIsoString(value.updatedAt);
  if (!createdAt || !updatedAt) {
    return { item: null, reason: "invalid_saved_order_timestamps" };
  }
  const normalizedDraft = normalizeDraft(value.draft);
  if (!normalizedDraft.draft) {
    return {
      item: null,
      reason: normalizedDraft.reason || "invalid_saved_order_draft",
    };
  }
  const priceSnapshot = normalizePriceSnapshot(value.priceSnapshot);
  if (!priceSnapshot) {
    return { item: null, reason: "invalid_saved_order_price_snapshot" };
  }
  const resumeLocus = normalizeDesignStudioResumeLocus(value.resumeLocus);
  return {
    item: {
      schemaVersion: 1,
      savedOrderId: value.savedOrderId,
      ownerUid: value.ownerUid,
      name: name.name,
      garmentSummary: value.garmentSummary.slice(0, 200),
      savedStage: value.savedStage,
      savedStep: value.savedStep as number,
      resumeLocus,
      draft: normalizedDraft.draft,
      priceSnapshot,
      createdAt,
      updatedAt,
      revision: value.revision as number,
    },
    reason: null,
  };
};

export const normalizeSavedStudioOrderIndex = (
  value: unknown,
  expectedOwnerUid?: string,
): { index: SavedStudioOrderIndexV1 | null; reason: string | null } => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SAVED_STUDIO_ORDER_SCHEMA_VERSION ||
    typeof value.ownerUid !== "string" ||
    !Array.isArray(value.itemIds)
  ) {
    return { index: null, reason: "invalid_saved_order_index" };
  }
  if (expectedOwnerUid && value.ownerUid !== expectedOwnerUid) {
    return { index: null, reason: "saved_order_index_owner_mismatch" };
  }
  const itemIds: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.itemIds) {
    if (typeof entry !== "string" || entry.length < 8 || entry.length > 80) {
      return { index: null, reason: "invalid_saved_order_index_id" };
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    itemIds.push(entry);
  }
  if (itemIds.length > SAVED_STUDIO_ORDER_MAX_PER_CUSTOMER) {
    return { index: null, reason: "saved_order_cap_exceeded" };
  }
  const updatedAt = toIsoString(value.updatedAt) ?? new Date().toISOString();
  return {
    index: {
      schemaVersion: 1,
      ownerUid: value.ownerUid,
      itemIds,
      updatedAt,
    },
    reason: null,
  };
};

export const hasConflictingActiveStudioDraft = ({
  activeDraft,
  continuingSavedOrderId,
}: {
  activeDraft: GuestDesignDraft | null;
  continuingSavedOrderId: string;
}): boolean => {
  if (!activeDraft) return false;
  if (activeDraft.linkedSavedOrderId === continuingSavedOrderId) return false;
  if (getSavedStudioOrderGate(activeDraft).ok === false) return false;
  return true;
};

export const PENDING_SAVE_STUDIO_ORDER_STORAGE_KEY =
  "odogwu_pending_save_studio_order_v1";

export const markPendingSaveStudioOrder = (): void => {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PENDING_SAVE_STUDIO_ORDER_STORAGE_KEY, "1");
};

export const clearPendingSaveStudioOrder = (): void => {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(PENDING_SAVE_STUDIO_ORDER_STORAGE_KEY);
};

export const hasPendingSaveStudioOrder = (): boolean => {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(PENDING_SAVE_STUDIO_ORDER_STORAGE_KEY) === "1";
};

const CART_SAVED_ORDER_LINKS_KEY = "odogwu_saved_order_cart_links_v1";

const readCartSavedOrderLinks = (): Record<string, string> => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(CART_SAVED_ORDER_LINKS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const links: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) links[key] = value;
    }
    return links;
  } catch {
    return {};
  }
};

export const rememberSavedOrderCartLink = (
  fingerprint: string,
  savedOrderId: string,
): void => {
  if (!fingerprint || !savedOrderId || typeof localStorage === "undefined") {
    return;
  }
  const links = readCartSavedOrderLinks();
  links[fingerprint] = savedOrderId;
  localStorage.setItem(CART_SAVED_ORDER_LINKS_KEY, JSON.stringify(links));
};

export const takeSavedOrderCartLink = (fingerprint: string): string | null => {
  if (!fingerprint) return null;
  const links = readCartSavedOrderLinks();
  const savedOrderId = links[fingerprint] ?? null;
  if (!savedOrderId) return null;
  delete links[fingerprint];
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(CART_SAVED_ORDER_LINKS_KEY, JSON.stringify(links));
  }
  return savedOrderId;
};

export const peekSavedOrderCartLink = (fingerprint: string): string | null => {
  if (!fingerprint) return null;
  return readCartSavedOrderLinks()[fingerprint] ?? null;
};

const PAYMENT_SAVED_ORDER_LINKS_KEY = "odogwu_saved_order_payment_links_v1";

const readPaymentSavedOrderLinks = (): Record<string, string> => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PAYMENT_SAVED_ORDER_LINKS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const links: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) links[key] = value;
    }
    return links;
  } catch {
    return {};
  }
};

/**
 * Records which saved order a prepared payment order came from, so a later
 * redirect return (iDEAL, Pix) removes exactly that saved order and no other.
 */
export const rememberSavedOrderPaymentLink = (
  orderId: string,
  savedOrderId: string | null | undefined,
): void => {
  if (!orderId || !savedOrderId || typeof localStorage === "undefined") return;
  const links = readPaymentSavedOrderLinks();
  links[orderId] = savedOrderId;
  localStorage.setItem(PAYMENT_SAVED_ORDER_LINKS_KEY, JSON.stringify(links));
};

export const takeSavedOrderPaymentLink = (
  orderId: string | null | undefined,
): string | null => {
  if (!orderId) return null;
  const links = readPaymentSavedOrderLinks();
  const savedOrderId = links[orderId] ?? null;
  if (!savedOrderId) return null;
  delete links[orderId];
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(PAYMENT_SAVED_ORDER_LINKS_KEY, JSON.stringify(links));
  }
  return savedOrderId;
};
