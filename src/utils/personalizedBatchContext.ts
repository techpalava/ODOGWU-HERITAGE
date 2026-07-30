import type { OrderContext } from "../types";

export interface PersonalizedBatchShippingContext {
  batchId: string;
  batchName: string;
  plannedGarmentCapacity: number;
}

export interface PersonalizedBatchContextResult {
  context: PersonalizedBatchShippingContext | null;
  error: string | null;
}

export const resolvePersonalizedBatchShippingContext = (
  orderContext: OrderContext,
  customGroupCode: string,
): PersonalizedBatchContextResult => {
  const isPersonalizedOrder =
    orderContext.orderType === "Group Organizer" ||
    orderContext.orderType === "Group Member";

  if (!isPersonalizedOrder) {
    return {
      context: null,
      error:
        "Start or join a personalized group before placing this order.",
    };
  }

  const batchId = (
    customGroupCode ||
    orderContext.batchId ||
    ""
  ).trim();
  const plannedGarmentCapacity = Number(orderContext.expectedParticipants);

  if (!batchId) {
    return {
      context: null,
      error:
        "This personalized group has no group code. Complete the group setup before placing this order.",
    };
  }

  if (
    !Number.isFinite(plannedGarmentCapacity) ||
    plannedGarmentCapacity <= 0
  ) {
    return {
      context: null,
      error:
        "This personalized group has no planned garment capacity. Complete the group setup before placing this order.",
    };
  }

  return {
    context: {
      batchId,
      batchName: (orderContext.batchName || batchId).trim(),
      plannedGarmentCapacity: Math.ceil(plannedGarmentCapacity),
    },
    error: null,
  };
};
