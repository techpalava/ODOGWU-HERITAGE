import type { Fabric, FabricAllocation, MasterOrder } from "../types.js";
import { countPhysicalFabricAllocationsByCode } from "../utils/fabricInventoryQuantities.js";
import {
  buildCheckoutInventoryFingerprint,
  buildOrderInventoryFingerprint,
  getOrderCheckoutId,
  type DepositCheckoutQuote,
  type DepositPaymentConfirmationRecord,
} from "../utils/depositOrderFingerprint.js";
import {
  DepositPaymentVerificationError,
  verifyDepositPaymentProof,
  type DepositPaymentProof,
  type StripeRetriever,
  type VerifiedDepositPayment,
} from "./depositPaymentVerification.js";
import {
  OrderFabricAllocationValidationError,
  validateMasterOrderFabricAllocationsForDeposit,
} from "./orderFabricAllocationValidation.js";
import {
  consumeInventoryReservationForSale,
  FabricReservationError,
} from "./fabricInventoryReservation.js";

export const INVENTORY_TRANSACTIONS_COLLECTION = "inventory_transactions";
export const CHECKOUT_CONFIRMATIONS_COLLECTION = "checkout_confirmations";
export const FABRICS_COLLECTION = "fabrics";
export const ORDERS_COLLECTION = "orders";

export type FabricInventoryLine = {
  fabricCode: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
};

export type FabricInventoryLedger = {
  transactionId: string;
  orderId: string;
  ownerUid: string;
  checkoutId: string;
  type: "SALE";
  source: "ORDER_CONFIRMATION";
  canonicalFingerprint: string;
  lines: FabricInventoryLine[];
  createdAt: string;
  payment: {
    provider: VerifiedDepositPayment["provider"];
    paymentIntentId: string | null;
    amountCents: number;
    currency: "eur";
  };
};

export type CheckoutConfirmationRecord = {
  checkoutId: string;
  ownerUid: string;
  type: "SALE_BATCH";
  source: "ORDER_CONFIRMATION";
  canonicalFingerprint: string;
  checkoutFingerprint: string;
  paymentIntentId: string;
  orderIds: string[];
  createdAt: string;
  payment: FabricInventoryLedger["payment"];
};

export type DepositConfirmFailureCode =
  | "INSUFFICIENT_STOCK"
  | "FABRIC_UNAVAILABLE"
  | "INVALID_FABRIC_INVENTORY"
  | "INVALID_ORDER_ALLOCATION"
  | "AUTH_REQUIRED"
  | "AUTH_ANONYMOUS_NOT_ALLOWED"
  | "ORDER_OWNERSHIP_MISMATCH"
  | "ORDER_IDEMPOTENCY_CONFLICT"
  | "PAYMENT_NOT_CONFIRMED"
  | "PAYMENT_MISMATCH"
  | "PAYMENT_ALREADY_USED"
  | "CHECKOUT_STATE_CONFLICT"
  | "INVALID_ORDER"
  | "SERVER_ERROR";

export class FabricInventoryError extends Error {
  readonly code: DepositConfirmFailureCode;
  readonly affectedFabricCodes: string[];
  readonly affectedOrderIds: string[];

  constructor(
    code: DepositConfirmFailureCode,
    message: string,
    options: {
      affectedFabricCodes?: string[];
      affectedOrderIds?: string[];
    } = {},
  ) {
    super(message);
    this.name = "FabricInventoryError";
    this.code = code;
    this.affectedFabricCodes = options.affectedFabricCodes ?? [];
    this.affectedOrderIds = options.affectedOrderIds ?? [];
  }
}

export type ConfirmDepositBatchSuccess = {
  status: "consumed" | "already_consumed";
  checkoutId: string;
  paymentIntentId: string;
  idempotent: boolean;
  orderIds: string[];
  ledgers: FabricInventoryLedger[];
  checkoutConfirmation: CheckoutConfirmationRecord;
  quote: DepositCheckoutQuote;
};

