import type {
  Batch,
  BusinessSettings,
  CartItem,
  CustomDetailOption,
  Fabric,
  ImmutableUploadedOrderDesignReference,
  MasterOrder,
  StyleCategory,
} from "../types.js";
import { revalidateCartForCheckout } from "../utils/checkoutValidation.js";
import {
  calculateCartPaymentAllocations,
} from "../utils/shippingPricing.js";
import {
  getDepositRatio,
  roundMoney,
} from "../utils/money.js";
import { getPersistableCartItemFabricAllocationsForOrder } from "../utils/fabricAllocationPersistence.js";
import {
  buildCanonicalCheckoutFingerprint,
  buildDepositCheckoutIdFromPrepareKey,
  buildDepositPrepareKey,
  buildSimulationToken,
  type DepositCheckoutQuote,
  type DepositPrepareLookupRecord,
} from "../utils/depositOrderFingerprint.js";
import { validateMasterOrderFabricAllocationsForDeposit } from "./orderFabricAllocationValidation.js";
import {
  isSimulatedDepositPaymentAllowed,
} from "./depositPaymentVerification.js";
import { assertNonAnonymousAuth } from "./fabricInventoryConsumption.js";
import {
  countPhysicalFabricAllocationsByCode,
} from "../utils/fabricInventoryQuantities.js";
import {
  FabricReservationError,
  reserveInventoryForCheckout,
  type InventoryReservationRecord,
} from "./fabricInventoryReservation.js";
import { buildReservationExpiresAt } from "./fabricInventoryReservation.js";
import {
  abortPreparedCheckoutAfterPaymentIntentFailure,
  assertPayablePreparedCheckout,
  bindPaymentIntentToCheckout,
  PayableCheckoutValidationError,
  type AbortPreparedCheckoutStore,
} from "./depositCheckoutLifecycle.js";
import {
  TrustedUploadedDesignTransferError,
  verifyImmutableUploadedOrderReferenceForDeposit,
  type TrustedStorageBucket,
} from "./uploadedDesignTransfer.js";

export const DEPOSIT_CHECKOUT_QUOTES_COLLECTION = "deposit_checkout_quotes";
export const DEPOSIT_PAYMENT_CONFIRMATIONS_COLLECTION =
  "deposit_payment_confirmations";
export const DEPOSIT_PREPARE_LOOKUPS_COLLECTION = "deposit_prepare_lookups";

export class PrepareDepositError extends Error {
  readonly code:
    | "AUTH_REQUIRED"
    | "AUTH_ANONYMOUS_NOT_ALLOWED"
    | "INVALID_ORDER"
    | "INVALID_ORDER_ALLOCATION"
    | "CHECKOUT_STATE_CONFLICT"
    | "PREPARE_IDEMPOTENCY_CONFLICT"
    | "STALE_CHECKOUT"
    | "INSUFFICIENT_STOCK"
    | "FABRIC_UNAVAILABLE"
    | "INVALID_FABRIC_INVENTORY"
    | "PAYMENT_NOT_CONFIRMED"
    | "SERVER_ERROR";
  readonly affectedFabricCodes: string[];

  constructor(
    code: PrepareDepositError["code"],
    message: string,
    options: { affectedFabricCodes?: string[] } = {},
  ) {
    super(message);
    this.name = "PrepareDepositError";
    this.code = code;
    this.affectedFabricCodes = options.affectedFabricCodes ?? [];
  }
}

export type DepositCatalogSnapshot = {
  fabrics: Fabric[];
  styles: StyleCategory[];
  batches: Batch[];
  customDetailCatalog: CustomDetailOption[];
  businessSettings: BusinessSettings;
};

export type StripePaymentIntentCreateResult = {
  id: string;
  clientSecret: string | null;
};

export type PreparedUploadedDesignReferenceInput = {
  sourceKey: string;
  designReferenceId: string;
  orderReference: ImmutableUploadedOrderDesignReference;
};

