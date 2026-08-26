import type { Fabric } from "../types";
import { resolveFabricPrice } from "./fabricPricing";

/** Shared Fabric catalogue availability copy used by Step 2 and Step 4 pickers. */
export const getFabricAvailabilityMessage = (fabric: Fabric): string | null => {
  if (fabric.stockStatus === "OUT_OF_STOCK") {
    return "Currently out of stock.";
  }
  if (fabric.stockStatus === "HIDDEN") {
    return "This fabric is no longer available.";
  }
  if (resolveFabricPrice(fabric) === null) {
    return "Price needs catalogue review before selection.";
  }
  return null;
};

/** True when a Fabric may be newly selected (same rules as catalogue SELECT). */
export const isFabricAvailableForCustomerSelection = (
  fabric: Fabric | null | undefined,
): boolean =>
  Boolean(fabric) && getFabricAvailabilityMessage(fabric as Fabric) === null;

export const hasUsableFabricImage = (
  fabric: Fabric | null | undefined,
): boolean =>
  typeof fabric?.image === "string" && fabric.image.trim().length > 0;