export type InventoryFabricSnapshot = {
  code: string;
  stock: unknown;
  reservedStock?: unknown;
  stockStatus: Fabric["stockStatus"] | string | undefined;
};

export type InventoryTransactionReaderWriter = {
  getLedger(orderId: string): Promise<FabricInventoryLedger | null>;
  getCheckoutConfirmation(
    checkoutId: string,
  ): Promise<CheckoutConfirmationRecord | null>;
  getDepositQuote(checkoutId: string): Promise<DepositCheckoutQuote | null>;
  getPaymentConfirmation(
    paymentIntentId: string,
  ): Promise<DepositPaymentConfirmationRecord | null>;
  getFabric(fabricCode: string): Promise<InventoryFabricSnapshot | null>;
  getOrder(orderId: string): Promise<MasterOrder | null>;
  getReservation(
    checkoutId: string,
  ): Promise<import("./fabricInventoryReservation.js").InventoryReservationRecord | null>;
  setLedger(orderId: string, ledger: FabricInventoryLedger): void;
  setCheckoutConfirmation(
    checkoutId: string,
    record: CheckoutConfirmationRecord,
  ): void;
  setDepositQuote(checkoutId: string, quote: DepositCheckoutQuote): void;
  setPaymentConfirmation(
    paymentIntentId: string,
    record: DepositPaymentConfirmationRecord,
  ): void;
  setReservation(
    checkoutId: string,
    reservation: import("./fabricInventoryReservation.js").InventoryReservationRecord,
  ): void;
  updateFabric(
    fabricCode: string,
    patch: {
      stock?: number;
      reservedStock?: number;
      stockStatus: Fabric["stockStatus"];
    },
  ): void;
  setOrder(orderId: string, order: MasterOrder): void;
};

export type RunInventoryTransaction = <T>(
  work: (store: InventoryTransactionReaderWriter) => Promise<T>,
) => Promise<T>;

export type PreparedDepositOrder = {
  order: MasterOrder;
  orderId: string;
  ownerUid: string;
  fabricAllocations: FabricAllocation[];
  fingerprint: string;
  quantities: Map<string, number>;
};

const requireNonEmptyString = (
  value: unknown,
  code: DepositConfirmFailureCode,
  message: string,
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FabricInventoryError(code, message);
  }
  return value.trim();
};

export const assertNonAnonymousAuth = (token: {
  uid?: string;
  firebase?: { sign_in_provider?: string };
}): string => {
  const uid = requireNonEmptyString(
    token.uid,
    "AUTH_REQUIRED",
    "Firebase authentication is required.",
  );
  if (token.firebase?.sign_in_provider === "anonymous") {
    throw new FabricInventoryError(
      "AUTH_ANONYMOUS_NOT_ALLOWED",
      "Anonymous Firebase sessions cannot confirm deposit orders.",
    );
  }
  return uid;
};

export const assertOrderOwnershipConsistency = (
  order: MasterOrder,
  authenticatedUid: string,
): string => {
  const orderId = requireNonEmptyString(
    order.shipment?.trackingId,
    "INVALID_ORDER",
    "Every order requires shipment.trackingId.",
  );
  const ownerUid = order.ownerUid;
  const customerOwnerUid = order.customer?.ownerUid;

  if (
    typeof ownerUid !== "string" ||
    typeof customerOwnerUid !== "string" ||
    ownerUid.trim().length === 0 ||
    customerOwnerUid.trim().length === 0
  ) {
    throw new FabricInventoryError(
      "ORDER_OWNERSHIP_MISMATCH",
      `Order ${orderId} is missing ownerUid consistency fields.`,
      { affectedOrderIds: [orderId] },
    );
  }

  if (ownerUid !== authenticatedUid || customerOwnerUid !== authenticatedUid) {
    throw new FabricInventoryError(
      "ORDER_OWNERSHIP_MISMATCH",
      `Order ${orderId} does not belong to the authenticated customer.`,
      { affectedOrderIds: [orderId] },
    );
  }

  if (ownerUid !== customerOwnerUid) {
    throw new FabricInventoryError(
      "ORDER_OWNERSHIP_MISMATCH",
      `Order ${orderId} has mismatched ownerUid fields.`,
      { affectedOrderIds: [orderId] },
    );
  }

  return ownerUid;
};