export type PrepareDepositCheckoutInput = {
  authenticatedUid: string;
  token: { uid?: string; firebase?: { sign_in_provider?: string } };
  cartItems: CartItem[];
  /** Client-scoped prepare attempt id. Never used as a raw Firestore doc id. */
  prepareRequestId: string;
  paymentMethod?: "card" | "ideal";
  idealBank?: string;
  preparedUploadedDesignReferences?: Readonly<
    Record<string, PreparedUploadedDesignReferenceInput>
  >;
  loadCatalogs: () => Promise<DepositCatalogSnapshot>;
  loadPrepareLookup: (
    prepareKey: string,
  ) => Promise<DepositPrepareLookupRecord | null>;
  loadQuote: (checkoutId: string) => Promise<DepositCheckoutQuote | null>;
  loadReservation?: (
    checkoutId: string,
  ) => Promise<InventoryReservationRecord | null>;
  savePrepareLookup: (record: DepositPrepareLookupRecord) => Promise<void>;
  saveQuote: (quote: DepositCheckoutQuote) => Promise<void>;
  storageBucket?: TrustedStorageBucket | null;
  /** Optional override for tests; defaults to revalidateCartForCheckout. */
  validateAndPriceCart?: (input: {
    items: CartItem[];
    catalogs: DepositCatalogSnapshot;
    depositRatio: number;
    preparedUploadedDesignReferences: Record<
      string,
      PreparedUploadedDesignReferenceInput
    >;
  }) => {
    items: CartItem[];
    canProceed: boolean;
    blockers: string[];
    pricing: {
      total: number | null;
      depositDueNow: number | null;
    };
  };
  /** Optional override for tests; defaults to calculateCartPaymentAllocations. */
  allocatePayments?: (input: {
    items: CartItem[];
    pricing: {
      total: number | null;
      depositDueNow: number | null;
    };
    depositRatio: number;
  }) => ReturnType<typeof calculateCartPaymentAllocations>;
  createStripePaymentIntent?: (input: {
    amountCents: number;
    currency: "eur";
    metadata: {
      ownerUid: string;
      checkoutId: string;
      checkoutFingerprint: string;
    };
    idempotencyKey: string;
  }) => Promise<StripePaymentIntentCreateResult>;
  /**
   * Transactional prepare: reserve fabric + persist quote/lookup.
   * Exact retry must reuse without double-reserving.
   */
  runPrepareReservationTransaction?: <T>(
    work: (store: AbortPreparedCheckoutStore & {
      savePrepareLookup: (record: DepositPrepareLookupRecord) => void;
      saveQuote: (quote: DepositCheckoutQuote) => void;
      loadReservation: (
        checkoutId: string,
      ) => Promise<InventoryReservationRecord | null>;
    }) => Promise<T>,
  ) => Promise<T>;
  /**
   * Atomic abort: release ACTIVE reservation + CANCELLED quote in one transaction.
   * Required in production when PI creation fails after reserve.
   */
  abortPreparedCheckoutAfterPaymentIntentFailure?: (input: {
    checkoutId: string;
    ownerUid: string;
    checkoutFingerprint: string;
    reason: string;
  }) => Promise<void>;
  /**
   * Atomic bind of the same paymentIntentId onto quote + reservation.
   * Prepare returns payable secrets only after this succeeds.
   */
  bindPaymentIntentToCheckout?: (input: {
    checkoutId: string;
    paymentIntentId: string;
    clientSecret: string | null;
    paymentProvider: "stripe" | "simulated";
    simulationToken?: string;
  }) => Promise<DepositCheckoutQuote>;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
};

export type PrepareDepositCheckoutResult = {
  quote: DepositCheckoutQuote;
  mode: "stripe" | "simulated";
  clientSecret: string | null;
  publishableKeyRequired: boolean;
  reusedExisting: boolean;
};

const moneyToCents = (value: number): number => Math.round(value * 100);

const requirePrepareRequestId = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(value)) {
    throw new PrepareDepositError(
      "INVALID_ORDER",
      "prepareRequestId must be a stable 8-128 character identifier.",
    );
  }
  return value;
};

/**
 * Strip client monetary/catalogue/weight authority fields before server recomputation.
 */
export const sanitizeCartItemChoices = (item: CartItem): CartItem => {
  const {
    pricingReview: _pricingReview,
    shippingSnapshot: _shippingSnapshot,
    configurationHash: _configurationHash,
    ...rest
  } = item as CartItem & Record<string, unknown>;

  const styleId =
    item.cartDesignSource?.kind === "catalog"
      ? item.cartDesignSource.styleId
      : item.style?.id;

  const deliverySelection = item.deliverySelection
    ? (() => {
        const {
          actualParcelWeightKg: _clientWeight,
          ...deliveryRest
        } = item.deliverySelection;
        return deliveryRest;
      })()
    : undefined;

  return {
    ...rest,
    ...(deliverySelection ? { deliverySelection } : {}),
    style: styleId
      ? ({
          id: styleId,
          name: "",
          description: "",
          gender: "unisex",
          options: [],
        } as StyleCategory)
      : undefined,
    fabric: {
      ...item.fabric,
      price: undefined,
      priceMultiplier: 1,
      stock: undefined,
      stockStatus: "IN_STOCK",
    },
    garment: {
      ...item.garment,
      totalPrice: 0,
      basePrice: 0,
      taxInclusiveDesignSubtotal: undefined,
      checkoutTotal: undefined,
    },
  } as CartItem;
};

