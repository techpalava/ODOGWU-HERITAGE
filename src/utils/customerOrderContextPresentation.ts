import type { Batch, OrderContext } from "../types";
import { getCanonicalOrderIdentity } from "./orderContextIdentity";

export interface CustomerOrderContextPresentation {
  readonly kind: "community" | "individual";
  readonly studioLabel: "Community Order" | "Individual Order";
  readonly detailsOrderType: "Community Batch" | "Individual Order";
  readonly batchName: string | null;
}

const getDisplayText = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const normalized = value.trim();
  return normalized === "No Active Batch" ||
    normalized === "Saved order requires recovery"
    ? null
    : normalized;
};

/**
 * Customer-facing context follows the order's canonical identity. A Community
 * order looks up its own retained batch ID and never asks the homepage resolver
 * which batch is currently open for registration.
 */
export const resolveCustomerOrderContextPresentation = (
  context: Pick<OrderContext, "orderType" | "batchId" | "batchName"> | null | undefined,
  batches: readonly Pick<Batch, "id" | "name">[],
): CustomerOrderContextPresentation => {
  const identity = getCanonicalOrderIdentity(context);
  if (identity?.orderType === "Individual" || context?.orderType === "Individual") {
    return {
      kind: "individual",
      studioLabel: "Individual Order",
      detailsOrderType: "Individual Order",
      batchName: null,
    };
  }

  const retainedBatch =
    identity?.orderType === "Community"
      ? batches.find((batch) => batch.id === identity.batchId)
      : undefined;

  return {
    kind: "community",
    studioLabel: "Community Order",
    detailsOrderType: "Community Batch",
    batchName: getDisplayText(retainedBatch?.name) ?? getDisplayText(context?.batchName),
  };
};
