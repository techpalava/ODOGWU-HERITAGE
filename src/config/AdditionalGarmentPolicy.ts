import type {
  CustomDetailDemographic,
  CustomDetailDesignContext,
  CustomDetailSelectionGroup,
  DesignSelections,
  FabricCapacityGarmentSpec,
  FabricGarmentType,
  StyleCategory,
} from "../types";

export interface NormalizedGarmentDemographic {
  raw: string;
  isMale: boolean;
  isFemale: boolean;
  isUnisex: boolean;
  explicitlyBoth: boolean;
}

export interface AdditionalGarmentPolicyCandidate {
  garmentType: FabricGarmentType;
  eligibilityRule: "same_type" | "demographic_policy";
  mainGarmentSpec?: FabricCapacityGarmentSpec;
}

const isUploadedDesignContext = (
  design: CustomDetailDesignContext,
): design is Extract<CustomDetailDesignContext, { kind: "uploaded" }> =>
  "kind" in design && design.kind === "uploaded";

export const resolveGarmentPolicyDemographic = (
  design: CustomDetailDesignContext,
): NormalizedGarmentDemographic => {
  if (isUploadedDesignContext(design)) {
    const raw = design.demographic;
    return {
      raw,
      isMale: raw === "male",
      isFemale: raw === "female",
      isUnisex: raw === "unisex",
      explicitlyBoth: raw === "unisex",
    };
  }

  const raw = String(design.targetDemographic || design.gender || "unisex")
    .trim()
    .toLowerCase();
  const declaredGender = String(design.gender || "unisex")
    .trim()
    .toLowerCase();
  const representedGenders = new Set(
    (design.customDetailConfig?.representedGenders || []).map((value) =>
      String(value).trim().toLowerCase(),
    ),
  );
  const explicitlyBoth =
    design.customDetailConfig?.featuresMaleAndFemale === true ||
    design.featuresMaleAndFemale === true ||
    (representedGenders.has("male") && representedGenders.has("female")) ||
    raw === "family" ||
    raw === "couple" ||
    declaredGender === "family" ||
    declaredGender === "couple";

  return {
    raw,
    isMale: raw === "male" && !explicitlyBoth,
    isFemale: raw === "female" && !explicitlyBoth,
    isUnisex: raw === "unisex",
    explicitlyBoth,
  };
};

const isPhysicalGarment = (garmentType: FabricGarmentType): boolean =>
  garmentType !== "other";

export const resolveAdditionalGarmentPolicyCandidates = (
  mainComposition: readonly FabricCapacityGarmentSpec[],
  design?: CustomDetailDesignContext | null,
): AdditionalGarmentPolicyCandidate[] => {
  const candidates = new Map<FabricGarmentType, AdditionalGarmentPolicyCandidate>();
  for (const spec of mainComposition) {
    if (!isPhysicalGarment(spec.garmentType) || candidates.has(spec.garmentType)) {
      continue;
    }
    candidates.set(spec.garmentType, {
      garmentType: spec.garmentType,
      eligibilityRule: "same_type",
      mainGarmentSpec: { ...spec },
    });
  }

  if (!design) return sortAdditionalGarmentPolicyCandidates([...candidates.values()]);

  const demographic = resolveGarmentPolicyDemographic(design);
  const mainTypes = new Set(mainComposition.map((spec) => spec.garmentType));
  const supportsBoth = demographic.isUnisex || demographic.explicitlyBoth;
  const nikkaEligible =
    demographic.isMale ||
    supportsBoth ||
    (demographic.isFemale && mainTypes.has("trouser"));
  const bumShortsEligible = demographic.isFemale || supportsBoth;

  if (nikkaEligible && !candidates.has("standard_shorts")) {
    candidates.set("standard_shorts", {
      garmentType: "standard_shorts",
      eligibilityRule: "demographic_policy",
    });
  }
  if (bumShortsEligible && !candidates.has("bum_shorts")) {
    candidates.set("bum_shorts", {
      garmentType: "bum_shorts",
      eligibilityRule: "demographic_policy",
    });
  }

  return sortAdditionalGarmentPolicyCandidates([...candidates.values()]);
};

export const ADDITIONAL_GARMENT_DISPLAY_ORDER: Readonly<
  Record<FabricGarmentType, number>
> = {
  shirt: 10,
  dress: 20,
  kaftan: 30,
  full_length_gown: 40,
  agbada: 50,
  skirt: 60,
  bum_shorts: 70,
  trouser: 80,
  standard_shorts: 90,
  other: 100,
};

export const sortAdditionalGarmentPolicyCandidates = <
  T extends Pick<AdditionalGarmentPolicyCandidate, "garmentType">,
>(candidates: readonly T[]): T[] =>
  [...candidates].sort(
    (left, right) =>
      ADDITIONAL_GARMENT_DISPLAY_ORDER[left.garmentType] -
      ADDITIONAL_GARMENT_DISPLAY_ORDER[right.garmentType],
  );

export const SHORTS_CANONICAL_PRICE_CENTS = {
  shorts_std_rope: 7000,
  shorts_std_elastic: 7500,
  shorts_std_belt: 7500,
  shorts_std_pocket_regular: 0,
  shorts_std_pocket_back: 0,
  shorts_std_pocket_none: 0,
  bum_rope: 7000,
  bum_elastic: 7500,
  bum_belt: 7500,
  bum_pocket_regular: 0,
  bum_pocket_back: 0,
  bum_pocket_none: 0,
} as const;

export type CanonicalShortsOptionId = keyof typeof SHORTS_CANONICAL_PRICE_CENTS;

export const getCanonicalShortsPriceCents = (
  optionId: string,
): number | null =>
  Object.prototype.hasOwnProperty.call(SHORTS_CANONICAL_PRICE_CENTS, optionId)
    ? SHORTS_CANONICAL_PRICE_CENTS[optionId as CanonicalShortsOptionId]
    : null;

const SHORTS_FASTENING_GROUP_BY_GARMENT: Readonly<
  Partial<Record<FabricGarmentType, CustomDetailSelectionGroup>>
> = {
  standard_shorts: "standard_shorts_fastening",
  bum_shorts: "bum_shorts_fastening",
};

const SHORTS_DEFAULT_FASTENING_BY_GARMENT: Readonly<
  Partial<Record<FabricGarmentType, CanonicalShortsOptionId>>
> = {
  standard_shorts: "shorts_std_rope",
  bum_shorts: "bum_rope",
};

export const resolveShortsGarmentUnitPriceCents = (
  garmentType: FabricGarmentType,
  selections: DesignSelections,
): number | null => {
  const group = SHORTS_FASTENING_GROUP_BY_GARMENT[garmentType];
  const fallback = SHORTS_DEFAULT_FASTENING_BY_GARMENT[garmentType];
  if (!group || !fallback) return null;
  const rawSelection = selections.customDetails?.[group];
  const optionId = Array.isArray(rawSelection) ? rawSelection[0] : rawSelection;
  return getCanonicalShortsPriceCents(optionId || fallback);
};

export const getDesignPolicyDemographic = (
  design: CustomDetailDesignContext,
): CustomDetailDemographic => {
  const demographic = resolveGarmentPolicyDemographic(design);
  if (demographic.isMale) return "male";
  if (demographic.isFemale) return "female";
  return "unisex";
};

export const isCatalogStyle = (
  design: CustomDetailDesignContext,
): design is StyleCategory => !isUploadedDesignContext(design);
