import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import type { CartItem, ImmutableUploadedOrderDesignReference } from "../types.js";
import {
  assertNonAnonymousAuth,
  FabricInventoryError,
} from "./fabricInventoryConsumption.js";
import {
  createAdminReservationTransactionRunner,
  loadDepositCatalogSnapshot,
  loadDepositCheckoutQuote,
  loadDepositPrepareLookup,
  loadInventoryReservation,
  saveDepositCheckoutQuote,
  saveDepositPrepareLookup,
} from "./fabricInventoryAdmin.js";
import {
  isSimulatedDepositPaymentAllowed,
} from "./depositPaymentVerification.js";
import type { TrustedStorageBucket } from "./uploadedDesignTransfer.js";
import type { PreparedUploadedDesignReferenceInput } from "./prepareDepositCheckout.js";
import Stripe from "stripe";

type PrepareDepositAdminServices = {
  auth: {
    verifyIdToken(token: string): Promise<{
      uid: string;
      firebase?: { sign_in_provider?: string };
    }>;
  };
  db: Parameters<typeof loadDepositCatalogSnapshot>[0];
  storage: { bucket(): TrustedStorageBucket };
};

export interface PrepareDepositOrderHttpDependencies {
  getServices?: () => PrepareDepositAdminServices;
  getStripe?: () => Stripe | null;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

const getHeader = (req: HttpRequest, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
};

const isImmutableOrderReference = (
  value: unknown,
): value is ImmutableUploadedOrderDesignReference => {
  if (!value || typeof value !== "object") return false;
  const reference = value as Record<string, unknown>;
  return (
    typeof reference.orderId === "string" &&
    typeof reference.storagePath === "string" &&
    typeof reference.mimeType === "string" &&
    typeof reference.createdAt === "string"
  );
};

const parsePreparedUploadedDesignReferences = (
  value: unknown,
): Record<string, PreparedUploadedDesignReferenceInput> | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "preparedUploadedDesignReferences must be an object keyed by cart item id.",
    );
  }
  const result: Record<string, PreparedUploadedDesignReferenceInput> = {};
  for (const [itemId, entry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!entry || typeof entry !== "object") {
      throw new FabricInventoryError(
        "INVALID_ORDER",
        "Each prepared uploaded-design reference is invalid.",
      );
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.sourceKey !== "string" ||
      typeof record.designReferenceId !== "string" ||
      !isImmutableOrderReference(record.orderReference)
    ) {
      throw new FabricInventoryError(
        "INVALID_ORDER",
        "Each prepared uploaded-design reference is incomplete.",
      );
    }
    result[itemId] = {
      sourceKey: record.sourceKey,
      designReferenceId: record.designReferenceId,
      orderReference: record.orderReference,
    };
  }
  return result;
};

const parsePrepareDepositRequest = (
  body: unknown,
): {
  cartItems: CartItem[];
  prepareRequestId: string;
  paymentMethod?: "card" | "ideal";
  idealBank?: string;
  preparedUploadedDesignReferences?: Record<
    string,
    PreparedUploadedDesignReferenceInput
  >;
} => {
  if (!body || typeof body !== "object") {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "A prepare-deposit payload is required.",
    );
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.cartItems) || record.cartItems.length === 0) {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "cartItems must be a non-empty array.",
    );
  }
  if (
    typeof record.prepareRequestId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(record.prepareRequestId)
  ) {
    throw new FabricInventoryError(
      "INVALID_ORDER",
      "prepareRequestId must be a stable 8-128 character identifier.",
    );
  }

  const paymentMethod =
    record.paymentMethod === "ideal" || record.paymentMethod === "card"
      ? record.paymentMethod
      : undefined;

  return {
    cartItems: record.cartItems as CartItem[],
    prepareRequestId: record.prepareRequestId,
    paymentMethod,
    idealBank:
      typeof record.idealBank === "string" && record.idealBank.trim()
        ? record.idealBank.trim()
        : undefined,
    preparedUploadedDesignReferences: parsePreparedUploadedDesignReferences(
      record.preparedUploadedDesignReferences,
    ),
  };
};

const statusForError = (code: string): number => {
  switch (code) {
    case "AUTH_REQUIRED":
    case "AUTH_ANONYMOUS_NOT_ALLOWED":
      return 401;
    case "ORDER_OWNERSHIP_MISMATCH":
      return 403;
    case "INSUFFICIENT_STOCK":
    case "FABRIC_UNAVAILABLE":
    case "INVALID_FABRIC_INVENTORY":
    case "PAYMENT_NOT_CONFIRMED":
    case "CHECKOUT_STATE_CONFLICT":
    case "PREPARE_IDEMPOTENCY_CONFLICT":
    case "STALE_CHECKOUT":
      return 409;
    case "INVALID_ORDER":
    case "INVALID_ORDER_ALLOCATION":
      return 400;
    case "SERVER_ERROR":
    default:
      return 503;
  }
};

