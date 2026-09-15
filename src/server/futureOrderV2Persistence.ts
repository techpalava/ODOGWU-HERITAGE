import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { CanonicalOrderIdentity } from "../utils/orderContextIdentity.js";
import {
  FUTURE_ORDER_V2_COLLECTION,
  createPersistedFutureOrderV2,
  hasSameFutureOrderV2ImmutableBusinessValue,
  parsePersistedFutureOrderV2,
  type FutureOrderV2PersistenceAdapter,
  type FutureOrderV2PersistenceRequest,
  type PersistFutureOrderV2Result,
  type PersistedFutureOrderV2,
} from "../utils/futureOrderV2PersistenceContract.js";
import {
  createServerVerifiedFutureOrderV2PricingAuthority,
  hasPricingAuthorityForExactFutureOrderV2,
  parsePersistedFutureOrderV2PricingAuthority,
  type FutureOrderV2PricingAuthoritySource,
} from "./futureOrderV2PricingAuthority.js";

export type FutureOrderV2ServerErrorCode =
  | "AUTH_REQUIRED"
  | "ANONYMOUS_NOT_ALLOWED"
  | "OWNER_MISMATCH"
  | "ORDER_ID_UNAVAILABLE"
  | "PRIVATE_BATCH_UNAUTHORIZED"
  | "PRIVATE_BATCH_UNAVAILABLE"
  | "PRICING_AUTHORITY_UNAVAILABLE";

export class FutureOrderV2ServerError extends Error {
  readonly code: FutureOrderV2ServerErrorCode;

  constructor(code: FutureOrderV2ServerErrorCode, message: string) {
    super(message);
    this.name = "FutureOrderV2ServerError";
    this.code = code;
  }
}

export interface VerifiedFutureOrderV2Identity {
  readonly uid: string;
  readonly isAnonymous: boolean;
}

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;

const getExistingOwnerUid = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ownerUid = (value as Record<string, unknown>).ownerUid;
  return hasText(ownerUid) ? ownerUid : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isGroupOrderIdentity = (
  value: CanonicalOrderIdentity | undefined,
): value is Extract<
  CanonicalOrderIdentity,
  { orderType: "Group Organizer" | "Group Member" }
> =>
  value?.orderType === "Group Organizer" || value?.orderType === "Group Member";