export const prepareDepositOrderForConfirmation = (
  order: MasterOrder,
  authenticatedUid: string,
): PreparedDepositOrder => {
  const orderId = requireNonEmptyString(
    order.shipment?.trackingId,
    "INVALID_ORDER",
    "Every order requires shipment.trackingId.",
  );
  const ownerUid = assertOrderOwnershipConsistency(order, authenticatedUid);
  const checkoutId = getOrderCheckoutId(order);
  if (!checkoutId) {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      `Order ${orderId} requires a checkoutId.`,
      { affectedOrderIds: [orderId] },
    );
  }

  let fabricAllocations: FabricAllocation[];
  try {
    fabricAllocations = validateMasterOrderFabricAllocationsForDeposit(
      order,
      order.style ?? null,
    );
  } catch (error) {
    if (error instanceof OrderFabricAllocationValidationError) {
      throw new FabricInventoryError(
        "INVALID_ORDER_ALLOCATION",
        error.message,
        { affectedOrderIds: [orderId] },
      );
    }
    throw error;
  }

  const quantities = countPhysicalFabricAllocationsByCode(fabricAllocations);
  const fingerprint = buildOrderInventoryFingerprint({
    orderId,
    ownerUid,
    checkoutId,
    fabricAllocations,
  });

  return {
    order: {
      ...order,
      ownerUid,
      customer: {
        ...order.customer,
        ownerUid,
      },
      fabricAllocations,
      checkoutId,
      shipment: {
        ...order.shipment,
        trackingId: orderId,
      },
    },
    orderId,
    ownerUid,
    fabricAllocations,
    fingerprint,
    quantities,
  };
};

export const aggregateQuantities = (
  preparedOrders: readonly PreparedDepositOrder[],
): Map<string, number> => {
  const aggregate = new Map<string, number>();
  for (const prepared of preparedOrders) {
    for (const [fabricCode, quantity] of prepared.quantities) {
      aggregate.set(fabricCode, (aggregate.get(fabricCode) ?? 0) + quantity);
    }
  }
  return aggregate;
};

const assertLedgerMatchesPrepared = (
  ledger: FabricInventoryLedger,
  prepared: PreparedDepositOrder,
): void => {
  if (ledger.ownerUid !== prepared.ownerUid) {
    throw new FabricInventoryError(
      "ORDER_IDEMPOTENCY_CONFLICT",
      `Existing inventory ledger for ${prepared.orderId} belongs to a different owner.`,
      { affectedOrderIds: [prepared.orderId] },
    );
  }
  if (ledger.canonicalFingerprint !== prepared.fingerprint) {
    throw new FabricInventoryError(
      "ORDER_IDEMPOTENCY_CONFLICT",
      `Existing inventory ledger for ${prepared.orderId} does not match this confirmation payload.`,
      { affectedOrderIds: [prepared.orderId] },
    );
  }
};

/**
 * Atomically confirm a previously prepared deposit checkout quote.
 * Canonical orders come ONLY from the persisted server quote.
 */
