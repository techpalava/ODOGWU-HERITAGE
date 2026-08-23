import type { CartItem } from "../types";
import type {
  CheckoutConfirmationRecord,
  FabricInventoryLedger,
} from "../server/fabricInventoryConsumption";
import type { DepositCheckoutQuote } from "../utils/depositOrderFingerprint";

export type ConfirmDepositClientErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_ANONYMOUS_NOT_ALLOWED"
  | "INSUFFICIENT_STOCK"
  | "FABRIC_UNAVAILABLE"
  | "INVALID_FABRIC_INVENTORY"
  | "INVALID_ORDER_ALLOCATION"
  | "ORDER_OWNERSHIP_MISMATCH"
  | "ORDER_IDEMPOTENCY_CONFLICT"
  | "PAYMENT_NOT_CONFIRMED"
  | "PAYMENT_MISMATCH"
  | "CHECKOUT_STATE_CONFLICT"
  | "PREPARE_IDEMPOTENCY_CONFLICT"
  | "INVALID_ORDER"
  | "PREPARE_FAILED"
  | "CONFIRM_FAILED";

export class ConfirmDepositClientError extends Error {
  readonly code: ConfirmDepositClientErrorCode;
  readonly affectedFabricCodes: string[];
  readonly affectedOrderIds: string[];

  constructor(
    code: ConfirmDepositClientErrorCode,
    message: string,
    options: {
      affectedFabricCodes?: string[];
      affectedOrderIds?: string[];
    } = {},
  ) {
    super(message);
    this.name = "ConfirmDepositClientError";
    this.code = code;
    this.affectedFabricCodes = options.affectedFabricCodes ?? [];
    this.affectedOrderIds = options.affectedOrderIds ?? [];
  }
}

export interface FirebaseCheckoutIdentity {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export type ConfirmDepositBatchSuccess = {
  status: "consumed" | "already_consumed";
  checkoutId: string;
  paymentIntentId: string;
  idempotent: boolean;
  orderIds: string[];
  ledgers: FabricInventoryLedger[];
  checkoutConfirmation: CheckoutConfirmationRecord;
  quote?: DepositCheckoutQuote;
};

export type PrepareDepositCheckoutSuccess = {
  checkoutId: string;
  paymentIntentId: string;
  clientSecret: string | null;
  mode: "stripe" | "simulated";
  depositCents: number;
  totalCents: number;
  canonicalCheckoutFingerprint: string;
  simulationToken?: string;
};

type JsonRecord = Record<string, unknown>;

const getErrorCode = (payload: JsonRecord | null): string =>
  typeof payload?.code === "string" ? payload.code : "";

const getStringArray = (payload: JsonRecord | null, key: string): string[] =>
  Array.isArray(payload?.[key])
    ? payload[key].filter((value): value is string => typeof value === "string")
    : [];

const toClientError = (code: string): ConfirmDepositClientErrorCode => {
  const known: ConfirmDepositClientErrorCode[] = [
    "AUTH_REQUIRED",
    "AUTH_ANONYMOUS_NOT_ALLOWED",
    "INSUFFICIENT_STOCK",
    "FABRIC_UNAVAILABLE",
    "INVALID_FABRIC_INVENTORY",
    "INVALID_ORDER_ALLOCATION",
    "ORDER_OWNERSHIP_MISMATCH",
    "ORDER_IDEMPOTENCY_CONFLICT",
    "PAYMENT_NOT_CONFIRMED",
    "PAYMENT_MISMATCH",
    "CHECKOUT_STATE_CONFLICT",
    "PREPARE_IDEMPOTENCY_CONFLICT",
    "INVALID_ORDER",
  ];
  if ((known as string[]).includes(code)) {
    return code as ConfirmDepositClientErrorCode;
  }
  if (code === "AUTH_FAILED") return "AUTH_REQUIRED";
  return "CONFIRM_FAILED";
};

const parseJson = async (response: Response): Promise<JsonRecord | null> => {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  try {
    const payload = await response.json();
    return payload && typeof payload === "object"
      ? (payload as JsonRecord)
      : null;
  } catch {
    return null;
  }
};

export const prepareDepositCheckout = async (input: {
  cartItems: CartItem[];
  prepareRequestId: string;
  paymentMethod?: "card" | "ideal";
  idealBank?: string;
  preparedUploadedDesignReferences?: Readonly<
    Record<
      string,
      {
        sourceKey: string;
        designReferenceId: string;
        orderReference: import("../types").ImmutableUploadedOrderDesignReference;
      }
    >
  >;
  identity: FirebaseCheckoutIdentity;
}): Promise<PrepareDepositCheckoutSuccess> => {
  let response: Response;
  try {
    response = await fetch("/api/orders/prepare-deposit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await input.identity.getIdToken(true)}`,
      },
      body: JSON.stringify({
        cartItems: input.cartItems,
        prepareRequestId: input.prepareRequestId,
        paymentMethod: input.paymentMethod,
        idealBank: input.idealBank,
        preparedUploadedDesignReferences:
          input.preparedUploadedDesignReferences,
      }),
    });
  } catch {
    throw new ConfirmDepositClientError(
      "PREPARE_FAILED",
      "Deposit checkout preparation is temporarily unavailable.",
    );
  }

  const payload = await parseJson(response);
  if (!response.ok || !payload) {
    throw new ConfirmDepositClientError(
      toClientError(getErrorCode(payload)),
      typeof payload?.error === "string"
        ? payload.error
        : "We could not prepare your deposit checkout.",
      {
        affectedFabricCodes: getStringArray(payload, "affectedFabricCodes"),
        affectedOrderIds: getStringArray(payload, "affectedOrderIds"),
      },
    );
  }

  if (
    typeof payload.checkoutId !== "string" ||
    typeof payload.paymentIntentId !== "string" ||
    (payload.clientSecret !== null &&
      typeof payload.clientSecret !== "string") ||
    (payload.mode !== "stripe" && payload.mode !== "simulated") ||
    typeof payload.depositCents !== "number" ||
    typeof payload.totalCents !== "number" ||
    typeof payload.canonicalCheckoutFingerprint !== "string"
  ) {
    throw new ConfirmDepositClientError(
      "PREPARE_FAILED",
      "Deposit checkout preparation returned an invalid response.",
    );
  }

  return {
    checkoutId: payload.checkoutId,
    paymentIntentId: payload.paymentIntentId,
    clientSecret:
      typeof payload.clientSecret === "string" ? payload.clientSecret : null,
    mode: payload.mode,
    depositCents: payload.depositCents,
    totalCents: payload.totalCents,
    canonicalCheckoutFingerprint: payload.canonicalCheckoutFingerprint,
    simulationToken:
      typeof payload.simulationToken === "string"
        ? payload.simulationToken
        : undefined,
  };
};

