import type { Fabric } from "../types.js";
import { depositReservationTtlMs } from "../config/depositReservationConfig.js";
import {
  assertReservationInvariants,
  computeAvailableStock,
  deriveFabricStockStatusFromAvailable,
  requireValidReservedStock,
} from "../utils/fabricInventoryAvailability.js";
import { InvalidFabricReservedStockError } from "../utils/fabricInventoryAvailability.js";
import { isValidFabricInventoryStock } from "../utils/fabricStockStatus.js";
import {
  isKnownFabricStockStatus,
  isSellableFabricStockStatus,
} from "../utils/fabricStockStatus.js";

export const INVENTORY_RESERVATIONS_COLLECTION = "inventory_reservations";

export type InventoryReservationStatus =
  | "ACTIVE"
  | "CONSUMED"
  | "RELEASED"
  | "EXPIRED";

export type InventoryReservationLine = {
  fabricCode: string;
  quantity: number;
};

export type InventoryReservationRecord = {
  checkoutId: string;
  ownerUid: string;
  checkoutFingerprint: string;
  status: InventoryReservationStatus;
  lines: InventoryReservationLine[];
  createdAt: string;
  expiresAt: string;
  paymentIntentId?: string | null;
  consumedAt?: string;
  releasedAt?: string;
  releaseReason?: string;
};

export type ReservationLedgerType = "RESERVE" | "RELEASE" | "SALE";

export type FabricReservationErrorCode =
  | "INSUFFICIENT_STOCK"
  | "FABRIC_UNAVAILABLE"
  | "INVALID_FABRIC_INVENTORY"
  | "RESERVATION_CONFLICT"
  | "RESERVATION_NOT_ACTIVE"
  | "RESERVATION_NOT_FOUND"
  | "CHECKOUT_STATE_CONFLICT"
  | "SERVER_ERROR";

export class FabricReservationError extends Error {
  readonly code: FabricReservationErrorCode;
  readonly affectedFabricCodes: string[];

  constructor(
    code: FabricReservationErrorCode,
    message: string,
    options: { affectedFabricCodes?: string[] } = {},
  ) {
    super(message);
    this.name = "FabricReservationError";
    this.code = code;
    this.affectedFabricCodes = options.affectedFabricCodes ?? [];
  }
}

export type ReservationFabricSnapshot = {
  code: string;
  stock: unknown;
  reservedStock?: unknown;
  stockStatus: Fabric["stockStatus"] | string | undefined;
};

export type ReservationTransactionStore = {
  getFabric(fabricCode: string): Promise<ReservationFabricSnapshot | null>;
  getReservation(
    checkoutId: string,
  ): Promise<InventoryReservationRecord | null>;
  setReservation(
    checkoutId: string,
    reservation: InventoryReservationRecord,
  ): void;
  updateFabric(
    fabricCode: string,
    patch: {
      stock?: number;
      reservedStock: number;
      stockStatus: Fabric["stockStatus"];
    },
  ): void;
};

export type AggregateFabricQuantities = Map<string, number>;

export const buildReservationExpiresAt = (createdAt: Date): string =>
  new Date(createdAt.getTime() + depositReservationTtlMs()).toISOString();

export const sortReservationLines = (
  quantities: AggregateFabricQuantities,
): InventoryReservationLine[] =>
  [...quantities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fabricCode, quantity]) => ({ fabricCode, quantity }));

const validateFabricForReservation = (
  snapshot: ReservationFabricSnapshot,
  required: number,
):
  | { ok: true; stock: number; reservedStock: number; available: number }
  | { ok: false; code: FabricReservationErrorCode } => {
  if (!isKnownFabricStockStatus(snapshot.stockStatus)) {
    return { ok: false, code: "INVALID_FABRIC_INVENTORY" };
  }
  if (
    snapshot.stockStatus === "HIDDEN" ||
    snapshot.stockStatus === "OUT_OF_STOCK" ||
    !isSellableFabricStockStatus(snapshot.stockStatus)
  ) {
    return { ok: false, code: "FABRIC_UNAVAILABLE" };
  }
  if (!isValidFabricInventoryStock(snapshot.stock)) {
    return { ok: false, code: "INVALID_FABRIC_INVENTORY" };
  }
  let reservedStock: number;
  try {
    reservedStock = requireValidReservedStock(snapshot.reservedStock);
  } catch (error) {
    if (error instanceof InvalidFabricReservedStockError) {
      return { ok: false, code: "INVALID_FABRIC_INVENTORY" };
    }
    throw error;
  }
  if (reservedStock > snapshot.stock) {
    return { ok: false, code: "INVALID_FABRIC_INVENTORY" };
  }
  const available = computeAvailableStock(snapshot.stock, reservedStock);
  if (available === null || available < required) {
    return { ok: false, code: "INSUFFICIENT_STOCK" };
  }
  return {
    ok: true,
    stock: snapshot.stock,
    reservedStock,
    available,
  };
};

