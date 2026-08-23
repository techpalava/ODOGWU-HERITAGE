import type { FabricAllocation, MasterOrder } from "../types.js";
import { countPhysicalFabricAllocationsByCode } from "./fabricInventoryQuantities.js";
import { sha256Hex } from "./sha256Hex.js";

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
};

export const hashCanonicalFingerprint = (payload: unknown): string =>
  sha256Hex(stableStringify(payload));

/** Owner-scoped prepare identity. Raw prepareRequestId never names a quote doc. */
export const buildDepositPrepareKey = (
  ownerUid: string,
  prepareRequestId: string,
): string => sha256Hex(`${ownerUid}:${prepareRequestId}`);

/** Deterministic server checkout id derived from the owner-scoped prepare key. */
export const buildDepositCheckoutIdFromPrepareKey = (
  prepareKey: string,
): string => `CHK_${prepareKey.slice(0, 32)}`;

export type DepositCheckoutQuoteStatus =
  | "PREPARED"
  | "CONFIRMED"
  | "EXPIRED"
  | "CANCELLED";

export type DepositCheckoutQuote = {
  checkoutId: string;
  ownerUid: string;
  prepareRequestId?: string;
  prepareKey?: string;
  status: DepositCheckoutQuoteStatus;
  currency: "eur";
  canonicalOrders: MasterOrder[];
  orderIds: string[];
  canonicalCheckoutFingerprint: string;
  totalCents: number;
  depositCents: number;
  paymentProvider: "stripe" | "simulated";
  paymentIntentId: string;
  simulationToken?: string;
  clientSecret?: string | null;
  createdAt: string;
  expiresAt?: string;
  confirmedAt?: string;
};

export type DepositPrepareLookupRecord = {
  prepareKey: string;
  prepareRequestId: string;
  ownerUid: string;
  checkoutId: string;
  canonicalCheckoutFingerprint: string;
  createdAt: string;
};

export type DepositPaymentConfirmationRecord = {
  paymentIntentId: string;
  provider: "stripe" | "simulated";
  ownerUid: string;
  checkoutId: string;
  checkoutFingerprint: string;
  amountCents: number;
  currency: "eur";
  confirmedAt: string;
};

const canonicalizeCustomer = (order: MasterOrder) => {
  const customer = order.customer;
  if (!customer) return null;
  return {
    ownerUid: customer.ownerUid || null,
    name: customer.name || null,
    email: customer.email || null,
    phone: customer.phone || null,
    location: customer.location || null,
  };
};

const canonicalizeDeliverySelection = (order: MasterOrder) => {
  const selection = order.deliverySelection;
  if (!selection) return null;
  const {
    actualParcelWeightKg: _ignoredClientWeight,
    ...rest
  } = selection as typeof selection & { actualParcelWeightKg?: number };
  return rest;
};

const canonicalizeImmutableUploadedReference = (order: MasterOrder) => {
  const source = order.orderDesignSource;
  if (source?.kind !== "uploaded") return null;
  if (source.imageState?.kind !== "immutable_order_asset") {
    return {
      kind: "uploaded" as const,
      sourceKey: source.sourceKey,
      imageStateKind: source.imageState?.kind || null,
      orderReference: null,
    };
  }
  const reference = source.imageState.orderReference;
  return {
    kind: "uploaded" as const,
    sourceKey: source.sourceKey,
    fabricCapacityComposition: source.fabricCapacityComposition,
    demographic: source.demographic,
    imageStateKind: "immutable_order_asset" as const,
    orderReference: {
      orderId: reference.orderId,
      storagePath: reference.storagePath,
      mimeType: reference.mimeType,
    },
  };
};