/**
 * Release an ACTIVE inventory reservation when the customer cancels checkout.
 * Idempotent for already-released / missing reservations.
 */
export const releaseDepositReservation = async (input: {
  checkoutId: string;
  identity: FirebaseCheckoutIdentity;
}): Promise<{
  checkoutId: string;
  released: boolean;
  idempotent: boolean;
  status: string;
}> => {
  let response: Response;
  try {
    response = await fetch("/api/orders/release-deposit-reservation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await input.identity.getIdToken(true)}`,
      },
      body: JSON.stringify({ checkoutId: input.checkoutId }),
    });
  } catch {
    throw new ConfirmDepositClientError(
      "CONFIRM_FAILED",
      "Reservation release is temporarily unavailable.",
    );
  }

  const payload = await parseJson(response);
  if (!response.ok || !payload) {
    throw new ConfirmDepositClientError(
      toClientError(getErrorCode(payload)),
      typeof payload?.error === "string"
        ? payload.error
        : "We could not release the fabric reservation.",
      {
        affectedFabricCodes: getStringArray(payload, "affectedFabricCodes"),
        affectedOrderIds: getStringArray(payload, "affectedOrderIds"),
      },
    );
  }

  return {
    checkoutId:
      typeof payload.checkoutId === "string"
        ? payload.checkoutId
        : input.checkoutId,
    released: Boolean(payload.released),
    idempotent: Boolean(payload.idempotent),
    status: typeof payload.status === "string" ? payload.status : "UNKNOWN",
  };
};

/**
 * Confirm an entire deposit checkout atomically.
 * Local UI state may update after success; the client must not write orders.
 */
export const confirmDepositCheckout = async (input: {
  checkoutId: string;
  paymentIntentId?: string;
  provider?: "simulated";
  simulationToken?: string;
  identity: FirebaseCheckoutIdentity;
}): Promise<ConfirmDepositBatchSuccess> => {
  let response: Response;
  try {
    response = await fetch("/api/orders/confirm-deposit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await input.identity.getIdToken(true)}`,
      },
      body: JSON.stringify({
        checkoutId: input.checkoutId,
        ...(input.provider === "simulated"
          ? {
              provider: "simulated",
              simulationToken: input.simulationToken,
            }
          : {
              paymentIntentId: input.paymentIntentId,
            }),
      }),
    });
  } catch {
    throw new ConfirmDepositClientError(
      "CONFIRM_FAILED",
      "Order confirmation is temporarily unavailable.",
    );
  }

  const payload = await parseJson(response);
  if (!response.ok || !payload) {
    throw new ConfirmDepositClientError(
      toClientError(getErrorCode(payload)),
      typeof payload?.error === "string"
        ? payload.error
        : "We could not confirm your order.",
      {
        affectedFabricCodes: getStringArray(payload, "affectedFabricCodes"),
        affectedOrderIds: getStringArray(payload, "affectedOrderIds"),
      },
    );
  }

  if (
    (payload.status !== "consumed" &&
      payload.status !== "already_consumed") ||
    typeof payload.checkoutId !== "string" ||
    typeof payload.paymentIntentId !== "string" ||
    !Array.isArray(payload.orderIds)
  ) {
    throw new ConfirmDepositClientError(
      "CONFIRM_FAILED",
      "Order confirmation returned an invalid response.",
    );
  }

  return {
    status: payload.status,
    checkoutId: payload.checkoutId,
    paymentIntentId: payload.paymentIntentId,
    idempotent: Boolean(payload.idempotent),
    orderIds: payload.orderIds.filter(
      (value): value is string => typeof value === "string",
    ),
    ledgers: (payload.ledgers as FabricInventoryLedger[]) || [],
    checkoutConfirmation:
      payload.checkoutConfirmation as CheckoutConfirmationRecord,
    quote:
      payload.quote && typeof payload.quote === "object"
        ? (payload.quote as DepositCheckoutQuote)
        : undefined,
  };
};