/**
 * Atomically reserve fabric for a checkout. Exact retry with an existing ACTIVE
 * reservation for the same fingerprint returns that reservation without
 * double-holding stock.
 */
export const reserveInventoryForCheckout = async (input: {
  store: ReservationTransactionStore;
  checkoutId: string;
  ownerUid: string;
  checkoutFingerprint: string;
  quantities: AggregateFabricQuantities;
  now: Date;
  paymentIntentId?: string | null;
}): Promise<{
  reservation: InventoryReservationRecord;
  reusedExisting: boolean;
}> => {
  const existing = await input.store.getReservation(input.checkoutId);
  if (existing) {
    if (
      existing.status === "ACTIVE" &&
      existing.ownerUid === input.ownerUid &&
      existing.checkoutFingerprint === input.checkoutFingerprint
    ) {
      return { reservation: existing, reusedExisting: true };
    }
    if (existing.status === "CONSUMED") {
      throw new FabricReservationError(
        "RESERVATION_CONFLICT",
        "Checkout reservation was already consumed by a completed payment.",
      );
    }
    if (
      existing.status === "ACTIVE" &&
      existing.checkoutFingerprint !== input.checkoutFingerprint
    ) {
      throw new FabricReservationError(
        "RESERVATION_CONFLICT",
        "An active reservation already exists for a different checkout fingerprint.",
      );
    }
    // RELEASED / EXPIRED may be replaced by a fresh ACTIVE hold for a new prepare.
  }

  const lines = sortReservationLines(input.quantities);
  if (lines.length === 0) {
    throw new FabricReservationError(
      "INVALID_FABRIC_INVENTORY",
      "Checkout has no physical Fabric inventory requirements.",
    );
  }

  const insufficient: string[] = [];
  const unavailable: string[] = [];
  const invalid: string[] = [];
  const planned = new Map<
    string,
    { stock: number; reservedBefore: number; reservedAfter: number; quantity: number }
  >();

  for (const line of lines) {
    const snapshot = await input.store.getFabric(line.fabricCode);
    if (!snapshot) {
      unavailable.push(line.fabricCode);
      continue;
    }
    const validated = validateFabricForReservation(snapshot, line.quantity);
    if (validated.ok === false) {
      if (validated.code === "INSUFFICIENT_STOCK") {
        insufficient.push(line.fabricCode);
      } else if (validated.code === "FABRIC_UNAVAILABLE") {
        unavailable.push(line.fabricCode);
      } else {
        invalid.push(line.fabricCode);
      }
      continue;
    }
    const reservedAfter = validated.reservedStock + line.quantity;
    assertReservationInvariants({
      stock: validated.stock,
      reservedStock: reservedAfter,
    });
    planned.set(line.fabricCode, {
      stock: validated.stock,
      reservedBefore: validated.reservedStock,
      reservedAfter,
      quantity: line.quantity,
    });
  }

  if (unavailable.length > 0) {
    throw new FabricReservationError(
      "FABRIC_UNAVAILABLE",
      `One or more selected Fabrics are unavailable: ${unavailable.join(", ")}.`,
      { affectedFabricCodes: unavailable },
    );
  }
  if (invalid.length > 0) {
    throw new FabricReservationError(
      "INVALID_FABRIC_INVENTORY",
      `Fabric inventory needs admin review: ${invalid.join(", ")}.`,
      { affectedFabricCodes: invalid },
    );
  }
  if (insufficient.length > 0) {
    throw new FabricReservationError(
      "INSUFFICIENT_STOCK",
      `One or more selected Fabrics no longer have enough available stock: ${insufficient.join(", ")}.`,
      { affectedFabricCodes: insufficient },
    );
  }

  const createdAt = input.now.toISOString();
  for (const line of lines) {
    const plan = planned.get(line.fabricCode)!;
    const availableAfter = plan.stock - plan.reservedAfter;
    const snapshot = await input.store.getFabric(line.fabricCode);
    input.store.updateFabric(line.fabricCode, {
      reservedStock: plan.reservedAfter,
      stockStatus: deriveFabricStockStatusFromAvailable(
        availableAfter,
        (snapshot?.stockStatus as Fabric["stockStatus"]) ?? "IN_STOCK",
      ),
    });
  }

  const reservation: InventoryReservationRecord = {
    checkoutId: input.checkoutId,
    ownerUid: input.ownerUid,
    checkoutFingerprint: input.checkoutFingerprint,
    status: "ACTIVE",
    lines,
    createdAt,
    expiresAt: buildReservationExpiresAt(input.now),
    paymentIntentId: input.paymentIntentId ?? null,
  };
  input.store.setReservation(input.checkoutId, reservation);
  return { reservation, reusedExisting: false };
};

