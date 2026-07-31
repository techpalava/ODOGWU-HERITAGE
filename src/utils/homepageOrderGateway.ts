import type { Batch } from "../types";
import { getCurrentRegistrationBatch } from "./batchUtils";
import { BATCH_MINIMUM_GARMENTS } from "./shippingPricing";

export interface HomepageOrderGatewayState {
  joinBatch: Batch | null;
  minimumGarments: number;
}

export function getHomepageOrderGatewayState(
  batches: Batch[],
  now: Date = new Date(),
): HomepageOrderGatewayState {
  return {
    joinBatch: getCurrentRegistrationBatch(batches, now) || null,
    minimumGarments: BATCH_MINIMUM_GARMENTS,
  };
}
