import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  assertNonAnonymousAuth,
  FabricInventoryError,
  type ConfirmDepositBatchSuccess,
} from "./fabricInventoryConsumption.js";
import {
  confirmDepositCheckoutBatchWithAdminDb,
  loadDepositCheckoutQuote,
} from "./fabricInventoryAdmin.js";
import type { DepositPaymentProof } from "./depositPaymentVerification.js";
import Stripe from "stripe";

type ConfirmDepositAdminServices = {
  auth: {
    verifyIdToken(token: string): Promise<{
      uid: string;
      firebase?: { sign_in_provider?: string };
    }>;
  };
  db: Parameters<typeof confirmDepositCheckoutBatchWithAdminDb>[0]["db"];
};

export interface ConfirmDepositOrderHttpDependencies {
  getServices?: () => ConfirmDepositAdminServices;
  getStripe?: () => Stripe | null;
  now?: () => Date;
}

const getHeader = (req: HttpRequest, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
};

const parseConfirmDepositRequest = (
  body: unknown,
): {
  checkoutId: string;
  paymentIntentId?: string;
  provider?: "simulated" | "stripe";
  simulationToken?: string;
} => {
  if (!body || typeof body !== "object") {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "A confirm-deposit payload is required.",
    );
  }
  const record = body as Record<string, unknown>;
  if ("orders" in record) {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "Client-supplied orders are not accepted for deposit confirmation.",
    );
  }
  if (
    "requiredQuantities" in record ||
    "stockBefore" in record ||
    "stockAfter" in record ||
    "inventoryLines" in record
  ) {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "Client-supplied inventory quantities are not accepted.",
    );
  }

  const paymentProofInput =
    record.paymentProof && typeof record.paymentProof === "object"
      ? (record.paymentProof as Record<string, unknown>)
      : undefined;
  const checkoutId =
    typeof record.checkoutId === "string" && record.checkoutId.trim()
      ? record.checkoutId.trim()
      : typeof paymentProofInput?.checkoutId === "string" &&
          paymentProofInput.checkoutId.trim()
        ? paymentProofInput.checkoutId.trim()
        : "";
  if (!checkoutId) {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "checkoutId is required.",
    );
  }
  const paymentIntentId =
    typeof record.paymentIntentId === "string" && record.paymentIntentId.trim()
      ? record.paymentIntentId.trim()
      : typeof paymentProofInput?.paymentIntentId === "string" &&
          paymentProofInput.paymentIntentId.trim()
        ? paymentProofInput.paymentIntentId.trim()
        : undefined;
  const provider =
    record.provider === "simulated" || record.provider === "stripe"
      ? record.provider
      : paymentProofInput?.provider === "simulated" ||
          paymentProofInput?.provider === "stripe"
        ? paymentProofInput.provider
        : undefined;
  const simulationToken =
    typeof record.simulationToken === "string" && record.simulationToken.trim()
      ? record.simulationToken.trim()
      : typeof paymentProofInput?.simulationToken === "string" &&
          paymentProofInput.simulationToken.trim()
        ? paymentProofInput.simulationToken.trim()
        : undefined;

  return {
    checkoutId,
    paymentIntentId,
    provider,
    simulationToken,
  };
};

const statusForError = (code: FabricInventoryError["code"]): number => {
  switch (code) {
    case "AUTH_REQUIRED":
    case "AUTH_ANONYMOUS_NOT_ALLOWED":
      return 401;
    case "ORDER_OWNERSHIP_MISMATCH":
      return 403;
    case "INSUFFICIENT_STOCK":
    case "FABRIC_UNAVAILABLE":
    case "INVALID_FABRIC_INVENTORY":
    case "ORDER_IDEMPOTENCY_CONFLICT":
    case "CHECKOUT_STATE_CONFLICT":
    case "PAYMENT_NOT_CONFIRMED":
    case "PAYMENT_MISMATCH":
      return 409;
    case "INVALID_ORDER_ALLOCATION":
    case "INVALID_ORDER":
      return 400;
    case "SERVER_ERROR":
    default:
      return 503;
  }
};

const customerMessageForError = (error: FabricInventoryError): string => {
  switch (error.code) {
    case "INSUFFICIENT_STOCK":
    case "FABRIC_UNAVAILABLE":
    case "INVALID_FABRIC_INVENTORY": {
      const fabrics =
        error.affectedFabricCodes.length > 0
          ? ` Affected: ${error.affectedFabricCodes.join(", ")}.`
          : "";
      return `One or more selected Fabrics no longer have enough stock.${fabrics} Return to Fabric selection to update your design.`;
    }
    case "PAYMENT_NOT_CONFIRMED":
    case "PAYMENT_MISMATCH":
      return "Payment could not be confirmed for this deposit checkout.";
    case "AUTH_ANONYMOUS_NOT_ALLOWED":
      return "Sign in with a full customer account to complete checkout.";
    case "ORDER_OWNERSHIP_MISMATCH":
      return "This checkout does not belong to the signed-in customer.";
    case "INVALID_ORDER_ALLOCATION":
      return "Fabric selections on this order are invalid. Return to Fabric selection.";
    default:
      return error.message;
  }
};

