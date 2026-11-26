import type { DesignSelections } from "../types";
import {
  isCustomerAvailableCustomDetailSelectionGroup,
  resolveShowAdditionalClothesCosts,
} from "../config/GarmentDetailsConfig";
import { resolveShowStudioTraditionalAccessories } from "./decorativePricing";

/**
 * Strips legacy Traditional Accessories from an active, unsubmitted Design
 * Studio draft while Traditional Accessories are separated out of the studio.
 */
export const clearHiddenStudioTraditionalAccessories = (
  designSelections: DesignSelections,
  showTraditionalAccessories?: boolean,
): DesignSelections => {
  if (resolveShowStudioTraditionalAccessories(showTraditionalAccessories)) {
    return designSelections;
  }
  if ((designSelections.accessories?.length ?? 0) === 0) {
    return designSelections;
  }
  return {
    ...designSelections,
    accessories: [],
  };
};

/**
 * Projects persisted compatibility fields into the active customer journey.
 * The raw object remains unchanged so temporarily hidden choices can reactivate.
 */
export const projectActiveCustomerDesignSelections = ({
  designSelections,
  showAdditionalClothesCosts,
  showTraditionalAccessories,
}: {
  designSelections: DesignSelections;
  showAdditionalClothesCosts?: boolean;
  showTraditionalAccessories?: boolean;
}): DesignSelections => {
  const accessoriesCleared = clearHiddenStudioTraditionalAccessories(
    designSelections,
    showTraditionalAccessories,
  );
  const includeAllAdditionalClothesCosts = resolveShowAdditionalClothesCosts(
    showAdditionalClothesCosts,
  );
  if (includeAllAdditionalClothesCosts) return accessoriesCleared;

  const availabilityOptions = { showAdditionalClothesCosts };
  const projectedCustomDetails = accessoriesCleared.customDetails
    ? Object.fromEntries(
      Object.entries(accessoriesCleared.customDetails).filter(([group]) =>
        isCustomerAvailableCustomDetailSelectionGroup(
          group,
          availabilityOptions,
        ),
      ),
    ) as NonNullable<DesignSelections["customDetails"]>
    : undefined;
  const projectedSnapshots = accessoriesCleared.customDetailSnapshots?.filter(
    (snapshot) =>
      isCustomerAvailableCustomDetailSelectionGroup(
        snapshot.selectionGroup,
        availabilityOptions,
      ),
  );
  const dressAdditionalVisible = isCustomerAvailableCustomDetailSelectionGroup(
    "dress_additional",
    availabilityOptions,
  );

  return {
    ...accessoriesCleared,
    ...(accessoriesCleared.hasLining === true && !dressAdditionalVisible
      ? { hasLining: false }
      : {}),
    ...(accessoriesCleared.customDetails
      ? { customDetails: projectedCustomDetails }
      : {}),
    ...(accessoriesCleared.customDetailSnapshots
      ? { customDetailSnapshots: projectedSnapshots }
      : {}),
  };
};