const resolveTrustedStyle = (
  item: CartItem,
  styles: StyleCategory[],
): StyleCategory | null => {
  const styleId =
    item.cartDesignSource?.kind === "catalog"
      ? item.cartDesignSource.styleId
      : item.style?.id;
  if (!styleId) return null;
  const trusted = styles.find((style) => style.id === styleId);
  if (!trusted) {
    throw new PrepareDepositError(
      "INVALID_ORDER",
      `Trusted catalogue style ${styleId} was not found.`,
    );
  }
  return trusted;
};

const resolveTrustedFabric = (
  fabricCode: string,
  fabrics: Fabric[],
): Fabric => {
  const trusted = fabrics.find((fabric) => fabric.code === fabricCode);
  if (!trusted) {
    throw new PrepareDepositError(
      "INVALID_ORDER",
      `Trusted Fabric ${fabricCode} was not found.`,
    );
  }
  return { ...trusted };
};

const verifyPreparedUploadedReferences = async (input: {
  cartItems: CartItem[];
  authenticatedUid: string;
  preparedUploadedDesignReferences?: Readonly<
    Record<string, PreparedUploadedDesignReferenceInput>
  >;
  storageBucket?: TrustedStorageBucket | null;
}): Promise<Record<string, PreparedUploadedDesignReferenceInput>> => {
  const verified: Record<string, PreparedUploadedDesignReferenceInput> = {};
  for (const item of input.cartItems) {
    if (item.cartDesignSource?.kind !== "uploaded") continue;
    const candidate = input.preparedUploadedDesignReferences?.[item.id];
    if (!candidate) {
      throw new PrepareDepositError(
        "INVALID_ORDER",
        "Trusted uploaded-design image transfer is required before checkout.",
      );
    }
    if (
      candidate.sourceKey !== item.cartDesignSource.sourceKey ||
      candidate.designReferenceId !==
        item.cartDesignSource.uploadReference.designReferenceId
    ) {
      throw new PrepareDepositError(
        "INVALID_ORDER",
        "Prepared uploaded-design reference does not match the cart item source.",
      );
    }
    if (!input.storageBucket) {
      throw new PrepareDepositError(
        "SERVER_ERROR",
        "Uploaded-design verification storage is unavailable.",
      );
    }
    try {
      const orderReference = await verifyImmutableUploadedOrderReferenceForDeposit({
        authenticatedUid: input.authenticatedUid,
        orderId: candidate.orderReference.orderId,
        designReferenceId: candidate.designReferenceId,
        orderReference: candidate.orderReference,
        draftMimeType: item.cartDesignSource.uploadReference.mimeType,
        draftStoragePath: item.cartDesignSource.uploadReference.storagePath,
        draftOwnerUid: item.cartDesignSource.uploadReference.ownerUid,
        bucket: input.storageBucket,
      });
      verified[item.id] = {
        sourceKey: candidate.sourceKey,
        designReferenceId: candidate.designReferenceId,
        orderReference,
      };
    } catch (error) {
      if (error instanceof TrustedUploadedDesignTransferError) {
        throw new PrepareDepositError(
          "INVALID_ORDER",
          error.message,
        );
      }
      throw error;
    }
  }
  return verified;
};

