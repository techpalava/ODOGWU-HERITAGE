import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  assertNonAnonymousAuth,
  FabricInventoryError,
} from "./fabricInventoryConsumption.js";
import {
  createAdminReservationTransactionRunner,
  loadDepositCheckoutQuote,
  loadInventoryReservation,
} from "./fabricInventoryAdmin.js";
import {
  FabricReservationError,
  releaseInventoryReservation,
} from "./fabricInventoryReservation.js";
import { makePaymentIntentNonPayableBeforeReservationRelease } from "./depositCheckoutLifecycle.js";
import type { DepositCheckoutQuote } from "../utils/depositOrderFingerprint.js";
import type {
  InventoryReservationRecord,
  ReservationTransactionStore,
} from "./fabricInventoryReservation.js";
import Stripe from "stripe";

type ReleaseDepositAdminServices = {
  auth: {
    verifyIdToken(token: string): Promise<{
      uid: string;
      firebase?: { sign_in_provider?: string };
    }>;
  };
  db: Parameters<typeof loadInventoryReservation>[0];
};

export interface ReleaseDepositReservationHttpDependencies {
  getServices?: () => ReleaseDepositAdminServices;
  getStripe?: () => Stripe | null;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  loadQuote?: (
    db: ReleaseDepositAdminServices["db"],
    checkoutId: string,
  ) => Promise<DepositCheckoutQuote | null>;
  loadReservation?: (
    db: ReleaseDepositAdminServices["db"],
    checkoutId: string,
  ) => Promise<InventoryReservationRecord | null>;
  runReservationTransaction?: <T>(
    db: ReleaseDepositAdminServices["db"],
    work: (store: ReservationTransactionStore) => Promise<T>,
  ) => Promise<T>;
}

const getHeader = (req: HttpRequest, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
};

const parseReleaseRequest = (body: unknown): { checkoutId: string } => {
  if (!body || typeof body !== "object") {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "A release-deposit-reservation payload is required.",
    );
  }
  const record = body as Record<string, unknown>;
  if (typeof record.checkoutId !== "string" || !record.checkoutId.trim()) {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "checkoutId is required.",
    );
  }
  return { checkoutId: record.checkoutId.trim() };
};

const statusForError = (code: string): number => {
  switch (code) {
    case "AUTH_REQUIRED":
    case "AUTH_ANONYMOUS_NOT_ALLOWED":
      return 401;
    case "RESERVATION_CONFLICT":
    case "ORDER_OWNERSHIP_MISMATCH":
      return 403;
    case "RESERVATION_NOT_FOUND":
      return 404;
    case "RESERVATION_NOT_ACTIVE":
    case "CHECKOUT_STATE_CONFLICT":
    case "PAYMENT_ALREADY_SUCCEEDED":
    case "PAYMENT_PROCESSING":
    case "PAYMENT_REQUIRES_ACTION":
    case "PAYMENT_REQUIRES_CAPTURE":
      return 409;
    case "INVALID_ORDER":
      return 400;
    default:
      return 503;
  }
};

const resolveStripe = (
  getStripe: (() => Stripe | null) | undefined,
  env: NodeJS.ProcessEnv,
): Stripe | null => {
  if (getStripe) return getStripe();
  const key = env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === "" || key === "MY_STRIPE_SECRET_KEY") {
    return null;
  }
  return new Stripe(key);
};

const assertQuoteReservationBinding = (input: {
  checkoutId: string;
  ownerUid: string;
  quote: NonNullable<Awaited<ReturnType<typeof loadDepositCheckoutQuote>>>;
  reservation: NonNullable<
    Awaited<ReturnType<typeof loadInventoryReservation>>
  >;
}): void => {
  if (input.quote.checkoutId !== input.checkoutId) {
    throw new FabricInventoryError(
      "CHECKOUT_STATE_CONFLICT",
      "Checkout quote identity mismatch.",
    );
  }
  if (input.reservation.checkoutId !== input.checkoutId) {
    throw new FabricInventoryError(
      "CHECKOUT_STATE_CONFLICT",
      "Reservation identity mismatch.",
    );
  }
  if (
    input.quote.ownerUid !== input.ownerUid ||
    input.reservation.ownerUid !== input.ownerUid
  ) {
    throw new FabricInventoryError(
      "ORDER_OWNERSHIP_MISMATCH",
      "This reservation does not belong to the signed-in customer.",
    );
  }
  if (
    input.reservation.checkoutFingerprint !==
    input.quote.canonicalCheckoutFingerprint
  ) {
    throw new FabricInventoryError(
      "CHECKOUT_STATE_CONFLICT",
      "Reservation fingerprint does not match the checkout quote.",
    );
  }
  const quotePi =
    typeof input.quote.paymentIntentId === "string" &&
    input.quote.paymentIntentId.trim()
      ? input.quote.paymentIntentId.trim()
      : null;
  const reservationPi =
    typeof input.reservation.paymentIntentId === "string" &&
    input.reservation.paymentIntentId.trim()
      ? input.reservation.paymentIntentId.trim()
      : null;
  if (quotePi !== reservationPi) {
    throw new FabricInventoryError(
      "CHECKOUT_STATE_CONFLICT",
      "Quote and reservation PaymentIntent binding is asymmetric or mismatched.",
    );
  }
};