export const createAdminFutureOrderV2PersistenceAdapter = (
  db: Firestore,
): FutureOrderV2PersistenceAdapter => ({
  runTransaction: (operation) =>
    db.runTransaction(async (adminTransaction) =>
      operation({
        async get(orderId) {
          const snapshot = await adminTransaction.get(
            db.collection(FUTURE_ORDER_V2_COLLECTION).doc(orderId),
          );
          return snapshot.exists ? snapshot.data() : null;
        },
        create(orderId, value) {
          adminTransaction.create(
            db.collection(FUTURE_ORDER_V2_COLLECTION).doc(orderId),
            {
              ...value,
              persistedAt: Timestamp.fromDate(new Date(value.persistedAt)),
            },
          );
        },
        async getPricingAuthority(orderId) {
          const snapshot = await adminTransaction.get(
            db
              .collection(FUTURE_ORDER_V2_COLLECTION)
              .doc(orderId)
              .collection("pricingAuthority")
              .doc("current"),
          );
          return snapshot.exists ? snapshot.data() : null;
        },
        createPricingAuthority(orderId, value) {
          const authority = value as { createdAt?: string };
          adminTransaction.create(
            db
              .collection(FUTURE_ORDER_V2_COLLECTION)
              .doc(orderId)
              .collection("pricingAuthority")
              .doc("current"),
            {
              ...authority,
              ...(authority.createdAt
                ? { createdAt: Timestamp.fromDate(new Date(authority.createdAt)) }
                : {}),
            },
          );
        },
        async assertGroupOrderIdentity(identity, uid) {
          const groupReference = db.collection("customGroups").doc(identity.batchId);
          const groupSnapshot = await adminTransaction.get(groupReference);
          const group = groupSnapshot.exists ? groupSnapshot.data() : null;
          if (
            !isRecord(group) ||
            (group.visibility !== "PRIVATE" && group.visibility !== "PUBLIC") ||
            group.batchId !== identity.batchId
          ) {
            throw new FutureOrderV2ServerError(
              "PRIVATE_BATCH_UNAVAILABLE",
              "The retained Private Batch is unavailable.",
            );
          }
          // Released PUBLIC personalized groups are deliberately discoverable
          // and have no private membership authority. Members retain that
          // established public route; an Organizer still honours a durable
          // public owner UID where the record has one. Historical public
          // records without a UID retain their previous compatibility path.
          if (group.visibility === "PUBLIC") {
            if (
              identity.orderType === "Group Organizer" &&
              hasText(group.ownerUid) &&
              group.ownerUid !== uid
            ) {
              throw new FutureOrderV2ServerError(
                "PRIVATE_BATCH_UNAUTHORIZED",
                "The authenticated customer does not own this personalized group.",
              );
            }
            return;
          }
          if (identity.orderType === "Group Organizer") {
            if (group.ownerUid !== uid) {
              throw new FutureOrderV2ServerError(
                "PRIVATE_BATCH_UNAUTHORIZED",
                "The authenticated customer no longer owns this Private Batch.",
              );
            }
            return;
          }
          const membershipSnapshot = await adminTransaction.get(
            groupReference.collection("privateBatchMembers").doc(uid),
          );
          const membership = membershipSnapshot.exists
            ? membershipSnapshot.data()
            : null;
          if (
            !isRecord(membership) ||
            membership.memberUid !== uid ||
            membership.groupId !== identity.batchId ||
            membership.role !== "member"
          ) {
            throw new FutureOrderV2ServerError(
              "PRIVATE_BATCH_UNAUTHORIZED",
              "The authenticated customer is not an authorized Private Batch member.",
            );
          }
        },
      }),
    ),
});

export const createAdminFutureOrderV2PricingAuthoritySource = (
  db: Firestore,
): FutureOrderV2PricingAuthoritySource => ({
  async getStyle(styleId) {
    const snapshot = await db.collection("styles").doc(styleId).get();
    return snapshot.exists ? snapshot.data() : null;
  },
});

