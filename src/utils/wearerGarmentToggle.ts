import type {
  AdditionalGarmentConstructionStateV1,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  WearerOrderStateV2,
} from "../types";
import type { MeasurementPhysicalGarment } from "./measurementBlueprint";
import {
  assignGarmentToWearer,
  removeGarmentFromWearerOrder,
  type WearerMutationResult,
} from "./wearerOrder";

/**
 * The live Measurement form bag after an assignment change: the CURRENT
 * selected person's own bag from the updated order (falling back to the first
 * person). Never another person's bag.
 */
export const resolveLiveFormAfterGarmentToggle = (
  order: WearerOrderStateV2,
  activeWearerId: string | null,
): FutureMeasurementStateV1 | null =>
  (order.wearers.find((wearer) => wearer.wearerId === activeWearerId) ||
    order.wearers[0])?.measurement ?? null;

/**
 * Step 7 person-card garment tick / untick. A toggle only changes
 * assignmentByGarmentKey (plus the garment-field strip on the former owner).
 *
 * The live form is re-synced from the updated order for the person selected
 * *right now* (`getActiveWearerId`, read from a ref), not the person selected
 * when the handler was created. A stale id here copied the previously selected
 * person's live form onto whoever was selected in the same event (B1).
 */
export const createWearerGarmentToggleHandlers = ({
  getOrder,
  getActiveWearerId,
  garments,
  garmentTypeSelection,
  additionalGarmentConstructions,
  commitOrder,
  setLiveForm,
}: {
  getOrder: () => WearerOrderStateV2;
  getActiveWearerId: () => string | null;
  garments: readonly MeasurementPhysicalGarment[];
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
  commitOrder: (order: WearerOrderStateV2) => void;
  setLiveForm: (measurement: FutureMeasurementStateV1 | null) => void;
}) => ({
  assign: (garmentKey: string, wearerId: string): WearerMutationResult => {
    const order = getOrder();
    const garment = garments.find((candidate) => candidate.garmentKey === garmentKey);
    if (!garment || !wearerId) {
      return { status: "blocked", code: "WEARER_NOT_FOUND", order };
    }
    const result = assignGarmentToWearer({
      order,
      garmentKey,
      wearerId,
      garment,
      garmentTypeSelection,
      additionalGarmentConstructions,
    });
    if (result.status === "updated") {
      commitOrder(result.order);
      setLiveForm(resolveLiveFormAfterGarmentToggle(result.order, getActiveWearerId()));
    }
    return result;
  },
  unassign: (garmentKey: string): void => {
    const nextOrder = removeGarmentFromWearerOrder(getOrder(), garmentKey);
    commitOrder(nextOrder);
    setLiveForm(resolveLiveFormAfterGarmentToggle(nextOrder, getActiveWearerId()));
  },
});
