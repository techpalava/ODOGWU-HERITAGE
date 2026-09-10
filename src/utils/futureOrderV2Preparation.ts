import type {
  FutureOrderCandidateBlocker,
  FutureOrderCandidateV2,
  FutureOrderCandidateV2BuildResult,
} from "./futureOrderCandidate";
import {
  createFutureOrderCartItemV2,
  createFutureOrderMasterOrderV2,
  type FutureOrderCartItemV2,
  type FutureOrderMasterOrderV2,
} from "./futureOrderV2Storage";
import type { PersistFutureOrderV2Result } from "./futureOrderV2PersistenceContract";

export interface FutureOrderV2PreparationIds {
  readonly cartItemId: string;
  readonly orderId: string;
}

export interface FutureOrderV2PreparationAttempt
  extends FutureOrderV2PreparationIds {
  readonly candidate: FutureOrderCandidateV2;
  readonly cartItem: FutureOrderCartItemV2;
  readonly masterOrder: FutureOrderMasterOrderV2;
}

export type FutureOrderV2ReviewedCandidateResolution =
  | {
      readonly status: "current";
      readonly candidate: FutureOrderCandidateV2;
    }
  | {
      readonly status: "review_refresh_required";
      readonly candidate: FutureOrderCandidateV2;
    }
  | {
      readonly status: "invalid_current";
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    };

export type FutureOrderV2PreparationBuildResult =
  | { readonly status: "valid"; readonly attempt: FutureOrderV2PreparationAttempt }
  | {
      readonly status: "invalid";
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    };

export type FutureOrderV2PreparationOutcome =
  | { readonly status: "authentication_required" }
  | {
      readonly status: "invalid_current";
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    }
  | {
      readonly status: "review_refresh_required";
      readonly candidate: FutureOrderCandidateV2;
    }
  | {
      readonly status: "preparation_invalid";
      readonly candidate: FutureOrderCandidateV2;
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    }
  | {
      readonly status: "prepared";
      readonly attempt: FutureOrderV2PreparationAttempt;
      readonly result: Extract<
        PersistFutureOrderV2Result,
        { readonly status: "created" | "already_persisted" }
      >;
    }
  | {
      readonly status: "persistence_failed";
      readonly attempt: FutureOrderV2PreparationAttempt;
      readonly result: Exclude<
        PersistFutureOrderV2Result,
        { readonly status: "created" | "already_persisted" }
      > | null;
    };

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

export const areFutureOrderV2CandidatesSemanticallyEqual = (
  reviewed: FutureOrderCandidateV2,
  fresh: FutureOrderCandidateV2,
): boolean => stableSerialize(reviewed) === stableSerialize(fresh);

export const resolveFutureOrderV2ReviewedCandidate = ({
  reviewed,
  fresh,
}: {
  reviewed: FutureOrderCandidateV2;
  fresh: FutureOrderCandidateV2BuildResult;
}): FutureOrderV2ReviewedCandidateResolution => {
  if (fresh.status !== "valid") {
    return { status: "invalid_current", blockers: fresh.blockers };
  }
  return areFutureOrderV2CandidatesSemanticallyEqual(reviewed, fresh.candidate)
    ? { status: "current", candidate: fresh.candidate }
    : { status: "review_refresh_required", candidate: fresh.candidate };
};

const createSecureUuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure browser random generation is unavailable.");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${token.slice(0, 4).join("")}-${token.slice(4, 6).join("")}-${token
    .slice(6, 8)
    .join("")}-${token.slice(8, 10).join("")}-${token.slice(10).join("")}`;
};

export const createFutureOrderV2PreparationIds = (
  createUuid: () => string = createSecureUuid,
): FutureOrderV2PreparationIds => ({
  cartItemId: `future-cart-${createUuid()}`,
  orderId: `future-order-${createUuid()}`,
});

export const createFutureOrderV2PreparationAttempt = ({
  candidate,
  ids = createFutureOrderV2PreparationIds(),
}: {
  candidate: FutureOrderCandidateV2;
  ids?: FutureOrderV2PreparationIds;
}): FutureOrderV2PreparationBuildResult => {
  const cart = createFutureOrderCartItemV2({
    candidate,
    metadata: { cartItemId: ids.cartItemId },
  });
  if (cart.status !== "valid") {
    return { status: "invalid", blockers: cart.blockers };
  }
  const masterOrder = createFutureOrderMasterOrderV2({
    cartItem: cart.value,
    metadata: { orderId: ids.orderId },
  });
  if (masterOrder.status !== "valid") {
    return { status: "invalid", blockers: masterOrder.blockers };
  }
  return {
    status: "valid",
    attempt: {
      ...ids,
      candidate,
      cartItem: cart.value,
      masterOrder: masterOrder.value,
    },
  };
};

export const prepareFutureOrderV2Submission = async ({
  reviewed,
  fresh,
  identity,
  existingAttempt = null,
  persist,
}: {
  reviewed: FutureOrderCandidateV2;
  fresh: FutureOrderCandidateV2BuildResult;
  identity: Readonly<{ uid: string; isAnonymous: boolean }> | null;
  existingAttempt?: FutureOrderV2PreparationAttempt | null;
  persist(input: {
    masterOrder: FutureOrderMasterOrderV2;
    customerOwnerUid: string;
  }): Promise<PersistFutureOrderV2Result>;
}): Promise<FutureOrderV2PreparationOutcome> => {
  if (!identity || identity.isAnonymous) {
    return { status: "authentication_required" };
  }
  const reviewedResolution = resolveFutureOrderV2ReviewedCandidate({
    reviewed,
    fresh,
  });
  if (reviewedResolution.status === "invalid_current") {
    return reviewedResolution;
  }
  if (reviewedResolution.status === "review_refresh_required") {
    return reviewedResolution;
  }
  const preparation: FutureOrderV2PreparationBuildResult = existingAttempt
    ? { status: "valid", attempt: existingAttempt }
    : createFutureOrderV2PreparationAttempt({
        candidate: reviewedResolution.candidate,
      });
  if (preparation.status !== "valid") {
    return {
      status: "preparation_invalid",
      candidate: reviewedResolution.candidate,
      blockers: preparation.blockers,
    };
  }
  try {
    const result = await persist({
      masterOrder: preparation.attempt.masterOrder,
      customerOwnerUid: identity.uid,
    });
    return result.status === "created" || result.status === "already_persisted"
      ? { status: "prepared", attempt: preparation.attempt, result }
      : { status: "persistence_failed", attempt: preparation.attempt, result };
  } catch {
    return {
      status: "persistence_failed",
      attempt: preparation.attempt,
      result: null,
    };
  }
};
