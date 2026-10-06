import type { FutureOrderCandidateV2 } from "./futureOrderCandidate";
import {
  createFutureOrderV2PreparationIds,
  getFutureOrderV2CandidateFingerprint,
} from "./futureOrderV2Preparation";
import {
  createFutureOrderCartItemV2,
  parseFutureOrderCartItemV2,
  type FutureOrderCartItemV2,
} from "./futureOrderV2Storage";

export type ParkFutureOrderV2CandidateResult =
  | {
      readonly status: "added";
      readonly items: readonly FutureOrderCartItemV2[];
      readonly cartItemId: string;
    }
  | {
      readonly status: "already_present";
      readonly items: readonly FutureOrderCartItemV2[];
      readonly cartItemId: string;
    }
  | {
      readonly status: "blocked";
      readonly items: readonly FutureOrderCartItemV2[];
      readonly reason: "not_reviewable" | "invalid_cart_item";
    };

export const isReviewableFutureOrderV2CandidateForCart = (
  candidate: FutureOrderCandidateV2,
): boolean =>
  candidate.schemaVersion === 2 &&
  candidate.contentStatus === "reviewable" &&
  candidate.pricing.status === "exact";

export const sanitizeFutureOrderV2CartItems = (
  value: unknown,
): FutureOrderCartItemV2[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: FutureOrderCartItemV2[] = [];
  value.forEach((entry) => {
    const parsed = parseFutureOrderCartItemV2(entry);
    if (parsed.status !== "valid") return;
    const fingerprint = getFutureOrderV2CandidateFingerprint(
      parsed.value.candidate,
    );
    if (seen.has(fingerprint) || seen.has(parsed.value.cartItemId)) return;
    seen.add(fingerprint);
    seen.add(parsed.value.cartItemId);
    items.push(parsed.value);
  });
  return items;
};

const findMatchingCartItemId = (
  items: readonly FutureOrderCartItemV2[],
  candidate: FutureOrderCandidateV2,
): string | null => {
  const fingerprint = getFutureOrderV2CandidateFingerprint(candidate);
  const match = items.find(
    (item) =>
      getFutureOrderV2CandidateFingerprint(item.candidate) === fingerprint,
  );
  return match?.cartItemId ?? null;
};

export const parkReviewableFutureOrderV2Candidate = ({
  candidate,
  items,
  createCartItemId = () => createFutureOrderV2PreparationIds().cartItemId,
}: {
  candidate: FutureOrderCandidateV2;
  items: readonly FutureOrderCartItemV2[];
  createCartItemId?: () => string;
}): ParkFutureOrderV2CandidateResult => {
  const sanitized = sanitizeFutureOrderV2CartItems(items);
  if (!isReviewableFutureOrderV2CandidateForCart(candidate)) {
    return { status: "blocked", items: sanitized, reason: "not_reviewable" };
  }
  const existingId = findMatchingCartItemId(sanitized, candidate);
  if (existingId) {
    return {
      status: "already_present",
      items: sanitized,
      cartItemId: existingId,
    };
  }
  const created = createFutureOrderCartItemV2({
    candidate,
    metadata: { cartItemId: createCartItemId() },
  });
  if (created.status !== "valid") {
    return { status: "blocked", items: sanitized, reason: "invalid_cart_item" };
  }
  return {
    status: "added",
    items: [...sanitized, created.value],
    cartItemId: created.value.cartItemId,
  };
};

export const dropMatchingFutureOrderV2CartItems = ({
  items,
  candidate,
  cartItemId,
}: {
  items: readonly FutureOrderCartItemV2[];
  candidate?: FutureOrderCandidateV2 | null;
  cartItemId?: string | null;
}): FutureOrderCartItemV2[] => {
  const fingerprint = candidate
    ? getFutureOrderV2CandidateFingerprint(candidate)
    : null;
  return sanitizeFutureOrderV2CartItems(items).filter((item) => {
    if (cartItemId && item.cartItemId === cartItemId) return false;
    if (
      fingerprint &&
      getFutureOrderV2CandidateFingerprint(item.candidate) === fingerprint
    ) {
      return false;
    }
    return true;
  });
};

export const mergeFutureOrderV2CartBags = ({
  accountItems,
  guestItems,
}: {
  accountItems: readonly FutureOrderCartItemV2[];
  guestItems: readonly FutureOrderCartItemV2[];
}): { items: FutureOrderCartItemV2[]; addedItemCount: number } => {
  const merged = sanitizeFutureOrderV2CartItems(accountItems);
  const seen = new Set(
    merged.map((item) => getFutureOrderV2CandidateFingerprint(item.candidate)),
  );
  let addedItemCount = 0;
  sanitizeFutureOrderV2CartItems(guestItems).forEach((item) => {
    const fingerprint = getFutureOrderV2CandidateFingerprint(item.candidate);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    merged.push(item);
    addedItemCount += 1;
  });
  return { items: merged, addedItemCount };
};

export const getFutureOrderV2CartLineLabel = (
  item: FutureOrderCartItemV2,
): string => {
  const labels = item.candidate.occurrenceStyleSnapshots.map((snapshot) =>
    snapshot.occurrence.label.trim(),
  );
  const unique = labels.filter(
    (label, index) => label.length > 0 && labels.indexOf(label) === index,
  );
  return unique.length > 0 ? unique.join(" · ") : "Made-to-measure order";
};

export const getFutureOrderV2CartLineTotalCents = (
  item: FutureOrderCartItemV2,
): number | null =>
  item.candidate.pricing.status === "exact"
    ? item.candidate.pricing.exactTotalCents
    : null;
