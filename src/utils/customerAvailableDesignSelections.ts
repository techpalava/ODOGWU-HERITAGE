import type { DesignSelections } from "../types";
import {
  isCustomerAvailableCustomDetailSelectionGroup,
  resolveShowAdditionalClothesCosts,
} from "../config/GarmentDetailsConfig";

/**
 * Projects persisted compatibility fields into the active customer journey.
 * The raw object remains unchanged so temporarily hidden choices can reactivate.
 */
export const projectActiveCustomerDesignSelections = ({
  designSelections,
  showAdditionalClothesCosts,
}: {
  designSelections: DesignSelections;
  showAdditionalClothesCosts?: boolean;
}): DesignSelections => {
  const includeAllAdditionalClothesCosts = resolveShowAdditionalClothesCosts(
    showAdditionalClothesCosts,
  );
  if (includeAllAdditionalClothesCosts) return designSelections;

  const availabilityOptions = { showAdditionalClothesCosts };
  const projectedCustomDetails = designSelections.customDetails
    ? Object.fromEntries(
        Object.entries(designSelections.customDetails).filter(([group]) =>
          isCustomerAvailableCustomDetailSelectionGroup(
            group,
            availabilityOptions,
          ),
        ),
      ) as NonNullable<DesignSelections["customDetails"]>
    : undefined;
  const projectedSnapshots = designSelections.customDetailSnapshots?.filter(
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
    ...designSelections,
    ...(designSelections.hasLining === true && !dressAdditionalVisible
      ? { hasLining: false }
      : {}),
    ...(designSelections.customDetails
      ? { customDetails: projectedCustomDetails }
      : {}),
    ...(designSelections.customDetailSnapshots
      ? { customDetailSnapshots: projectedSnapshots }
      : {}),
  };
};