export const confirmDepositCheckoutBatch = async (input: {
  quote: DepositCheckoutQuote;
  paymentProof: DepositPaymentProof;
  authenticatedUid: string;
  runInTransaction: RunInventoryTransaction;
  stripe?: StripeRetriever | null;
  now?: () => Date;
}): Promise<ConfirmDepositBatchSuccess> => {
  const quote = input.quote;
  if (quote.ownerUid !== input.authenticatedUid) {
    throw new FabricInventoryError(
      "ORDER_OWNERSHIP_MISMATCH",
      "Checkout quote does not belong to the authenticated customer.",
    );
  }
  if (quote.status === "CANCELLED" || quote.status === "EXPIRED") {
    throw new FabricInventoryError(
      "CHECKOUT_STATE_CONFLICT",
      `Checkout quote is ${quote.status}.`,
    );
  }
  if (!Array.isArray(quote.canonicalOrders) || quote.canonicalOrders.length === 0) {
    throw new FabricInventoryError(
      "CHECKOUT_STATE_CONFLICT",
      "Checkout quote is missing canonical orders.",
    );
  }

  const now = input.now ?? (() => new Date());
  const preparedOrders = quote.canonicalOrders.map((order) =>
    prepareDepositOrderForConfirmation(order, input.authenticatedUid),
  );

  const checkoutId = quote.checkoutId;
  const orderIds = preparedOrders.map((prepared) => prepared.orderId);
  if (
    orderIds.join("|") !== quote.orderIds.join("|") ||
    new Set(orderIds).size !== orderIds.length
  ) {
    throw new FabricInventoryError(
      "CHECKOUT_STATE_CONFLICT",
      "Canonical quote order IDs are inconsistent.",
      { affectedOrderIds: orderIds },
    );
  }

  let verifiedPayment: VerifiedDepositPayment;
  try {
    verifiedPayment = await verifyDepositPaymentProof({
      paymentProof: input.paymentProof,
      authenticatedUid: input.authenticatedUid,
      checkoutId,
      checkoutFingerprint: quote.canonicalCheckoutFingerprint,
      expectedDepositCents: quote.depositCents,
      expectedPaymentIntentId: quote.paymentIntentId,
      simulationToken: quote.simulationToken,
      stripe: input.stripe,
    });
  } catch (error) {
    if (error instanceof DepositPaymentVerificationError) {
      throw new FabricInventoryError(error.code, error.message);
    }
    throw error;
  }

  if (verifiedPayment.paymentIntentId !== quote.paymentIntentId) {
    throw new FabricInventoryError(
      "PAYMENT_MISMATCH",
      "Verified payment does not match the prepared checkout PaymentIntent.",
    );
  }

  const checkoutFingerprint = quote.canonicalCheckoutFingerprint;
  const inventoryFingerprint = buildCheckoutInventoryFingerprint({
    checkoutId,
    ownerUid: input.authenticatedUid,
    orderFingerprints: preparedOrders.map((prepared) => ({
      orderId: prepared.orderId,
      fingerprint: prepared.fingerprint,
    })),
  });

  const aggregate = aggregateQuantities(preparedOrders);

  return input.runInTransaction(async (store) => {
    const liveQuote = await store.getDepositQuote(checkoutId);
    if (!liveQuote) {
      throw new FabricInventoryError(
        "CHECKOUT_STATE_CONFLICT",
        "Checkout quote disappeared before confirmation.",
      );
    }
    if (
      liveQuote.canonicalCheckoutFingerprint !== checkoutFingerprint ||
      liveQuote.paymentIntentId !== quote.paymentIntentId ||
      liveQuote.ownerUid !== input.authenticatedUid
    ) {
      throw new FabricInventoryError(
        "CHECKOUT_STATE_CONFLICT",
        "Checkout quote changed before confirmation.",
      );
    }

    const existingPayment = await store.getPaymentConfirmation(
      verifiedPayment.paymentIntentId,
    );
    const existingCheckout = await store.getCheckoutConfirmation(checkoutId);
    const existingLedgers = new Map<string, FabricInventoryLedger>();
    for (const prepared of preparedOrders) {
      const ledger = await store.getLedger(prepared.orderId);
      if (ledger) {
        existingLedgers.set(prepared.orderId, ledger);
      }
    }

    const anyExisting =
      Boolean(existingPayment) ||
      Boolean(existingCheckout) ||
      existingLedgers.size > 0 ||
      liveQuote.status === "CONFIRMED";

    if (anyExisting) {
      if (
        !existingPayment ||
        !existingCheckout ||
        existingLedgers.size !== preparedOrders.length ||
        liveQuote.status !== "CONFIRMED"
      ) {
        throw new FabricInventoryError(
          "CHECKOUT_STATE_CONFLICT",
          "Checkout confirmation is in an inconsistent inventory/payment state.",
          { affectedOrderIds: orderIds },
        );
      }

      if (
        existingPayment.ownerUid !== input.authenticatedUid ||
        existingPayment.checkoutId !== checkoutId ||
        existingPayment.checkoutFingerprint !== checkoutFingerprint ||
        existingCheckout.ownerUid !== input.authenticatedUid ||
        existingCheckout.canonicalFingerprint !== inventoryFingerprint ||
        existingCheckout.checkoutFingerprint !== checkoutFingerprint ||
        existingCheckout.paymentIntentId !== verifiedPayment.paymentIntentId
      ) {
        throw new FabricInventoryError(
          "PAYMENT_ALREADY_USED",
          "PaymentIntent or checkout confirmation does not match this quote.",
          { affectedOrderIds: orderIds },
        );
      }

      for (const prepared of preparedOrders) {
        assertLedgerMatchesPrepared(
          existingLedgers.get(prepared.orderId)!,
          prepared,
        );
      }

      return {
        status: "already_consumed" as const,
        checkoutId,
        paymentIntentId: verifiedPayment.paymentIntentId,
        idempotent: true,
        orderIds,
        ledgers: preparedOrders.map(
          (prepared) => existingLedgers.get(prepared.orderId)!,
        ),
        checkoutConfirmation: existingCheckout,
        quote: liveQuote,
      };
    }

    for (const prepared of preparedOrders) {
      const existingOrder = await store.getOrder(prepared.orderId);
      if (existingOrder) {
        throw new FabricInventoryError(
          "ORDER_IDEMPOTENCY_CONFLICT",
          `Order ${prepared.orderId} already exists without a matching inventory ledger.`,
          { affectedOrderIds: [prepared.orderId] },
        );
      }
    }

    const createdAt = now().toISOString();
    const paymentMeta = {
      provider: verifiedPayment.provider,
      paymentIntentId: verifiedPayment.paymentIntentId,
      amountCents: verifiedPayment.amountCents,
      currency: "eur" as const,
    };

    const expectedLines = [...aggregate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([fabricCode, quantity]) => ({ fabricCode, quantity }));

    let stockMoves: Array<{
      fabricCode: string;
      quantity: number;
      stockBefore: number;
      stockAfter: number;
    }>;
    try {
      const consumed = await consumeInventoryReservationForSale({
        store: {
          getFabric: async (code) => {
            const fabric = await store.getFabric(code);
            if (!fabric) return null;
            return {
              code: fabric.code,
              stock: fabric.stock,
              reservedStock: fabric.reservedStock ?? 0,
              stockStatus: fabric.stockStatus,
            };
          },
          getReservation: (id) => store.getReservation(id),
          setReservation: (id, reservation) =>
            store.setReservation(id, reservation),
          updateFabric: (code, patch) => store.updateFabric(code, patch),
        },
        checkoutId,
        ownerUid: input.authenticatedUid,
        checkoutFingerprint,
        paymentIntentId: verifiedPayment.paymentIntentId,
        expectedLines,
        now: now(),
      });
      stockMoves = consumed.stockMoves.map((move) => ({
        fabricCode: move.fabricCode,
        quantity: move.quantity,
        stockBefore: move.stockBefore,
        stockAfter: move.stockAfter,
      }));
      if (consumed.reservation.status === "CONSUMED" && stockMoves.length === 0) {
        throw new FabricInventoryError(
          "CHECKOUT_STATE_CONFLICT",
          "Reservation was already consumed without matching sale artifacts.",
          { affectedOrderIds: orderIds },
        );
      }
    } catch (error) {
      if (error instanceof FabricReservationError) {
        throw new FabricInventoryError(
          error.code === "INSUFFICIENT_STOCK"
            ? "INSUFFICIENT_STOCK"
            : error.code === "FABRIC_UNAVAILABLE"
              ? "FABRIC_UNAVAILABLE"
              : error.code === "INVALID_FABRIC_INVENTORY"
                ? "INVALID_FABRIC_INVENTORY"
                : "CHECKOUT_STATE_CONFLICT",
          error.message,
          { affectedFabricCodes: error.affectedFabricCodes, affectedOrderIds: orderIds },
        );
      }
      throw error;
    }

    const planned = new Map(
      stockMoves.map((move) => [
        move.fabricCode,
        {
          quantity: move.quantity,
          stockBefore: move.stockBefore,
          stockAfter: move.stockAfter,
        },
      ]),
    );

    const ledgers: FabricInventoryLedger[] = [];
    for (const prepared of preparedOrders) {
      const lines: FabricInventoryLine[] = [...prepared.quantities.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([fabricCode, quantity]) => {
          const plan = planned.get(fabricCode)!;
          return {
            fabricCode,
            quantity,
            stockBefore: plan.stockBefore,
            stockAfter: plan.stockAfter,
          };
        });

      const ledger: FabricInventoryLedger = {
        transactionId: prepared.orderId,
        orderId: prepared.orderId,
        ownerUid: prepared.ownerUid,
        checkoutId,
        type: "SALE",
        source: "ORDER_CONFIRMATION",
        canonicalFingerprint: prepared.fingerprint,
        lines,
        createdAt,
        payment: paymentMeta,
      };
      store.setLedger(prepared.orderId, ledger);
      store.setOrder(prepared.orderId, {
        ...prepared.order,
        payment: {
          ...prepared.order.payment,
          isPaid: true,
          transactionId:
            verifiedPayment.paymentIntentId ||
            prepared.order.payment?.transactionId ||
            `SIM-${checkoutId}`,
          date: createdAt,
        },
        shipment: {
          ...prepared.order.shipment,
          trackingId: prepared.orderId,
          status: "Deposit Paid",
          currentStage: 1,
        },
      });
      ledgers.push(ledger);
    }

    const checkoutConfirmation: CheckoutConfirmationRecord = {
      checkoutId,
      ownerUid: input.authenticatedUid,
      type: "SALE_BATCH",
      source: "ORDER_CONFIRMATION",
      canonicalFingerprint: inventoryFingerprint,
      checkoutFingerprint,
      paymentIntentId: verifiedPayment.paymentIntentId,
      orderIds,
      createdAt,
      payment: paymentMeta,
    };
    store.setCheckoutConfirmation(checkoutId, checkoutConfirmation);

    const paymentConfirmation: DepositPaymentConfirmationRecord = {
      paymentIntentId: verifiedPayment.paymentIntentId,
      provider: verifiedPayment.provider,
      ownerUid: input.authenticatedUid,
      checkoutId,
      checkoutFingerprint,
      amountCents: verifiedPayment.amountCents,
      currency: "eur",
      confirmedAt: createdAt,
    };
    store.setPaymentConfirmation(
      verifiedPayment.paymentIntentId,
      paymentConfirmation,
    );

    const confirmedQuote: DepositCheckoutQuote = {
      ...liveQuote,
      status: "CONFIRMED",
      confirmedAt: createdAt,
    };
    store.setDepositQuote(checkoutId, confirmedQuote);

    return {
      status: "consumed" as const,
      checkoutId,
      paymentIntentId: verifiedPayment.paymentIntentId,
      idempotent: false,
      orderIds,
      ledgers,
      checkoutConfirmation,
      quote: confirmedQuote,
    };
  });
};