const resolveStripe = (
  getStripe: (() => Stripe | null) | undefined,
  paymentProof: DepositPaymentProof,
): Stripe | null => {
  if (paymentProof.provider !== "stripe") return null;
  if (getStripe) return getStripe();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === "" || key === "MY_STRIPE_SECRET_KEY") {
    return null;
  }
  return new Stripe(key);
};

const buildPaymentProof = (input: {
  checkoutId: string;
  quotePaymentIntentId: string;
  paymentIntentId?: string;
  provider?: "simulated" | "stripe";
  simulationToken?: string;
}): DepositPaymentProof => {
  const provider =
    input.provider ||
    (input.quotePaymentIntentId.startsWith("sim_") ? "simulated" : "stripe");

  if (provider === "simulated") {
    if (!input.simulationToken) {
      throw new FabricInventoryError(
        "PAYMENT_NOT_CONFIRMED",
        "Simulated payment requires a server-issued simulation token.",
      );
    }
    return {
      provider: "simulated",
      checkoutId: input.checkoutId,
      simulationToken: input.simulationToken,
    };
  }

  if (!input.paymentIntentId) {
    throw new FabricInventoryError(
      "PAYMENT_NOT_CONFIRMED",
      "Stripe paymentIntentId is required.",
    );
  }
  if (input.paymentIntentId !== input.quotePaymentIntentId) {
    throw new FabricInventoryError(
      "PAYMENT_MISMATCH",
      "paymentIntentId does not match the prepared checkout quote.",
    );
  }
  return {
    provider: "stripe",
    paymentIntentId: input.paymentIntentId,
  };
};

export const createConfirmDepositOrderHandler = (
  dependencies: ConfirmDepositOrderHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || getAdminServices;
  const now = dependencies.now || (() => new Date());

  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return setNoStore(res).status(405).json({ error: "Method not allowed." });
    }

    const authorization = getHeader(req, "authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return setNoStore(res).status(401).json({
        error: "Firebase authentication is required.",
        code: "AUTH_REQUIRED",
      });
    }

    try {
      const request = parseConfirmDepositRequest(req.body);
      const services = getServices();
      let token: {
        uid: string;
        firebase?: { sign_in_provider?: string };
      };
      try {
        token = await services.auth.verifyIdToken(authorization.slice(7));
      } catch {
        throw new FabricInventoryError(
          "AUTH_REQUIRED",
          "Firebase authentication could not be verified.",
        );
      }

      const authenticatedUid = assertNonAnonymousAuth(token);
      const quote = await loadDepositCheckoutQuote(services.db, request.checkoutId);
      if (!quote) {
        throw new FabricInventoryError(
          "CHECKOUT_STATE_CONFLICT",
          "Prepared checkout quote was not found.",
        );
      }
      if (quote.ownerUid !== authenticatedUid) {
        throw new FabricInventoryError(
          "ORDER_OWNERSHIP_MISMATCH",
          "This checkout does not belong to the signed-in customer.",
        );
      }
      if (
        request.paymentIntentId &&
        request.paymentIntentId !== quote.paymentIntentId
      ) {
        throw new FabricInventoryError(
          "PAYMENT_MISMATCH",
          "paymentIntentId does not match the prepared checkout quote.",
        );
      }
      const paymentProof = buildPaymentProof({
        checkoutId: quote.checkoutId,
        quotePaymentIntentId: quote.paymentIntentId,
        paymentIntentId: request.paymentIntentId,
        provider: request.provider,
        simulationToken: request.simulationToken,
      });
      const stripeClient = resolveStripe(dependencies.getStripe, paymentProof);
      if (paymentProof.provider === "stripe" && !stripeClient) {
        throw new FabricInventoryError(
          "PAYMENT_NOT_CONFIRMED",
          "Stripe payment verification is unavailable.",
        );
      }

      const result: ConfirmDepositBatchSuccess =
        await confirmDepositCheckoutBatchWithAdminDb({
          db: services.db,
          quote,
          paymentProof,
          authenticatedUid,
          stripe: stripeClient,
          now,
        });

      return setNoStore(res).status(200).json({
        status: result.status,
        checkoutId: result.checkoutId,
        paymentIntentId: result.paymentIntentId,
        idempotent: result.idempotent,
        orderIds: result.orderIds,
        ledgers: result.ledgers,
        checkoutConfirmation: result.checkoutConfirmation,
        quote: result.quote,
      });
    } catch (error) {
      if (error instanceof FabricInventoryError) {
        return setNoStore(res)
          .status(statusForError(error.code))
          .json({
            error: customerMessageForError(error),
            code: error.code,
            affectedFabricCodes: error.affectedFabricCodes,
            affectedOrderIds: error.affectedOrderIds,
          });
      }
      console.error("confirm-deposit failed", error);
      return setNoStore(res).status(503).json({
        error: "Order confirmation is temporarily unavailable.",
        code: "SERVER_ERROR",
      });
    }
  };
};

export const handleConfirmDepositOrder = createConfirmDepositOrderHandler();
