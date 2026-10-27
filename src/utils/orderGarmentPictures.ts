import type { Fabric } from "../types.js";
import type { FutureOrderCandidateV2 } from "./futureOrderCandidate.js";
import {
  getFuturePaymentReviewGarmentPictures,
  type FuturePaymentReviewFabricLookup,
  type FuturePaymentReviewGarmentPicture,
} from "./futurePaymentReviewPictures.js";

/**
 * Picture data for saved orders (cart lines and dashboard orders). These
 * surfaces have the stored order candidate but no Studio summary, so fabric
 * swatches come from the already-loaded fabric list (its current picture),
 * matched by fabric id, then by code. No extra reads.
 */
export const createFabricCatalogueLookup = (
  fabrics: readonly Fabric[],
): FuturePaymentReviewFabricLookup => {
  const byId = new Map<string, Fabric>();
  const byCode = new Map<string, Fabric>();
  for (const fabric of fabrics) {
    if (fabric.id && !byId.has(fabric.id)) byId.set(fabric.id, fabric);
    if (fabric.code && !byCode.has(fabric.code)) byCode.set(fabric.code, fabric);
  }
  return ({ fabricId, fabricCode }) => {
    const fabric =
      (fabricId ? byId.get(fabricId) : undefined) ?? byCode.get(fabricCode);
    return fabric
      ? { image: fabric.image ?? null, colorHex: fabric.colorHex ?? null }
      : null;
  };
};

export const getOrderGarmentPictures = (
  candidate: FutureOrderCandidateV2,
  fabrics: readonly Fabric[],
): FuturePaymentReviewGarmentPicture[] =>
  getFuturePaymentReviewGarmentPictures(candidate, null, {
    fabricLookup: createFabricCatalogueLookup(fabrics),
  });