const canonicalizeOrderForFingerprint = (order: MasterOrder) => {
  const allocations = [...(order.fabricAllocations || [])]
    .map((allocation) => ({
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
      garmentAssignments: [...allocation.garmentAssignments]
        .map((assignment) => ({
          garmentKey: assignment.garmentKey,
          code: assignment.code,
          garmentType: assignment.garmentType,
          fabricUnits: assignment.fabricUnits,
          ...(assignment.sourceRole ? { sourceRole: assignment.sourceRole } : {}),
          ...(assignment.mainGarmentKey
            ? { mainGarmentKey: assignment.mainGarmentKey }
            : {}),
          ...(assignment.dependencyStatus
            ? { dependencyStatus: assignment.dependencyStatus }
            : {}),
        }))
        .sort((left, right) => left.garmentKey.localeCompare(right.garmentKey)),
    }))
    .sort((left, right) => left.allocationId.localeCompare(right.allocationId));

  const quantities = Object.fromEntries(
    countPhysicalFabricAllocationsByCode(allocations),
  );

  const styleUpdatedAt = (() => {
    const value =
      order.style && typeof order.style === "object"
        ? (order.style as unknown as Record<string, unknown>).updatedAt
        : undefined;
    return typeof value === "string" ? value : null;
  })();
  const fabricUpdatedAt =
    typeof order.fabric?.updatedAt === "string" ? order.fabric.updatedAt : null;

  return {
    orderId: order.shipment?.trackingId || null,
    ownerUid: order.ownerUid || null,
    checkoutId: (order as { checkoutId?: string }).checkoutId || null,
    customer: canonicalizeCustomer(order),
    specialInstructions: order.specialInstructions || null,
    notesAboutLeftoverFabric: order.notesAboutLeftoverFabric || null,
    styleId:
      order.orderDesignSource?.kind === "catalog"
        ? order.orderDesignSource.styleId || null
        : order.style?.id || null,
    styleRevision: styleUpdatedAt,
    fabricRevision: fabricUpdatedAt,
    orderDesignSource: order.orderDesignSource
      ? order.orderDesignSource.kind === "catalog"
        ? {
            kind: "catalog" as const,
            styleId: order.orderDesignSource.styleId,
            sourceKey: order.orderDesignSource.sourceKey,
          }
        : canonicalizeImmutableUploadedReference(order)
      : null,
    fabricCode: order.fabric?.code || null,
    fabricAllocations: allocations,
    fabricQuantities: quantities,
    design: order.design || null,
    garment: {
      code: order.garment?.code || null,
      taxInclusiveDesignSubtotal:
        order.garment?.taxInclusiveDesignSubtotal ?? null,
      totalPrice: order.garment?.totalPrice ?? null,
      checkoutTotal: order.garment?.checkoutTotal ?? null,
    },
    batchType: order.batchType || null,
    batchName: order.batchName || null,
    customGroupCode: order.customGroupCode || null,
    deliverySelection: canonicalizeDeliverySelection(order),
    shippingBreakdown: order.shippingBreakdown || null,
    payment: {
      subtotal: order.payment?.subtotal ?? null,
      deposit: order.payment?.deposit ?? null,
      remaining: order.payment?.remaining ?? null,
    },
    measurements: order.measurements || null,
  };
};

export const buildOrderCheckoutFingerprint = (order: MasterOrder): string =>
  hashCanonicalFingerprint(canonicalizeOrderForFingerprint(order));

export const buildCanonicalCheckoutFingerprint = (input: {
  checkoutId: string;
  ownerUid: string;
  orders: MasterOrder[];
  totalCents: number;
  depositCents: number;
  currency: "eur";
}): string =>
  hashCanonicalFingerprint({
    checkoutId: input.checkoutId,
    ownerUid: input.ownerUid,
    currency: input.currency,
    totalCents: input.totalCents,
    depositCents: input.depositCents,
    orders: input.orders
      .map((order) => ({
        orderId: order.shipment?.trackingId || "",
        fingerprint: buildOrderCheckoutFingerprint(order),
        canonical: canonicalizeOrderForFingerprint(order),
      }))
      .sort((left, right) => left.orderId.localeCompare(right.orderId)),
  });

export const buildSimulationToken = (input: {
  checkoutId: string;
  ownerUid: string;
  checkoutFingerprint: string;
  depositCents: number;
}): string =>
  hashCanonicalFingerprint({
    kind: "simulated_deposit_token",
    ...input,
  });

export const getOrderCheckoutId = (order: MasterOrder): string | null => {
  const checkoutId = (order as { checkoutId?: unknown }).checkoutId;
  return typeof checkoutId === "string" && checkoutId.trim().length > 0
    ? checkoutId.trim()
    : null;
};

/** @deprecated Prefer buildOrderCheckoutFingerprint for full checkout binding. */
export const buildOrderInventoryFingerprint = (input: {
  orderId: string;
  ownerUid: string;
  checkoutId?: string | null;
  fabricAllocations: readonly FabricAllocation[];
}): string => {
  const quantities = countPhysicalFabricAllocationsByCode(
    input.fabricAllocations,
  );
  return hashCanonicalFingerprint({
    orderId: input.orderId,
    ownerUid: input.ownerUid,
    checkoutId: input.checkoutId ?? null,
    fabricQuantities: Object.fromEntries(quantities),
    fabricAllocations: input.fabricAllocations,
  });
};

export const buildCheckoutInventoryFingerprint = (input: {
  checkoutId: string;
  ownerUid: string;
  orderFingerprints: ReadonlyArray<{ orderId: string; fingerprint: string }>;
}): string =>
  hashCanonicalFingerprint({
    checkoutId: input.checkoutId,
    ownerUid: input.ownerUid,
    orders: [...input.orderFingerprints]
      .map((entry) => ({
        orderId: entry.orderId,
        fingerprint: entry.fingerprint,
      }))
      .sort((left, right) => left.orderId.localeCompare(right.orderId)),
  });