const customerMessageForError = (error: {
  code: string;
  message: string;
  affectedFabricCodes?: string[];
}): string => {
  switch (error.code) {
    case "AUTH_ANONYMOUS_NOT_ALLOWED":
      return "Sign in with a full customer account to prepare checkout.";
    case "INSUFFICIENT_STOCK":
    case "FABRIC_UNAVAILABLE": {
      const fabrics =
        error.affectedFabricCodes && error.affectedFabricCodes.length > 0
          ? ` Affected: ${error.affectedFabricCodes.join(", ")}.`
          : "";
      return `One or more selected Fabrics no longer have enough available stock.${fabrics} Return to Fabric selection to update your design.`;
    }
    case "INVALID_FABRIC_INVENTORY":
      return "Fabric inventory needs admin review before checkout can continue.";
    case "PAYMENT_NOT_CONFIRMED":
      return "Deposit payment preparation is temporarily unavailable.";
    case "PREPARE_IDEMPOTENCY_CONFLICT":
      return "This checkout preparation request conflicts with an existing prepare attempt.";
    case "STALE_CHECKOUT":
      return "This checkout session is no longer payable. Start a new deposit checkout.";
    case "INVALID_ORDER_ALLOCATION":
      return "Fabric selections on this order are invalid. Return to Fabric selection.";
    default:
      return error.message;
  }
};

const resolveStripe = (
  getStripe: (() => Stripe | null) | undefined,
): Stripe | null => {
  if (getStripe) return getStripe();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === "" || key === "MY_STRIPE_SECRET_KEY") {
    return null;
  }
  return new Stripe(key);
};

const isPrepareDepositErrorLike = (
  error: unknown,
): error is { code: string; message: string; affectedFabricCodes?: string[] } =>
  Boolean(
    error &&
      typeof error === "object" &&
      (error as { name?: unknown }).name === "PrepareDepositError" &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { message?: unknown }).message === "string",
  );

