import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  confirmDepositCheckoutBatchWithAdminDb,
  createAdminReservationTransactionRunner,
  loadDepositCheckoutQuote,
  loadInventoryReservation,
} from "./fabricInventoryAdmin.js";
import { releaseInventoryReservation } from "./fabricInventoryReservation.js";
import { assertTrustedDepositPaymentBinding } from "./depositPaymentBinding.js";
import { makePaymentIntentNonPayableBeforeReservationRelease } from "./depositCheckoutLifecycle.js";
import type { DepositCheckoutQuote } from "../utils/depositOrderFingerprint.js";
import type { InventoryReservationRecord } from "./fabricInventoryReservation.js";
import Stripe from "stripe";

type StripeWebhookAdminServices = {
  db: Parameters<typeof confirmDepositCheckoutBatchWithAdminDb>[0]["db"];
};

export interface StripeWebhookHttpDependencies {
  getServices?: () => StripeWebhookAdminServices;
  getStripe?: () => Stripe | null;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  loadQuote?: (
    db: StripeWebhookAdminServices["db"],
    checkoutId: string,
  ) => Promise<DepositCheckoutQuote | null>;
  loadReservation?: (
    db: StripeWebhookAdminServices["db"],
    checkoutId: string,
  ) => Promise<InventoryReservationRecord | null>;
  confirmCheckout?: (
    input: Parameters<typeof confirmDepositCheckoutBatchWithAdminDb>[0],
  ) => Promise<unknown>;
  releaseReservation?: (input: {
    db: StripeWebhookAdminServices["db"];
    checkoutId: string;
    ownerUid: string;
    reason: string;
    now: Date;
  }) => Promise<void>;
}

