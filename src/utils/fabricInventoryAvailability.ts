import type { Fabric } from "../types.js";
import {
  deriveFabricStockStatus,
  isValidFabricInventoryStock,
} from "./fabricStockStatus.js";

export class InvalidFabricReservedStockError extends Error {
  readonly code = "INVALID_FABRIC_INVENTORY" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidFabricReservedStockError";
  }
}

/**
 * Parse reservedStock.
 * - Genuinely missing (undefined) => 0 (legacy)
 * - Explicit null is treated as missing legacy only when callers opt in via
 *   `allowNullAsMissing` (default false for mutation paths; presentation may
 *   treat null as missing for read-only display fail-closed via available=null)
 * - Malformed values throw / return invalid — never silently become 0.
 */
export const parseReservedStock = (
  reservedStock: unknown,
  options: { allowMissingAsZero?: boolean; allowNullAsMissing?: boolean } = {},
):
  | { ok: true; value: number; missing: boolean }
  | { ok: false; reason: string } => {
  if (reservedStock === undefined) {
    if (options.allowMissingAsZero !== false) {
      return { ok: true, value: 0, missing: true };
    }
    return { ok: false, reason: "reservedStock is missing." };
  }
  if (reservedStock === null) {
    if (options.allowNullAsMissing) {
      return { ok: true, value: 0, missing: true };
    }
    return { ok: false, reason: "reservedStock is null." };
  }
  if (!isValidFabricInventoryStock(reservedStock)) {
    return {
      ok: false,
      reason:
        "reservedStock must be a finite non-negative integer inventory count.",
    };
  }
  return { ok: true, value: reservedStock, missing: false };
};

/** Legacy-safe read: missing => 0; malformed throws. */
export const normalizeReservedStock = (reservedStock: unknown): number => {
  if (reservedStock === undefined) {
    return 0;
  }
  const parsed = parseReservedStock(reservedStock, {
    allowMissingAsZero: false,
    allowNullAsMissing: false,
  });
  if (parsed.ok === false) {
    throw new InvalidFabricReservedStockError(parsed.reason);
  }
  return parsed.value;
};

/** Mutation path: missing => 0; malformed throws. */
export const requireValidReservedStock = (reservedStock: unknown): number => {
  if (reservedStock === undefined) {
    return 0;
  }
  const parsed = parseReservedStock(reservedStock, {
    allowMissingAsZero: false,
  });
  if (parsed.ok === false) {
    throw new InvalidFabricReservedStockError(parsed.reason);
  }
  return parsed.value;
};

export const getFabricOnHandStock = (
  fabric: Pick<Fabric, "stock"> | { stock?: unknown },
): number | null => {
  if (!isValidFabricInventoryStock(fabric.stock)) {
    return null;
  }
  return fabric.stock;
};

export const getFabricReservedStock = (
  fabric: Pick<Fabric, "reservedStock"> | { reservedStock?: unknown },
): number => {
  if (fabric.reservedStock === undefined) {
    return 0;
  }
  return normalizeReservedStock(fabric.reservedStock);
};

/**
 * availableStock = stock - reservedStock
 * Returns null when on-hand stock is invalid OR reservedStock is malformed
 * (fail closed — do not inflate availability).
 */
export const computeAvailableStock = (
  stock: unknown,
  reservedStock: unknown = undefined,
): number | null => {
  if (!isValidFabricInventoryStock(stock)) {
    return null;
  }
  const parsed = parseReservedStock(reservedStock, {
    allowMissingAsZero: true,
    allowNullAsMissing: false,
  });
  if (!parsed.ok) {
    return null;
  }
  return stock - parsed.value;
};

export const assertReservationInvariants = (input: {
  stock: number;
  reservedStock: number;
}): void => {
  if (input.reservedStock < 0) {
    throw new Error("reservedStock cannot be negative.");
  }
  if (input.reservedStock > input.stock) {
    throw new Error("reservedStock cannot exceed stock on hand.");
  }
  const available = input.stock - input.reservedStock;
  if (available < 0) {
    throw new Error("availableStock cannot be negative.");
  }
};

/** Enforce admin stock edits: stock on hand must cover reserved holds. */
export const assertStockCoversReserved = (input: {
  stock: number;
  reservedStock: unknown;
}): number => {
  const reserved = requireValidReservedStock(input.reservedStock);
  if (!isValidFabricInventoryStock(input.stock)) {
    throw new InvalidFabricReservedStockError(
      "stock must be a finite non-negative integer.",
    );
  }
  if (input.stock < reserved) {
    throw new InvalidFabricReservedStockError(
      `Stock on hand (${input.stock}) cannot be lower than reserved stock (${reserved}).`,
    );
  }
  return reserved;
};

/** Customer-facing stockStatus from available quantity (HIDDEN preserved). */
export const deriveFabricStockStatusFromAvailable = (
  availableStock: number,
  currentStatus?: Fabric["stockStatus"] | null,
): Fabric["stockStatus"] =>
  deriveFabricStockStatus(availableStock, currentStatus);

export const resolveFabricAvailability = (
  fabric: Pick<Fabric, "stock" | "reservedStock" | "stockStatus">,
): {
  stock: number | null;
  reservedStock: number | null;
  availableStock: number | null;
  stockStatus: Fabric["stockStatus"];
  inventoryCorrupt: boolean;
} => {
  const stock = getFabricOnHandStock(fabric);
  const reservedParsed = parseReservedStock(fabric.reservedStock, {
    allowMissingAsZero: true,
  });
  if (!reservedParsed.ok) {
    return {
      stock,
      reservedStock: null,
      availableStock: null,
      stockStatus:
        fabric.stockStatus === "HIDDEN" ? "HIDDEN" : "OUT_OF_STOCK",
      inventoryCorrupt: true,
    };
  }
  const reservedStock = reservedParsed.value;
  const availableStock =
    stock === null ? null : computeAvailableStock(stock, reservedStock);
  // Missing on-hand stock: keep declared status for legacy catalogue rows.
  // Known available quantity always drives customer status (except HIDDEN).
  const stockStatus =
    fabric.stockStatus === "HIDDEN"
      ? "HIDDEN"
      : availableStock === null
        ? fabric.stockStatus === "OUT_OF_STOCK" ||
          fabric.stockStatus === "LOW_STOCK" ||
          fabric.stockStatus === "IN_STOCK"
          ? fabric.stockStatus
          : "OUT_OF_STOCK"
        : deriveFabricStockStatusFromAvailable(
            availableStock,
            fabric.stockStatus,
          );
  return {
    stock,
    reservedStock,
    availableStock,
    stockStatus,
    inventoryCorrupt: false,
  };
};