export const createPrepareDepositOrderHandler = (
  dependencies: PrepareDepositOrderHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || getAdminServices;
  const now = dependencies.now || (() => new Date());
  const env = dependencies.env || process.env;

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
      const request = parsePrepareDepositRequest(req.body);
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
      const allowSimulation = isSimulatedDepositPaymentAllowed(env);
      const stripeClient = allowSimulation
        ? null
        : resolveStripe(dependencies.getStripe);

      if (!allowSimulation && !stripeClient) {
        throw new FabricInventoryError(
          "PAYMENT_NOT_CONFIRMED",
          "Stripe PaymentIntent creation is unavailable.",
        );
      }

      const runPrepareReservationTransaction =
        createAdminReservationTransactionRunner(services.db);

      const { prepareDepositCheckout } = await import(
        "./prepareDepositCheckout.js"
      );
      const result = await prepareDepositCheckout({
        authenticatedUid,
        token,
        cartItems: request.cartItems,
        prepareRequestId: request.prepareRequestId,
        paymentMethod: request.paymentMethod,
        idealBank: request.idealBank,
        preparedUploadedDesignReferences:
          request.preparedUploadedDesignReferences,
        loadCatalogs: () => loadDepositCatalogSnapshot(services.db),
        loadPrepareLookup: (prepareKey) =>
          loadDepositPrepareLookup(services.db, prepareKey),
        loadQuote: (checkoutId) =>
          loadDepositCheckoutQuote(services.db, checkoutId),
        loadReservation: (checkoutId) =>
          loadInventoryReservation(services.db, checkoutId),
        savePrepareLookup: (record) =>
          saveDepositPrepareLookup(services.db, record),
        saveQuote: (quote) => saveDepositCheckoutQuote(services.db, quote),
        storageBucket: services.storage.bucket() as unknown as TrustedStorageBucket,
        runPrepareReservationTransaction,
        abortPreparedCheckoutAfterPaymentIntentFailure: async ({
          checkoutId,
          ownerUid,
          checkoutFingerprint,
          reason,
        }) => {
          const { abortPreparedCheckoutAfterPaymentIntentFailure } =
            await import("./depositCheckoutLifecycle.js");
          await runPrepareReservationTransaction(async (store) => {
            await abortPreparedCheckoutAfterPaymentIntentFailure({
              store: {
                getFabric: (code) => store.getFabric(code),
                getReservation: (id) => store.getReservation(id),
                setReservation: (id, reservation) =>
                  store.setReservation(id, reservation),
                updateFabric: (code, patch) => store.updateFabric(code, patch),
                getQuote: (id) => store.getQuote(id),
                setQuote: (id, quote) => store.setQuote(id, quote),
              },
              checkoutId,
              ownerUid,
              checkoutFingerprint,
              reason,
              now: now(),
            });
          });
        },
        bindPaymentIntentToCheckout: async ({
          checkoutId,
          paymentIntentId,
          clientSecret,
          paymentProvider,
          simulationToken,
        }) => {
          const { bindPaymentIntentToCheckout } = await import(
            "./depositCheckoutLifecycle.js"
          );
          const { countPhysicalFabricAllocationsByCode } = await import(
            "../utils/fabricInventoryQuantities.js"
          );
          const { getPersistableCartItemFabricAllocationsForOrder } =
            await import("../utils/fabricAllocationPersistence.js");
          const liveQuote = await loadDepositCheckoutQuote(
            services.db,
            checkoutId,
          );
          if (!liveQuote) {
            throw new FabricInventoryError(
              "CHECKOUT_STATE_CONFLICT",
              "Checkout quote missing during PaymentIntent bind.",
            );
          }
          const quantities = new Map<string, number>();
          for (const order of liveQuote.canonicalOrders) {
            const allocations = getPersistableCartItemFabricAllocationsForOrder({
              fabricAllocations: order.fabricAllocations,
              fabric: order.fabric,
            } as import("../types.js").CartItem);
            for (const [code, qty] of countPhysicalFabricAllocationsByCode(
              allocations || [],
            )) {
              quantities.set(code, (quantities.get(code) || 0) + qty);
            }
          }
          const bound = await runPrepareReservationTransaction(async (store) =>
            bindPaymentIntentToCheckout({
              store: {
                getFabric: (code) => store.getFabric(code),
                getReservation: (id) => store.getReservation(id),
                setReservation: (id, reservation) =>
                  store.setReservation(id, reservation),
                updateFabric: (code, patch) => store.updateFabric(code, patch),
                getQuote: (id) => store.getQuote(id),
                setQuote: (id, quote) => store.setQuote(id, quote),
              },
              checkoutId,
              ownerUid: authenticatedUid,
              checkoutFingerprint: liveQuote.canonicalCheckoutFingerprint,
              paymentIntentId,
              quantities,
              clientSecret,
              paymentProvider,
              simulationToken,
            }),
          );
          return bound.quote;
        },
        ...(stripeClient
          ? {
              createStripePaymentIntent: async (input: {
                amountCents: number;
                currency: "eur";
                metadata: {
                  ownerUid: string;
                  checkoutId: string;
                  checkoutFingerprint: string;
                };
                idempotencyKey: string;
              }) => {
                const intent = await stripeClient.paymentIntents.create(
                  {
                    amount: input.amountCents,
                    currency: input.currency,
                    metadata: input.metadata,
                    automatic_payment_methods: {
                      enabled: true,
                    },
                  },
                  { idempotencyKey: input.idempotencyKey },
                );
                return {
                  id: intent.id,
                  clientSecret: intent.client_secret,
                };
              },
            }
          : {}),
        now,
        env,
      });

      return setNoStore(res).status(200).json({
        checkoutId: result.quote.checkoutId,
        paymentIntentId: result.quote.paymentIntentId,
        clientSecret: result.clientSecret,
        mode: result.mode,
        depositCents: result.quote.depositCents,
        totalCents: result.quote.totalCents,
        canonicalCheckoutFingerprint:
          result.quote.canonicalCheckoutFingerprint,
        reusedExisting: result.reusedExisting,
        ...(result.quote.simulationToken
          ? { simulationToken: result.quote.simulationToken }
          : {}),
      });
    } catch (error) {
      if (
        error instanceof FabricInventoryError ||
        isPrepareDepositErrorLike(error)
      ) {
        return setNoStore(res)
          .status(statusForError(error.code))
          .json({
            error: customerMessageForError(error),
            code: error.code,
            ...(error instanceof FabricInventoryError
              ? {
                  affectedFabricCodes: error.affectedFabricCodes,
                  affectedOrderIds: error.affectedOrderIds,
                }
              : {
                  affectedFabricCodes:
                    "affectedFabricCodes" in error &&
                    Array.isArray(error.affectedFabricCodes)
                      ? error.affectedFabricCodes
                      : [],
                }),
          });
      }
      console.error("prepare-deposit failed", error);
      return setNoStore(res).status(503).json({
        error: "Deposit checkout preparation is temporarily unavailable.",
        code: "SERVER_ERROR",
      });
    }
  };
};

export const handlePrepareDepositOrder = createPrepareDepositOrderHandler();