/**
 * Release an ACTIVE reservation: reservedStock decreases, stock unchanged.
 * Idempotent for already RELEASED/EXPIRED. Never releases CONSUMED.
 */
export const releaseInventoryReservation = async (input: {
  store: ReservationTransactionStore;
  checkoutId: string;
  ownerUid?: string;
  reason: string;
  now: Date;
  requireOwnerMatch?: boolean;
}): Promise<{
  reservation: InventoryReservationRecord;
  released: boolean;
  idempotent: boolean;
}> => {
  const existing = await input.store.getReservation(input.checkoutId);
  if (!existing) {
    throw new FabricReservationError(
      "RESERVATION_NOT_FOUND",
      "No inventory reservation exists for this checkout.",
    );
  }
  if (
    input.requireOwnerMatch &&
    input.ownerUid &&
    existing.ownerUid !== input.ownerUid
  ) {
    throw new FabricReservationError(
      "RESERVATION_CONFLICT",
      "Reservation owner does not match the authenticated caller.",
    );
  }
  if (existing.status === "CONSUMED") {
    throw new FabricReservationError(
      "RESERVATION_NOT_ACTIVE",
      "A consumed reservation cannot be released.",
    );
  }
  if (existing.status === "RELEASED" || existing.status === "EXPIRED") {
    return {
      reservation: existing,
      released: false,
      idempotent: true,
    };
  }

  for (const line of existing.lines) {
    const snapshot = await input.store.getFabric(line.fabricCode);
    if (!snapshot || !isValidFabricInventoryStock(snapshot.stock)) {
      throw new FabricReservationError(
        "INVALID_FABRIC_INVENTORY",
        `Cannot release reservation: fabric ${line.fabricCode} inventory is invalid.`,
        { affectedFabricCodes: [line.fabricCode] },
      );
    }
    const reservedBefore = requireValidReservedStock(snapshot.reservedStock);
    if (reservedBefore < line.quantity) {
      throw new FabricReservationError(
        "INVALID_FABRIC_INVENTORY",
        `Reservation release underflows reservedStock for ${line.fabricCode}: held ${reservedBefore}, releasing ${line.quantity}.`,
        { affectedFabricCodes: [line.fabricCode] },
      );
    }
    const reservedAfter = reservedBefore - line.quantity;
    assertReservationInvariants({
      stock: snapshot.stock,
      reservedStock: reservedAfter,
    });
    const availableAfter = snapshot.stock - reservedAfter;
    input.store.updateFabric(line.fabricCode, {
      reservedStock: reservedAfter,
      stockStatus: deriveFabricStockStatusFromAvailable(
        availableAfter,
        snapshot.stockStatus as Fabric["stockStatus"],
      ),
    });
  }

  const releasedAt = input.now.toISOString();
  const reservation: InventoryReservationRecord = {
    ...existing,
    status: input.reason === "expired" ? "EXPIRED" : "RELEASED",
    releasedAt,
    releaseReason: input.reason,
  };
  input.store.setReservation(input.checkoutId, reservation);
  return { reservation, released: true, idempotent: false };
};

/**
 * Convert ACTIVE reservation into a SALE: stock and reservedStock both reduce
 * by the reserved quantity so availableStock stays stable for other shoppers.
 */
