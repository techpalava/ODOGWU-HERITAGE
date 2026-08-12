import type {
  CustomDetailOption,
  CustomDetailSelectionGroup,
  FabricGarmentType,
} from "../types";
import {
  STYLE_BASE_GARMENT_TYPES,
  createStyleBaseGarmentSpec,
  getDefaultGarmentDetailsForSpec,
} from "../config/StyleFabricCapacityConfig";
import {
  isClothingPriceSelectionGroup,
  sortCustomDetailOptions,
} from "./catalogHelpers";

export const CANONICAL_PHYSICAL_GARMENT_TYPES = [
  ...STYLE_BASE_GARMENT_TYPES,
] as const;

type CanonicalPhysicalGarmentType =
  (typeof CANONICAL_PHYSICAL_GARMENT_TYPES)[number];

const CANONICAL_PHYSICAL_GARMENT_TYPE_SET = new Set<FabricGarmentType>(
  CANONICAL_PHYSICAL_GARMENT_TYPES,
);

const DERIVED_CONSTRUCTION_GARMENT_TYPES = new Set<FabricGarmentType>([
  "kaftan",
  "full_length_gown",
  "agbada",
]);

export interface GarmentConstructionPriceComponent {
  componentKey: string;
  optionId: string;
  selectionGroup: CustomDetailSelectionGroup;
  priceCents: number;
  price: number;
}

export interface ResolvedGarmentConstructionPricing {
  status: "resolved";
  garmentType: CanonicalPhysicalGarmentType;
  components: GarmentConstructionPriceComponent[];
  totalPriceCents: number;
  totalPrice: number;
}

export type GarmentConstructionPricingFailureCode =
  | "unsupported_garment"
  | "missing_construction_configuration"
  | "missing_catalog_option";

export interface UnresolvedGarmentConstructionPricing {
  status: "unresolved";
  garmentType: FabricGarmentType;
  code: GarmentConstructionPricingFailureCode;
  selectionGroup?: CustomDetailSelectionGroup;
  expectedOptionId?: string;
}

export type GarmentConstructionPricingResolution =
  | ResolvedGarmentConstructionPricing
  | UnresolvedGarmentConstructionPricing;

const isValidConstructionOption = (
  option: CustomDetailOption,
  selectionGroup: CustomDetailSelectionGroup,
): boolean =>
  option.active &&
  option.selectionGroup === selectionGroup &&
  isClothingPriceSelectionGroup(option.selectionGroup) &&
  !option.informational &&
  !option.requiresEvaluation &&
  Number.isFinite(option.priceCents) &&
  option.priceCents > 0;

/**
 * Resolves Step 1 base garment construction from the normalized Admin catalog.
 * Demographic applicability is deliberately ignored here; later Custom Details
 * continue to apply their existing demographic rules.
 */
export const resolveGarmentConstructionPricing = (
  garmentType: FabricGarmentType,
  normalizedCatalog: readonly CustomDetailOption[],
): GarmentConstructionPricingResolution => {
  if (!CANONICAL_PHYSICAL_GARMENT_TYPE_SET.has(garmentType)) {
    return {
      status: "unresolved",
      garmentType,
      code: "unsupported_garment",
    };
  }

  const configuredDetails = getDefaultGarmentDetailsForSpec(
    createStyleBaseGarmentSpec(garmentType),
  );
  const constructionComponents = Object.entries(configuredDetails || {}).filter(
    ([selectionGroup]) =>
      isClothingPriceSelectionGroup(
        selectionGroup as CustomDetailSelectionGroup,
      ),
  ) as Array<[CustomDetailSelectionGroup, string | string[]]>;

  if (constructionComponents.length === 0) {
    return {
      status: "unresolved",
      garmentType,
      code: "missing_construction_configuration",
    };
  }

  const resolvedComponents: GarmentConstructionPriceComponent[] = [];
  for (const [selectionGroup, configuredSelection] of constructionComponents) {
    const configuredOptionId = Array.isArray(configuredSelection)
      ? configuredSelection[0]
      : configuredSelection;
    const candidates = sortCustomDetailOptions(
      normalizedCatalog.filter((option) =>
        isValidConstructionOption(option, selectionGroup),
      ),
    );
    const option = DERIVED_CONSTRUCTION_GARMENT_TYPES.has(garmentType)
      ? candidates.find((candidate) => candidate.id === configuredOptionId)
      : candidates[0];

    if (!option) {
      return {
        status: "unresolved",
        garmentType,
        code: "missing_catalog_option",
        selectionGroup,
        ...(DERIVED_CONSTRUCTION_GARMENT_TYPES.has(garmentType)
          ? { expectedOptionId: configuredOptionId }
          : {}),
      };
    }

    resolvedComponents.push({
      componentKey: `${garmentType}:${selectionGroup}:${option.id}`,
      optionId: option.id,
      selectionGroup,
      priceCents: option.priceCents,
      price: option.priceCents / 100,
    });
  }

  const totalPriceCents = resolvedComponents.reduce(
    (total, component) => total + component.priceCents,
    0,
  );

  return {
    status: "resolved",
    garmentType,
    components: resolvedComponents,
    totalPriceCents,
    totalPrice: totalPriceCents / 100,
  };
};