export const persistFutureOrderV2ForVerifiedIdentity = async ({
  identity,
  request,
  adapter,
  pricingAuthoritySource,
  now = () => new Date(),
}: {
  identity: VerifiedFutureOrderV2Identity;
  request: FutureOrderV2PersistenceRequest;
  adapter: FutureOrderV2PersistenceAdapter;
  pricingAuthoritySource?: FutureOrderV2PricingAuthoritySource;
  now?: () => Date;
}): Promise<PersistFutureOrderV2Result> => {
  if (!hasText(identity.uid)) {
    throw new FutureOrderV2ServerError(
      "AUTH_REQUIRED",
      "Firebase authentication is required.",
    );
  }
  if (identity.isAnonymous) {
    throw new FutureOrderV2ServerError(
      "ANONYMOUS_NOT_ALLOWED",
      "Anonymous accounts cannot persist historical orders.",
    );
  }
  if (request.customerOwnerUid !== identity.uid) {
    throw new FutureOrderV2ServerError(
      "OWNER_MISMATCH",
      "The authenticated owner does not match this order request.",
    );
  }

  const proposed = createPersistedFutureOrderV2({
    masterOrder: request.masterOrder,
    owner: { uid: identity.uid, isAnonymous: false },
    customerOwnerUid: identity.uid,
    persistedAt: now().toISOString(),
  });
  if (proposed.status !== "valid") return proposed;
  const proposedPricingAuthority = request.pricingAuthorityInput
    ? await createServerVerifiedFutureOrderV2PricingAuthority({
        masterOrder: proposed.value.masterOrder,
        ownerUid: identity.uid,
        input: request.pricingAuthorityInput,
        source: pricingAuthoritySource,
        now,
      })
    : null;

  return adapter.runTransaction(async (transaction) => {
    const orderIdentity = proposed.value.masterOrder.cartItem.candidate.orderIdentity;
    if (isGroupOrderIdentity(orderIdentity)) {
      if (!transaction.assertGroupOrderIdentity) {
        throw new FutureOrderV2ServerError(
          "PRIVATE_BATCH_UNAVAILABLE",
          "Private Batch authorization is unavailable for this order.",
        );
      }
      await transaction.assertGroupOrderIdentity(orderIdentity, identity.uid);
    }
    const existingValue = await transaction.get(proposed.value.orderId);
    if (existingValue === null) {
      if (proposedPricingAuthority) {
        if (!transaction.createPricingAuthority) {
          throw new FutureOrderV2ServerError(
            "PRICING_AUTHORITY_UNAVAILABLE",
            "Pricing-authority persistence is unavailable for this order.",
          );
        }
        transaction.createPricingAuthority(
          proposed.value.orderId,
          proposedPricingAuthority,
        );
      }
      transaction.create(proposed.value.orderId, proposed.value);
      return { status: "created" as const, value: proposed.value };
    }

    const existingOwnerUid = getExistingOwnerUid(existingValue);
    if (!existingOwnerUid || existingOwnerUid !== identity.uid) {
      throw new FutureOrderV2ServerError(
        "ORDER_ID_UNAVAILABLE",
        "The requested order ID is unavailable.",
      );
    }

    const existing = parsePersistedFutureOrderV2(
      existingValue,
      proposed.value.orderId,
    );
    if (existing.status !== "valid") {
      return {
        status: "conflict" as const,
        code: "EXISTING_ORDER_V2_INVALID" as const,
      };
    }
    if (
      hasSameFutureOrderV2ImmutableBusinessValue(
        existing.value,
        proposed.value,
      )
    ) {
      if (proposedPricingAuthority) {
        if (!transaction.getPricingAuthority || !transaction.createPricingAuthority) {
          throw new FutureOrderV2ServerError(
            "PRICING_AUTHORITY_UNAVAILABLE",
            "Pricing-authority persistence is unavailable for this order.",
          );
        }
        const existingAuthorityValue = await transaction.getPricingAuthority(
          proposed.value.orderId,
        );
        if (existingAuthorityValue === null) {
          const historicalOrderHasMissingOrderLevelContext =
            existing.value.masterOrder.cartItem.candidate.customDetails.some(
              (detail) =>
                detail.garmentKey === "order" &&
                detail.selectionGroup === "order_optional_detail",
            );
          if (
            historicalOrderHasMissingOrderLevelContext ||
            proposedPricingAuthority.orderLevelPricing !== null
          ) {
            return {
              status: "invalid" as const,
              code: "PRICING_AUTHORITY_MISSING",
              message:
                "This historical order is missing server-verifiable order-level pricing context.",
            };
          }
          transaction.createPricingAuthority(
            proposed.value.orderId,
            proposedPricingAuthority,
          );
        } else {
          const existingAuthority = parsePersistedFutureOrderV2PricingAuthority(
            existingAuthorityValue,
            proposed.value.orderId,
          );
          if (
            existingAuthority.status !== "valid" ||
            !hasPricingAuthorityForExactFutureOrderV2({
              authority: existingAuthority.value,
              masterOrder: proposed.value.masterOrder,
              ownerUid: identity.uid,
            })
          ) {
            return {
              status: "invalid" as const,
              code: "PRICING_AUTHORITY_CONFLICT",
              message:
                "The pricing authority does not match this immutable order.",
            };
          }
        }
      }
      return {
        status: "already_persisted" as const,
        value: existing.value,
      };
    }
    return {
      status: "conflict" as const,
      code: "ORDER_ID_PAYLOAD_CONFLICT" as const,
    };
  });
};

export const isPersistedFutureOrderV2 = (
  value: unknown,
): value is PersistedFutureOrderV2 =>
  parsePersistedFutureOrderV2(value).status === "valid";