export const consumeInventoryReservationForSale = async (input: {
  store: ReservationTransactionStore;
  checkoutId: string;
  ownerUid: string;
  checkoutFingerprint: string;
  paymentIntentId: string;
  expectedLines: InventoryReservationLine[];
  now: Date;
}): Promise<{
  reservation: InventoryReservationRecord;
  stockMoves: Array<{
    fabricCode: string;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    reservedBefore: number;
    reservedAfter: number;
  }>;
}> => {
  const existing = await input.store.getReservation(input.checkoutId);
  if (!existing) {
    throw new FabricReservationError(
      "RESERVATION_NOT_FOUND",
      "Payment succeeded but no inventory reservation was found.",
    );
  }
  if (existing.status === "CONSUMED") {
    // Caller should treat as idempotent success after verifying sale artifacts.
    return { reservation: existing, stockMoves: [] };
  }
  if (existing.status !== "ACTIVE") {
    throw new FabricReservationError(
      "RESERVATION_NOT_ACTIVE",
      `Reservation status ${existing.status} cannot be converted to a sale.`,
    );
  }
  if (
    existing.ownerUid !== input.ownerUid ||
    existing.checkoutFingerprint !== input.checkoutFingerprint
  ) {
    throw new FabricReservationError(
      "RESERVATION_CONFLICT",
      "Reservation does not match the confirmed checkout identity.",
    );
  }
  if (
    existing.paymentIntentId &&
    existing.paymentIntentId !== input.paymentIntentId
  ) {
    throw new FabricReservationError(
      "RESERVATION_CONFLICT",
      "Reservation PaymentIntent does not match the verified payment.",
    );
  }

  const expectedMap = new Map(
    input.expectedLines.map((line) => [line.fabricCode, line.quantity]),
  );
  const actualMap = new Map(
    existing.lines.map((line) => [line.fabricCode, line.quantity]),
  );
  if (expectedMap.size !== actualMap.size) {
    throw new FabricReservationError(
      "RESERVATION_CONFLICT",
      "Reservation lines do not match canonical Fabric requirements.",
    );
  }
  for (const [code, qty] of expectedMap) {
    if (actualMap.get(code) !== qty) {
      throw new FabricReservationError(
        "RESERVATION_CONFLICT",
        "Reservation lines do not match canonical Fabric requirements.",
        { affectedFabricCodes: [code] },
      );
    }
  }

  const stockMoves: Array<{
    fabricCode: string;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    reservedBefore: number;
    reservedAfter: number;
  }> = [];

  for (const line of existing.lines) {
    const snapshot = await input.store.getFabric(line.fabricCode);
    if (!snapshot || !isValidFabricInventoryStock(snapshot.stock)) {
      throw new FabricReservationError(
        "INVALID_FABRIC_INVENTORY",
        `Cannot consume reservation: fabric ${line.fabricCode} inventory is invalid.`,
        { affectedFabricCodes: [line.fabricCode] },
      );
    }
    const reservedBefore = requireValidReservedStock(snapshot.reservedStock);
    if (reservedBefore < line.quantity) {
      throw new FabricReservationError(
        "RESERVATION_CONFLICT",
        `Reserved stock for ${line.fabricCode} is lower than the reservation line.`,
        { affectedFabricCodes: [line.fabricCode] },
      );
    }
    if (snapshot.stock < line.quantity) {
      throw new FabricReservationError(
        "RESERVATION_CONFLICT",
        `On-hand stock for ${line.fabricCode} is lower than the reserved sale quantity.`,
        { affectedFabricCodes: [line.fabricCode] },
      );
    }
    const stockAfter = snapshot.stock - line.quantity;
    const reservedAfter = reservedBefore - line.quantity;
    assertReservationInvariants({ stock: stockAfter, reservedStock: reservedAfter });
    const availableAfter = stockAfter - reservedAfter;
    input.store.updateFabric(line.fabricCode, {
      stock: stockAfter,
      reservedStock: reservedAfter,
      stockStatus: deriveFabricStockStatusFromAvailable(
        availableAfter,
        snapshot.stockStatus as Fabric["stockStatus"],
      ),
    });
    stockMoves.push({
      fabricCode: line.fabricCode,
      quantity: line.quantity,
      stockBefore: snapshot.stock,
      stockAfter,
      reservedBefore,
      reservedAfter,
    });
  }

  const reservation: InventoryReservationRecord = {
    ...existing,
    status: "CONSUMED",
    paymentIntentId: input.paymentIntentId,
    consumedAt: input.now.toISOString(),
  };
  input.store.setReservation(input.checkoutId, reservation);
  return { reservation, stockMoves };
};

export const reservationLinesMatchQuantities = (
  lines: InventoryReservationLine[],
  quantities: AggregateFabricQuantities,
): boolean => {
  if (lines.length !== quantities.size) return false;
  for (const line of lines) {
    if (quantities.get(line.fabricCode) !== line.quantity) return false;
  }
  return true;
};
