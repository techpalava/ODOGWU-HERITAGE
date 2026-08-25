import type { DesignSelections } from "../types";
import {
  isCustomerAvailableCustomDetailSelectionGroup,
  isCustomerFacingAdditionalClothesCostGroup,
  resolveShowAdditionalClothesCosts,
} from "../config/GarmentDetailsConfig";

const isActiveCustomerSelectionGroup = (
  group: string,
  showAdditionalClothesCosts: boolean,
): boolean =>
  !isCustomerFacingAdditionalClothesCostGroup(group) ||
  isCustomerAvailableCustomDetailSelectionGroup(group, {
    showAdditionalClothesCosts,
  });

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
  const includeAdditionalClothesCosts = resolveShowAdditionalClothesCosts(
    showAdditionalClothesCosts,
  );
  if (includeAdditionalClothesCosts) return designSelections;

  const projectedCustomDetails = designSelections.customDetails
    ? Object.fromEntries(
        Object.entries(designSelections.customDetails).filter(([group]) =>
          isActiveCustomerSelectionGroup(group, includeAdditionalClothesCosts),
        ),
      ) as NonNullable<DesignSelections["customDetails"]>
    : undefined;
  const projectedSnapshots = designSelections.customDetailSnapshots?.filter(
    (snapshot) =>
      isActiveCustomerSelectionGroup(
        snapshot.selectionGroup,
        includeAdditionalClothesCosts,
      ),
  );

  return {
    ...designSelections,
    ...(designSelections.hasLining === true ? { hasLining: false } : {}),
    ...(designSelections.customDetails
      ? { customDetails: projectedCustomDetails }
      : {}),
    ...(designSelections.customDetailSnapshots
      ? { customDetailSnapshots: projectedSnapshots }
      : {}),
  };
};