const buildCanonicalOrders = (input: {
  items: CartItem[];
  authenticatedUid: string;
  checkoutId: string;
  catalogs: DepositCatalogSnapshot;
  paymentMethod?: "card" | "ideal";
  idealBank?: string;
  createdAt: string;
  paymentAllocations: ReturnType<typeof calculateCartPaymentAllocations>;
  verifiedUploadedReferences: Record<string, PreparedUploadedDesignReferenceInput>;
}): MasterOrder[] => {
  const allocationByItem = new Map(
    input.paymentAllocations.map((allocation) => [allocation.itemId, allocation]),
  );

  return input.items.map((item) => {
    const allocation = allocationByItem.get(item.id);
    if (!allocation) {
      throw new PrepareDepositError(
        "INVALID_ORDER",
        `Missing payment allocation for ${item.id}.`,
      );
    }
    const trustedStyle = resolveTrustedStyle(item, input.catalogs.styles);
    const persistableFabricAllocations =
      getPersistableCartItemFabricAllocationsForOrder(item);
    if (!persistableFabricAllocations?.length) {
      throw new PrepareDepositError(
        "INVALID_ORDER_ALLOCATION",
        `Fabric allocations missing for cart item ${item.id}.`,
      );
    }

    const orderId = `${input.checkoutId}-${item.id}`;
    const verifiedUpload = input.verifiedUploadedReferences[item.id];

    const order = {
      ownerUid: input.authenticatedUid,
      customer: {
        ...item.customer,
        ownerUid: input.authenticatedUid,
      },
      ...(trustedStyle ? { style: trustedStyle } : {}),
      ...(item.cartDesignSource?.kind === "uploaded" && verifiedUpload
        ? {
            orderDesignSource: {
              kind: "uploaded" as const,
              sourceKey: item.cartDesignSource.sourceKey,
              displayLabel: item.cartDesignSource.displayLabel,
              fabricCapacityComposition:
                item.cartDesignSource.fabricCapacityComposition.map((spec) => ({
                  ...spec,
                })),
              demographic: item.cartDesignSource.demographic,
              imageState: {
                kind: "immutable_order_asset" as const,
                orderReference: { ...verifiedUpload.orderReference },
              },
            },
          }
        : trustedStyle
          ? {
              orderDesignSource: {
                kind: "catalog" as const,
                sourceKey: trustedStyle.id,
                styleId: trustedStyle.id,
              },
            }
          : {}),
      fabric: resolveTrustedFabric(
        persistableFabricAllocations[0].fabricCode,
        input.catalogs.fabrics,
      ),
      fabricAllocations: persistableFabricAllocations,
      design: item.design,
      garment: {
        ...item.garment,
        checkoutTotal: allocation.orderSubtotal,
      },
      measurements: item.measurements,
      payment: {
        subtotal: allocation.orderSubtotal,
        deposit: allocation.dueNow,
        remaining: allocation.remainingGarmentBalance,
        method:
          input.paymentMethod === "ideal"
            ? "iDEAL Bank Transfer"
            : "Stripe Credit Card",
        date: input.createdAt,
        isPaid: false,
        paymentMethod: input.paymentMethod === "ideal" ? "iDEAL" : "Stripe",
        idealBank: input.paymentMethod === "ideal" ? input.idealBank : undefined,
        secondPaymentStatus: "unpaid" as const,
      },
      shipment: {
        trackingId: orderId,
        status: "Pending Deposit Confirmation",
        currentStage: 0,
        estimatedDeliveryDate: "TBD",
      },
      specialInstructions: item.specialInstructions,
      notesAboutLeftoverFabric: item.notesAboutLeftoverFabric,
      batchType: item.batchType,
      batchName: item.batchName,
      customGroupCode: item.customGroupCode,
      checkoutId: input.checkoutId,
      deliverySelection: item.deliverySelection
        ? (() => {
            const {
              actualParcelWeightKg: _clientWeight,
              ...deliveryRest
            } = item.deliverySelection;
            return deliveryRest;
          })()
        : undefined,
      shippingBreakdown: {
        lagosToEindhovenShipping: allocation.lagosToEindhovenShipping,
        eindhovenToDestinationShipping:
          allocation.eindhovenToDestinationShipping,
        totalShipping: allocation.totalShipping,
        status: "READY" as const,
      },
    } as MasterOrder;

    if (
      item.cartDesignSource?.kind === "uploaded" &&
      verifiedUpload &&
      verifiedUpload.orderReference.orderId !== orderId
    ) {
      throw new PrepareDepositError(
        "INVALID_ORDER",
        "Trusted uploaded-design orderId does not match the prepared checkout order identity.",
      );
    }

    validateMasterOrderFabricAllocationsForDeposit(order, trustedStyle);
    return order;
  });
};

/**
 * Prepare a trusted deposit checkout quote with owner-scoped prepare idempotency.
 */