const getHeader = (req: HttpRequest, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
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

const resolveRawBody = (req: HttpRequest): Buffer | string | null => {
  if (req.rawBody !== undefined && req.rawBody !== null) {
    return req.rawBody;
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return null;
};

const releaseBoundReservation = async (input: {
  db: StripeWebhookAdminServices["db"];
  checkoutId: string;
  ownerUid: string;
  reason: string;
  now: Date;
}): Promise<void> => {
  const run = createAdminReservationTransactionRunner(input.db);
  await run(async (store) => {
    await releaseInventoryReservation({
      store,
      checkoutId: input.checkoutId,
      ownerUid: input.ownerUid,
      reason: input.reason,
      now: input.now,
      requireOwnerMatch: true,
    });
  });
};

const logBindingIgnored = (input: {
  eventType: string;
  paymentIntentId: string;
  reason: string;
  checkoutId?: string | null;
}): void => {
  console.warn("stripe-webhook ignored unsafe binding", {
    eventType: input.eventType,
    paymentIntentId: input.paymentIntentId,
    reason: input.reason,
    checkoutId: input.checkoutId || null,
  });
};

export const createStripeWebhookHandler = (
  dependencies: StripeWebhookHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || getAdminServices;
  const now = dependencies.now || (() => new Date());
  const env = dependencies.env || process.env;
  const loadQuote = dependencies.loadQuote || loadDepositCheckoutQuote;
  const loadReservation =
    dependencies.loadReservation || loadInventoryReservation;
  const confirmCheckout =
    dependencies.confirmCheckout || confirmDepositCheckoutBatchWithAdminDb;
  const releaseReservation =
    dependencies.releaseReservation || releaseBoundReservation;

  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return setNoStore(res).status(405).json({ error: "Method not allowed." });
    }

    const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      return setNoStore(res).status(503).json({
        error: "Stripe webhook secret is not configured.",
        code: "SERVER_ERROR",
      });
    }

    const stripe = resolveStripe(dependencies.getStripe, env);
    if (!stripe) {
      return setNoStore(res).status(503).json({
        error: "Stripe is not configured.",
        code: "SERVER_ERROR",
      });
    }

    const signature = getHeader(req, "stripe-signature");
    if (!signature) {
      return setNoStore(res).status(400).json({
        error: "Missing Stripe signature.",
        code: "INVALID_ORDER",
      });
    }

    const rawBody = resolveRawBody(req);
    if (!rawBody) {
      return setNoStore(res).status(400).json({
        error: "Raw request body is required for webhook verification.",
        code: "INVALID_ORDER",
      });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      console.error("stripe-webhook signature verification failed", error);
      return setNoStore(res).status(400).json({
        error: "Stripe webhook signature verification failed.",
        code: "INVALID_ORDER",
      });
    }

    const services = getServices();
    const clock = now();

    try {
      if (event.type === "payment_intent.succeeded") {
        const intent = event.data.object as Stripe.PaymentIntent;
        const checkoutId =
          typeof intent.metadata?.checkoutId === "string"
            ? intent.metadata.checkoutId.trim()
            : "";
        if (!checkoutId) {
          return setNoStore(res).status(200).json({
            received: true,
            ignored: true,
            reason: "missing_checkoutId_metadata",
          });
        }
        const quote = await loadQuote(services.db, checkoutId);
        const reservation = await loadReservation(services.db, checkoutId);
        const binding = assertTrustedDepositPaymentBinding({
          paymentIntentId: intent.id,
          metadata: intent.metadata || {},
          quote,
          reservation,
          requireActiveReservation: quote?.status !== "CONFIRMED",
        });
        if (binding.ok === false) {
          logBindingIgnored({
            eventType: event.type,
            paymentIntentId: intent.id,
            reason: binding.reason,
            checkoutId,
          });
          return setNoStore(res).status(200).json({
            received: true,
            ignored: true,
            reason: binding.reason,
          });
        }
        await confirmCheckout({
          db: services.db,
          quote: binding.quote,
          paymentProof: {
            provider: "stripe",
            paymentIntentId: intent.id,
          },
          authenticatedUid: binding.quote.ownerUid,
          stripe,
          now,
        });
        return setNoStore(res).status(200).json({
          received: true,
          confirmed: true,
          checkoutId,
        });
      }

      if (
        event.type === "payment_intent.payment_failed" ||
        event.type === "payment_intent.canceled"
      ) {
        const intent = event.data.object as Stripe.PaymentIntent;
        const checkoutId =
          typeof intent.metadata?.checkoutId === "string"
            ? intent.metadata.checkoutId.trim()
            : "";
        if (!checkoutId) {
          return setNoStore(res).status(200).json({
            received: true,
            ignored: true,
            reason: "missing_checkoutId_metadata",
          });
        }

        const quote = await loadQuote(services.db, checkoutId);
        const reservation = await loadReservation(services.db, checkoutId);
        const binding = assertTrustedDepositPaymentBinding({
          paymentIntentId: intent.id,
          metadata: intent.metadata || {},
          quote,
          reservation,
          requireActiveReservation: true,
        });
        if (binding.ok === false) {
          logBindingIgnored({
            eventType: event.type,
            paymentIntentId: intent.id,
            reason: binding.reason,
            checkoutId,
          });
          return setNoStore(res).status(200).json({
            received: true,
            ignored: true,
            reason: binding.reason,
          });
        }

        // payment_failed often leaves requires_payment_method — NEVER release
        // until PI is proven non-payable (cancel succeeds) or already canceled.
        const decision = await makePaymentIntentNonPayableBeforeReservationRelease(
          {
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
            paymentIntentId: intent.id,
          },
        );

        if (decision.outcome === "finalize") {
          await confirmCheckout({
            db: services.db,
            quote: binding.quote,
            paymentProof: {
              provider: "stripe",
              paymentIntentId: intent.id,
            },
            authenticatedUid: binding.quote.ownerUid,
            stripe,
            now,
          });
          return setNoStore(res).status(200).json({
            received: true,
            confirmed: true,
            checkoutId: binding.quote.checkoutId,
          });
        }

        if (decision.outcome === "retain") {
          return setNoStore(res).status(200).json({
            received: true,
            released: false,
            retained: true,
            reason: decision.reason,
            paymentStatus: decision.status,
            checkoutId: binding.quote.checkoutId,
          });
        }

        await releaseReservation({
          db: services.db,
          checkoutId: binding.quote.checkoutId,
          ownerUid: binding.quote.ownerUid,
          reason:
            event.type === "payment_intent.canceled"
              ? "payment_intent_canceled"
              : "payment_intent_failed_canceled",
          now: clock,
        });
        return setNoStore(res).status(200).json({
          received: true,
          released: true,
          checkoutId: binding.quote.checkoutId,
        });
      }

      return setNoStore(res).status(200).json({
        received: true,
        ignored: true,
        type: event.type,
      });
    } catch (error) {
      console.error("stripe-webhook handling failed", error);
      return setNoStore(res).status(503).json({
        error: "Stripe webhook handling failed.",
        code: "SERVER_ERROR",
      });
    }
  };
};

export const handleStripeWebhook = createStripeWebhookHandler();