const blockedReleaseResponse = (
  res: HttpResponse,
  code:
    | "PAYMENT_ALREADY_SUCCEEDED"
    | "PAYMENT_PROCESSING"
    | "PAYMENT_REQUIRES_ACTION"
    | "PAYMENT_REQUIRES_CAPTURE",
  message: string,
) =>
  setNoStore(res).status(409).json({
    error: message,
    code,
  });

export const createReleaseDepositReservationHandler = (
  dependencies: ReleaseDepositReservationHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || getAdminServices;
  const now = dependencies.now || (() => new Date());
  const env = dependencies.env || process.env;
  const loadQuote = dependencies.loadQuote || loadDepositCheckoutQuote;
  const loadReservation =
    dependencies.loadReservation || loadInventoryReservation;
  const runReservationTransaction =
    dependencies.runReservationTransaction ||
    ((db, work) => createAdminReservationTransactionRunner(db)(work));

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
      const request = parseReleaseRequest(req.body);
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
      const existing = await loadReservation(services.db, request.checkoutId);
      if (!existing) {
        // Idempotent: releasing a missing reservation is a no-op success for
        // clients that already cancelled or never prepared.
        return setNoStore(res).status(200).json({
          checkoutId: request.checkoutId,
          released: false,
          idempotent: true,
          status: "NOT_FOUND",
        });
      }
      if (existing.ownerUid !== authenticatedUid) {
        throw new FabricInventoryError(
          "ORDER_OWNERSHIP_MISMATCH",
          "This reservation does not belong to the signed-in customer.",
        );
      }

      if (existing.status === "RELEASED") {
        return setNoStore(res).status(200).json({
          checkoutId: existing.checkoutId,
          released: false,
          idempotent: true,
          status: existing.status,
        });
      }

      const quote = await loadQuote(services.db, request.checkoutId);
      if (!quote) {
        throw new FabricInventoryError(
          "CHECKOUT_STATE_CONFLICT",
          "Checkout quote is required before releasing a reservation.",
        );
      }
      assertQuoteReservationBinding({
        checkoutId: request.checkoutId,
        ownerUid: authenticatedUid,
        quote,
        reservation: existing,
      });

      const paymentIntentId =
        (typeof quote.paymentIntentId === "string" &&
        quote.paymentIntentId.trim()
          ? quote.paymentIntentId.trim()
          : null) ||
        (typeof existing.paymentIntentId === "string" &&
        existing.paymentIntentId.trim()
          ? existing.paymentIntentId.trim()
          : null);

      if (paymentIntentId) {
        const stripe = resolveStripe(dependencies.getStripe, env);
        if (!stripe) {
          return setNoStore(res).status(503).json({
            error: "Stripe is unavailable; reservation cannot be released safely.",
            code: "SERVER_ERROR",
          });
        }

        const decision =
          await makePaymentIntentNonPayableBeforeReservationRelease({
            stripe: {
              retrieve: async (id) => {
                const live = await stripe.paymentIntents.retrieve(id);
                return { id: live.id, status: live.status };
              },
              cancel: async (id) => {
                const canceled = await stripe.paymentIntents.cancel(id);
                return { id: canceled.id, status: canceled.status };
              },
            },
            paymentIntentId,
          });

        if (decision.outcome === "finalize") {
          return blockedReleaseResponse(
            res,
            "PAYMENT_ALREADY_SUCCEEDED",
            "Deposit payment already succeeded. Finalize the checkout instead of releasing.",
          );
        }
        if (decision.outcome === "retain") {
          if (decision.status === "processing") {
            return blockedReleaseResponse(
              res,
              "PAYMENT_PROCESSING",
              "Deposit payment is still processing. Wait before releasing inventory.",
            );
          }
          if (decision.status === "requires_action") {
            return blockedReleaseResponse(
              res,
              "PAYMENT_REQUIRES_ACTION",
              "Deposit payment still requires customer action. Complete or cancel payment first.",
            );
          }
          if (decision.status === "requires_capture") {
            return blockedReleaseResponse(
              res,
              "PAYMENT_REQUIRES_CAPTURE",
              "Deposit payment requires capture and cannot release inventory.",
            );
          }
          return setNoStore(res).status(409).json({
            error: `PaymentIntent status ${decision.status} blocks reservation release (${decision.reason}).`,
            code: "CHECKOUT_STATE_CONFLICT",
          });
        }
      }

      const result = await runReservationTransaction(services.db, async (store) =>
        releaseInventoryReservation({
          store,
          checkoutId: request.checkoutId,
          ownerUid: authenticatedUid,
          reason: "customer_cancelled",
          now: now(),
          requireOwnerMatch: true,
        }),
      );

      return setNoStore(res).status(200).json({
        checkoutId: result.reservation.checkoutId,
        released: result.released,
        idempotent: result.idempotent,
        status: result.reservation.status,
      });
    } catch (error) {
      if (error instanceof FabricInventoryError) {
        return setNoStore(res).status(statusForError(error.code)).json({
          error: error.message,
          code: error.code,
        });
      }
      if (error instanceof FabricReservationError) {
        return setNoStore(res).status(statusForError(error.code)).json({
          error: error.message,
          code: error.code,
          affectedFabricCodes: error.affectedFabricCodes,
        });
      }
      console.error("release-deposit-reservation failed", error);
      return setNoStore(res).status(503).json({
        error: "Reservation release is temporarily unavailable.",
        code: "SERVER_ERROR",
      });
    }
  };
};

export const handleReleaseDepositReservation =
  createReleaseDepositReservationHandler();