export const prepareDepositCheckout = async (
  input: PrepareDepositCheckoutInput,
): Promise<PrepareDepositCheckoutResult> => {
  const authenticatedUid = assertNonAnonymousAuth(input.token);
  if (authenticatedUid !== input.authenticatedUid) {
    throw new PrepareDepositError(
      "AUTH_REQUIRED",
      "Authenticated identity mismatch.",
    );
  }
  if (!Array.isArray(input.cartItems) || input.cartItems.length === 0) {
    throw new PrepareDepositError(
      "INVALID_ORDER",
      "At least one cart item is required.",
    );
  }

  const prepareRequestId = requirePrepareRequestId(input.prepareRequestId);
  const prepareKey = buildDepositPrepareKey(authenticatedUid, prepareRequestId);
  const catalogs = await input.loadCatalogs();
  const depositRatio = getDepositRatio(
    catalogs.businessSettings?.pricingSettings?.depositPercentage ?? 50,
  );

  const verifiedUploadedReferences = await verifyPreparedUploadedReferences({
    cartItems: input.cartItems,
    authenticatedUid,
    preparedUploadedDesignReferences: input.preparedUploadedDesignReferences,
    storageBucket: input.storageBucket,
  });

  const choiceItems = input.cartItems.map((item) => {
    const sanitized = sanitizeCartItemChoices(item);
    const trustedStyle = resolveTrustedStyle(item, catalogs.styles);
    const primaryFabricCode =
      item.fabricAllocations?.[0]?.fabricCode || item.fabric?.code;
    if (!primaryFabricCode) {
      throw new PrepareDepositError(
        "INVALID_ORDER",
        "Every cart item requires a Fabric selection.",
      );
    }
    const trustedFabric = resolveTrustedFabric(
      primaryFabricCode,
      catalogs.fabrics,
    );
    const verifiedUpload = verifiedUploadedReferences[item.id];

    return {
      ...sanitized,
      ownerUid: authenticatedUid,
      customer: {
        ...sanitized.customer,
        ownerUid: authenticatedUid,
      },
      style: trustedStyle || undefined,
      fabric: trustedFabric,
      cartDesignSource:
        item.cartDesignSource?.kind === "uploaded" && verifiedUpload
          ? {
              ...item.cartDesignSource,
              // Keep draft uploadReference for source identity matching in validation;
              // immutable order asset is applied when building canonical orders.
            }
          : item.cartDesignSource?.kind === "catalog"
            ? {
                kind: "catalog" as const,
                sourceKey: `catalog:${trustedStyle!.id}`,
                styleId: trustedStyle!.id,
              }
            : trustedStyle
              ? {
                  kind: "catalog" as const,
                  sourceKey: `catalog:${trustedStyle.id}`,
                  styleId: trustedStyle.id,
                }
              : undefined,
    } as CartItem;
  });

  const validation = input.validateAndPriceCart
    ? input.validateAndPriceCart({
        items: choiceItems,
        catalogs,
        depositRatio,
        preparedUploadedDesignReferences: verifiedUploadedReferences,
      })
    : revalidateCartForCheckout(choiceItems, {
        fabrics: catalogs.fabrics,
        styles: catalogs.styles,
        batches: catalogs.batches,
        customDetailCatalog: catalogs.customDetailCatalog,
        businessSettings: catalogs.businessSettings,
        depositRatio,
        allowPendingUploadedDesignTransfer: false,
        preparedUploadedDesignReferences: verifiedUploadedReferences,
      });

  if (
    !validation.canProceed ||
    validation.pricing.total === null ||
    validation.pricing.depositDueNow === null
  ) {
    throw new PrepareDepositError(
      "INVALID_ORDER",
      validation.blockers[0] ||
        "Checkout is not ready for deposit preparation.",
    );
  }

  const paymentAllocations = input.allocatePayments
    ? input.allocatePayments({
        items: validation.items,
        pricing: validation.pricing,
        depositRatio,
      })
    : calculateCartPaymentAllocations(
        validation.items,
        validation.pricing as Parameters<
          typeof calculateCartPaymentAllocations
        >[1],
        depositRatio,
      );

  const existingLookup = await input.loadPrepareLookup(prepareKey);
  let checkoutId: string;
  let existingQuote: DepositCheckoutQuote | null = null;

  if (existingLookup) {
    if (existingLookup.ownerUid !== authenticatedUid) {
      throw new PrepareDepositError(
        "PREPARE_IDEMPOTENCY_CONFLICT",
        "Prepare request identity conflict.",
      );
    }
    existingQuote = await input.loadQuote(existingLookup.checkoutId);
    if (!existingQuote) {
      throw new PrepareDepositError(
        "CHECKOUT_STATE_CONFLICT",
        "Prepare lookup exists without a checkout quote.",
      );
    }
    if (existingQuote.ownerUid !== authenticatedUid) {
      throw new PrepareDepositError(
        "PREPARE_IDEMPOTENCY_CONFLICT",
        "Prepare request identity conflict.",
      );
    }
    checkoutId = existingQuote.checkoutId;
  } else {
    checkoutId = buildDepositCheckoutIdFromPrepareKey(prepareKey);
  }

  const now = input.now ?? (() => new Date());
  const createdAt = existingQuote?.createdAt ?? now().toISOString();

  const canonicalOrders = buildCanonicalOrders({
    items: validation.items,
    authenticatedUid,
    checkoutId,
    catalogs,
    paymentMethod: input.paymentMethod,
    idealBank: input.idealBank,
    createdAt,
    paymentAllocations,
    verifiedUploadedReferences,
  });

  const totalCents = moneyToCents(roundMoney(validation.pricing.total));
  const depositCents = moneyToCents(
    roundMoney(validation.pricing.depositDueNow),
  );
  if (depositCents <= 0) {
    throw new PrepareDepositError(
      "INVALID_ORDER",
      "Canonical deposit must be positive.",
    );
  }

  const canonicalCheckoutFingerprint = buildCanonicalCheckoutFingerprint({
    checkoutId,
    ownerUid: authenticatedUid,
    orders: canonicalOrders,
    totalCents,
    depositCents,
    currency: "eur",
  });

  const quantities = new Map<string, number>();
  for (const order of canonicalOrders) {
    const allocations = getPersistableCartItemFabricAllocationsForOrder({
      fabricAllocations: order.fabricAllocations,
      fabric: order.fabric,
    } as CartItem);
    for (const [code, qty] of countPhysicalFabricAllocationsByCode(
      allocations,
    )) {
      quantities.set(code, (quantities.get(code) || 0) + qty);
    }
  }

  const mapPayableError = (error: unknown): never => {
    if (error instanceof PayableCheckoutValidationError) {
      throw new PrepareDepositError(error.code, error.message);
    }
    throw error;
  };

  const requireReservationLoader = () => {
    if (!input.loadReservation) {
      throw new PrepareDepositError(
        "SERVER_ERROR",
        "Reservation loader is required before creating or returning a PaymentIntent.",
      );
    }
    return input.loadReservation;
  };

  if (existingQuote) {
    if (existingQuote.status === "CONFIRMED") {
      if (
        existingQuote.canonicalCheckoutFingerprint ===
        canonicalCheckoutFingerprint
      ) {
        return {
          quote: existingQuote,
          mode: existingQuote.paymentProvider,
          clientSecret: existingQuote.clientSecret ?? null,
          publishableKeyRequired: existingQuote.paymentProvider === "stripe",
          reusedExisting: true,
        };
      }
      throw new PrepareDepositError(
        "PREPARE_IDEMPOTENCY_CONFLICT",
        "A confirmed checkout quote cannot be overwritten.",
      );
    }
    if (
      existingQuote.status === "CANCELLED" ||
      existingQuote.status === "EXPIRED"
    ) {
      throw new PrepareDepositError(
        "STALE_CHECKOUT",
        `Checkout quote is ${existingQuote.status} and cannot be reused as payable.`,
      );
    }
    if (
      existingQuote.canonicalCheckoutFingerprint !==
      canonicalCheckoutFingerprint
    ) {
      throw new PrepareDepositError(
        "PREPARE_IDEMPOTENCY_CONFLICT",
        "Prepare request was reused with a different canonical checkout payload.",
      );
    }

    // EVERY existing PREPARED quote must validate reservation before PI work.
    const loadReservation = requireReservationLoader();
    const reservation = await loadReservation(checkoutId);
    const payable = (() => {
      try {
        return assertPayablePreparedCheckout({
          quote: existingQuote,
          reservation,
          ownerUid: authenticatedUid,
          checkoutId,
          checkoutFingerprint: canonicalCheckoutFingerprint,
          quantities,
        });
      } catch (error) {
        return mapPayableError(error);
      }
    })();

    if (payable.piMode === "bound") {
      return {
        quote: existingQuote,
        mode: existingQuote.paymentProvider,
        clientSecret: existingQuote.clientSecret ?? null,
        publishableKeyRequired: existingQuote.paymentProvider === "stripe",
        reusedExisting: true,
      };
    }
    // pre_pi + ACTIVE: fall through to resume PaymentIntent creation.
  }

  const env = input.env ?? process.env;
  const allowSimulation = isSimulatedDepositPaymentAllowed(env);
  const clock = now;

  const persistReservedQuote = async (): Promise<DepositCheckoutQuote> => {
    const expiresAt = buildReservationExpiresAt(clock());
    const quote: DepositCheckoutQuote = {
      checkoutId,
      ownerUid: authenticatedUid,
      prepareRequestId,
      prepareKey,
      status: "PREPARED",
      currency: "eur",
      canonicalOrders,
      orderIds: canonicalOrders.map(
        (order) => order.shipment!.trackingId as string,
      ),
      canonicalCheckoutFingerprint,
      totalCents,
      depositCents,
      paymentProvider:
        allowSimulation && !input.createStripePaymentIntent
          ? "simulated"
          : "stripe",
      paymentIntentId: "",
      clientSecret: null,
      createdAt,
      expiresAt,
    };

    if (input.runPrepareReservationTransaction) {
      await input.runPrepareReservationTransaction(async (store) => {
        try {
          await reserveInventoryForCheckout({
            store,
            checkoutId,
            ownerUid: authenticatedUid,
            checkoutFingerprint: canonicalCheckoutFingerprint,
            quantities,
            now: clock(),
            paymentIntentId: null,
          });
        } catch (error) {
          if (error instanceof FabricReservationError) {
            throw new PrepareDepositError(
              error.code === "INSUFFICIENT_STOCK"
                ? "INSUFFICIENT_STOCK"
                : error.code === "FABRIC_UNAVAILABLE"
                  ? "FABRIC_UNAVAILABLE"
                  : error.code === "INVALID_FABRIC_INVENTORY"
                    ? "INVALID_FABRIC_INVENTORY"
                    : "CHECKOUT_STATE_CONFLICT",
              error.message,
              { affectedFabricCodes: error.affectedFabricCodes },
            );
          }
          throw error;
        }
        store.savePrepareLookup({
          prepareKey,
          prepareRequestId,
          ownerUid: authenticatedUid,
          checkoutId,
          canonicalCheckoutFingerprint,
          createdAt,
        });
        store.saveQuote(quote);
      });
    } else {
      await input.savePrepareLookup({
        prepareKey,
        prepareRequestId,
        ownerUid: authenticatedUid,
        checkoutId,
        canonicalCheckoutFingerprint,
        createdAt,
      });
      await input.saveQuote(quote);
    }
    return quote;
  };

  // Step 1: ensure PREPARED + ACTIVE reservation (no PI yet).
  let reservedQuote: DepositCheckoutQuote;
  if (
    existingQuote &&
    existingQuote.status === "PREPARED" &&
    !existingQuote.paymentIntentId
  ) {
    // Crash/resume window: reservation already validated ACTIVE above.
    reservedQuote = existingQuote;
  } else if (!existingQuote) {
    reservedQuote = await persistReservedQuote();
  } else {
    throw new PrepareDepositError(
      "CHECKOUT_STATE_CONFLICT",
      "Prepared checkout is not in a valid pre-PaymentIntent state.",
    );
  }

  // Re-validate immediately before PI creation (covers race after reserve).
  {
    const loadReservation = requireReservationLoader();
    const reservation = await loadReservation(checkoutId);
    try {
      assertPayablePreparedCheckout({
        quote: reservedQuote,
        reservation,
        ownerUid: authenticatedUid,
        checkoutId,
        checkoutFingerprint: canonicalCheckoutFingerprint,
        quantities,
      });
    } catch (error) {
      mapPayableError(error);
    }
  }

  // Step 2: create PaymentIntent only after ACTIVE reservation is proven.
  let paymentProvider: "stripe" | "simulated";
  let paymentIntentId: string;
  let clientSecret: string | null = null;
  let simulationToken: string | undefined;

  const runAtomicAbort = async (reason: string): Promise<void> => {
    if (input.abortPreparedCheckoutAfterPaymentIntentFailure) {
      await input.abortPreparedCheckoutAfterPaymentIntentFailure({
        checkoutId,
        ownerUid: authenticatedUid,
        checkoutFingerprint: canonicalCheckoutFingerprint,
        reason,
      });
      return;
    }
    if (input.runPrepareReservationTransaction) {
      await input.runPrepareReservationTransaction(async (store) => {
        await abortPreparedCheckoutAfterPaymentIntentFailure({
          store: {
            getFabric: (code) => store.getFabric(code),
            getReservation: (id) => store.getReservation(id),
            setReservation: (id, reservation) =>
              store.setReservation(id, reservation),
            updateFabric: (code, patch) => store.updateFabric(code, patch),
            getQuote: async (id) =>
              "getQuote" in store && typeof store.getQuote === "function"
                ? store.getQuote(id)
                : input.loadQuote(id),
            setQuote: (id, quote) => {
              if ("setQuote" in store && typeof store.setQuote === "function") {
                store.setQuote(id, quote);
              } else {
                store.saveQuote(quote);
              }
            },
          },
          checkoutId,
          ownerUid: authenticatedUid,
          checkoutFingerprint: canonicalCheckoutFingerprint,
          reason,
          now: clock(),
        });
      });
      return;
    }
    throw new PrepareDepositError(
      "SERVER_ERROR",
      "Atomic prepare abort is required after PaymentIntent creation failure.",
    );
  };

  try {
    if (allowSimulation && !input.createStripePaymentIntent) {
      paymentProvider = "simulated";
      paymentIntentId = `sim_${checkoutId}`;
      simulationToken = buildSimulationToken({
        checkoutId,
        ownerUid: authenticatedUid,
        checkoutFingerprint: canonicalCheckoutFingerprint,
        depositCents,
      });
    } else {
      if (!input.createStripePaymentIntent) {
        throw new PrepareDepositError(
          "PAYMENT_NOT_CONFIRMED",
          "Stripe PaymentIntent creation is required in this environment.",
        );
      }
      paymentProvider = "stripe";
      const intent = await input.createStripePaymentIntent({
        amountCents: depositCents,
        currency: "eur",
        metadata: {
          ownerUid: authenticatedUid,
          checkoutId,
          checkoutFingerprint: canonicalCheckoutFingerprint,
        },
        idempotencyKey: `deposit_prepare_${checkoutId}`,
      });
      paymentIntentId = intent.id;
      clientSecret = intent.clientSecret;
    }
  } catch (error) {
    try {
      await runAtomicAbort("payment_intent_create_failed");
    } catch (abortError) {
      console.error(
        "prepareDepositCheckout atomic abort failed after PI create failure",
        abortError,
      );
      throw new PrepareDepositError(
        "SERVER_ERROR",
        "PaymentIntent creation failed and checkout cleanup could not complete safely.",
      );
    }
    if (error instanceof PrepareDepositError) throw error;
    throw new PrepareDepositError(
      "PAYMENT_NOT_CONFIRMED",
      error instanceof Error
        ? error.message
        : "Stripe PaymentIntent creation failed.",
    );
  }

  // Step 3: atomically bind the same PI onto quote + reservation, then return.
  let boundQuote: DepositCheckoutQuote;
  try {
    if (input.bindPaymentIntentToCheckout) {
      boundQuote = await input.bindPaymentIntentToCheckout({
        checkoutId,
        paymentIntentId,
        clientSecret,
        paymentProvider,
        simulationToken,
      });
    } else if (input.runPrepareReservationTransaction) {
      const bound = await input.runPrepareReservationTransaction(async (store) =>
        bindPaymentIntentToCheckout({
          store: {
            getFabric: (code) => store.getFabric(code),
            getReservation: (id) => store.getReservation(id),
            setReservation: (id, reservation) =>
              store.setReservation(id, reservation),
            updateFabric: (code, patch) => store.updateFabric(code, patch),
            getQuote: async (id) =>
              "getQuote" in store && typeof store.getQuote === "function"
                ? store.getQuote(id)
                : input.loadQuote(id),
            setQuote: (id, quote) => {
              if ("setQuote" in store && typeof store.setQuote === "function") {
                store.setQuote(id, quote);
              } else {
                store.saveQuote(quote);
              }
            },
          },
          checkoutId,
          ownerUid: authenticatedUid,
          checkoutFingerprint: canonicalCheckoutFingerprint,
          paymentIntentId,
          quantities,
          clientSecret,
          paymentProvider,
          simulationToken,
        }),
      );
      boundQuote = bound.quote;
    } else {
      throw new PrepareDepositError(
        "SERVER_ERROR",
        "Atomic PaymentIntent binding is required before returning payable checkout data.",
      );
    }
  } catch (error) {
    try {
      await runAtomicAbort("payment_intent_bind_failed");
    } catch (abortError) {
      console.error(
        "prepareDepositCheckout atomic abort failed after PI bind failure",
        abortError,
      );
    }
    mapPayableError(error);
    throw new PrepareDepositError(
      "CHECKOUT_STATE_CONFLICT",
      error instanceof Error
        ? error.message
        : "PaymentIntent could not be bound to the checkout reservation.",
    );
  }

  return {
    quote: boundQuote,
    mode: paymentProvider,
    clientSecret: boundQuote.clientSecret ?? null,
    publishableKeyRequired: paymentProvider === "stripe",
    reusedExisting: Boolean(existingQuote),
  };
};

export { buildDepositPrepareKey, buildDepositCheckoutIdFromPrepareKey };
