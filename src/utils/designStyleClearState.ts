import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import type {
  DesignSelections,
  DesignSource,
  FabricAllocationState,
} from "../types";

export interface ClearedDesignSelectionStateSnapshot {
  currentStep: number;
  selectedStyle: null;
  designSource: DesignSource | null;
  confirmedDesignSourceKey: null;
  confirmedStyleId: null;
  priceActivatedFabricCode: null;
  selectedGarment: null;
  selectedFabric: null;
  designSelections: DesignSelections;
  hasLining: boolean;
  fabricAllocationState: FabricAllocationState;
}

export const createClearedDesignSelectionStateSnapshot = (
  designStyleStep: number,
): ClearedDesignSelectionStateSnapshot => ({
  currentStep: designStyleStep,
  selectedStyle: null,
  designSource: null,
  confirmedDesignSourceKey: null,
  confirmedStyleId: null,
  priceActivatedFabricCode: null,
  selectedGarment: null,
  selectedFabric: null,
  designSelections: { accessories: [] },
  hasLining: false,
  fabricAllocationState: FabricAllocationStateEngine.initialize(),
});
