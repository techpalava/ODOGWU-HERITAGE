import type { Batch } from "../types";

/** The Home "Start Your Order" section, which shows the open or closed batch card. */
export const HOMEPAGE_ORDER_GATEWAY_ANCHOR_ID = "homepage-order-gateway";

export type FooterBatchLinkTarget =
  | { readonly kind: "join-batch"; readonly batch: Batch }
  | { readonly kind: "home-order-gateway" };

export interface FooterBatchLink {
  readonly label: string;
  readonly target: FooterBatchLinkTarget;
}

/**
 * Footer "Join Current Batch" target. `joinBatch` must be the same batch the
 * Home open-batch card joins (App passes the value it gives HomeView), so the
 * footer and Home always agree. While batches load, or when none is open, the
 * link opens Home's order section instead, which shows the loading or closed
 * state. The label stays the same in every state, so it never flashes.
 */
export function resolveFooterBatchLink({
  hasLoadedBatches,
  joinBatch,
}: {
  hasLoadedBatches: boolean;
  joinBatch: Batch | null | undefined;
}): FooterBatchLink {
  const label = "Join Current Batch";
  if (hasLoadedBatches && joinBatch) {
    return { label, target: { kind: "join-batch", batch: joinBatch } };
  }
  return { label, target: { kind: "home-order-gateway" } };
}
