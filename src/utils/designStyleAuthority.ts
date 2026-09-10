import {
  createStyleBaseGarmentSpec,
  STYLE_BASE_GARMENT_TYPES,
} from "../config/StyleFabricCapacityConfig";
import type {
  CanonicalPhysicalGarmentType,
  ConstructionDetail,
  CustomDetailDemographic,
  CustomDetailGarmentGroup,
  CustomDetailSelectionGroup,
  DesignSelections,
  FabricCapacityGarmentSpec,
  StyleCategory,
} from "../types";

export const DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION = 1 as const;

export type DesignStyleLifecycle =
  | "draft"
  | "published"
  | "disabled"
  | "archived";

export type DesignStyleReferenceComposition =
  | {
      readonly status: "known";
      readonly garmentTypes: readonly CanonicalPhysicalGarmentType[];
    }
  | {
      readonly status: "legacy_unresolved";
      readonly garmentTypes: readonly [];
    };

export interface DesignStyleEligibilityV1 {
  readonly garmentTypes: readonly CanonicalPhysicalGarmentType[];
  readonly demographics: readonly CustomDetailDemographic[];
  readonly adaptability: {
    readonly mode: "exact_only" | "adaptable";
    readonly garmentTypes: readonly CanonicalPhysicalGarmentType[];
    readonly demographics: readonly CustomDetailDemographic[];
  };
}

export interface DesignStylePresentationV1 {
  readonly name: string;
  readonly description: string;
  readonly image: string;
  readonly displayOrder: number;
  readonly gender: "male" | "female" | "unisex" | "couple" | "family";
  readonly outfitType: string;
  readonly garmentComposition: string;
  readonly fabricCategory: string;
  readonly options: readonly string[];
  readonly designCategories: readonly string[];
  readonly detectedColors: {
    readonly main: string;
    readonly secondary: string;
  };
  readonly constructionDetails: readonly ConstructionDetail[];
  readonly customDetailConfiguration: {
    readonly supportedGarmentGroups: readonly CustomDetailGarmentGroup[];
    readonly requiredSelectionGroups: readonly CustomDetailSelectionGroup[];
    readonly enabled: boolean;
  };
  readonly includedDesignFeatures: {
    readonly hasMonogram: boolean;
    readonly hasEmbroidery: boolean;
    readonly hasMonogramTrimming: boolean;
  };
  readonly monogramCuffEligible: boolean;
  readonly embroideryProminence: "standard" | "heavy";
  readonly defaultGarmentDetails: Readonly<Record<string, unknown>>;
}

export interface AuthoritativeDesignStyleRecordV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly lifecycle: DesignStyleLifecycle;
  readonly publicRevision: number;
  readonly eligibilityRevision: number;
  readonly eligibilityFingerprint: string;
  readonly presentation: DesignStylePresentationV1;
  readonly eligibility: DesignStyleEligibilityV1;
  readonly referenceComposition: DesignStyleReferenceComposition;
}

export interface DesignStyleAuthorityMetadata {
  readonly source: "authoritative" | "legacy_migration";
  readonly schemaVersion: 1;
  readonly lifecycle: DesignStyleLifecycle;
  readonly publicRevision: number;
  readonly eligibilityRevision: number;
  readonly eligibilityFingerprint: string;
  readonly sourceKey: string;
  readonly displayOrder: number;
  readonly referenceComposition: DesignStyleReferenceComposition;
}

export type DesignStyleAdminProjection = StyleCategory & {
  readonly designStyleAuthority: DesignStyleAuthorityMetadata;
};

export type PublishedDesignStyleProjection = StyleCategory & {
  readonly designStyleAuthority: DesignStyleAuthorityMetadata & {
    readonly source: "authoritative";
    readonly lifecycle: "published";
  };
};

export type DesignStyleAuthorityParseResult =
  | { readonly status: "valid"; readonly record: AuthoritativeDesignStyleRecordV1 }
  | { readonly status: "invalid"; readonly reason: string };

const LIFECYCLES = new Set<DesignStyleLifecycle>([
  "draft",
  "published",
  "disabled",
  "archived",
]);
const GARMENT_TYPES = new Set<CanonicalPhysicalGarmentType>(
  STYLE_BASE_GARMENT_TYPES.filter(
    (value): value is CanonicalPhysicalGarmentType => value !== "other",
  ),
);
const AUTHORITY_DEMOGRAPHICS = new Set<CustomDetailDemographic>([
  "male",
  "female",
]);
const INPUT_DEMOGRAPHICS = new Set<CustomDetailDemographic>([
  ...AUTHORITY_DEMOGRAPHICS,
  "unisex",
]);
const STYLE_GENDERS = new Set([
  "male",
  "female",
  "unisex",
  "couple",
  "family",
]);
const CUSTOM_DETAIL_GARMENT_GROUPS = new Set<CustomDetailGarmentGroup>([
  "shirt",
  "dress",
  "neck",
  "standard_shorts",
  "bum_shorts",
  "trousers",
  "skirt",
  "personalized",
]);
const CUSTOM_DETAIL_SELECTION_GROUPS = new Set<CustomDetailSelectionGroup>([
  "additional_physical_garment",
  "shirt_construction",
  "shirt_pockets",
  "dress_construction",
  "dress_pockets",
  "neck_design",
  "standard_shorts_fastening",
  "standard_shorts_pockets",
  "bum_shorts_fastening",
  "bum_shorts_pockets",
  "trouser_fastening",
  "trouser_pockets",
  "skirt_length",
  "skirt_pockets",
  "shirt_additional",
  "dress_additional",
  "neck_additional",
  "trouser_additional",
  "standard_shorts_additional",
  "bum_shorts_additional",
  "skirt_additional",
  "personalized_additional",
]);

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "id",
  "lifecycle",
  "publicRevision",
  "eligibilityRevision",
  "eligibilityFingerprint",
  "presentation",
  "eligibility",
  "referenceComposition",
] as const;
const PRESENTATION_KEYS = [
  "name",
  "description",
  "image",
  "displayOrder",
  "gender",
  "outfitType",
  "garmentComposition",
  "fabricCategory",
  "options",
  "designCategories",
  "detectedColors",
  "constructionDetails",
  "customDetailConfiguration",
  "includedDesignFeatures",
  "monogramCuffEligible",
  "embroideryProminence",
  "defaultGarmentDetails",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 128 &&
  value === value.trim() &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

const isBoundedString = (
  value: unknown,
  maximumLength: number,
): value is string =>
  typeof value === "string" && value.length <= maximumLength;

const isPositiveRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isDisplayOrder = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const sortedUnique = <T extends string>(values: readonly T[]): T[] =>
  [...new Set(values)].sort() as T[];

const parseStringArray = (
  value: unknown,
  maximumItems = 100,
): string[] | null => {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const parsed: string[] = [];
  for (const item of value) {
    if (!isBoundedString(item, 300) || item !== item.trim()) return null;
    parsed.push(item);
  }
  return parsed;
};

const parseEnumArray = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T[] | null => {
  if (!Array.isArray(value)) return null;
  const parsed: T[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item as T)) return null;
    if (parsed.includes(item as T)) return null;
    parsed.push(item as T);
  }
  return sortedUnique(parsed);
};

const normalizeAuthorityDemographics = (
  value: unknown,
): Array<"male" | "female"> | null => {
  const parsed = parseEnumArray(value, INPUT_DEMOGRAPHICS);
  if (!parsed) return null;
  return sortedUnique(
    parsed.flatMap((demographic) =>
      demographic === "unisex" ? ["male", "female"] : [demographic],
    ),
  ) as Array<"male" | "female">;
};

const toJsonValue = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => toJsonValue(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toJsonValue(item)]),
    );
  }
  return null;
};

const toJsonMap = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? (toJsonValue(value) as Record<string, unknown>) : {};

const fnv1a = (value: string, seed: number): string => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const createDesignStyleEligibilityFingerprint = (
  eligibility: DesignStyleEligibilityV1,
): string => {
  const canonical = JSON.stringify({
    garmentTypes: sortedUnique(eligibility.garmentTypes),
    demographics: sortedUnique(eligibility.demographics),
    adaptability: {
      mode: eligibility.adaptability.mode,
      garmentTypes: sortedUnique(eligibility.adaptability.garmentTypes),
      demographics: sortedUnique(eligibility.adaptability.demographics),
    },
  });
  return `style-eligibility-v1-${fnv1a(canonical, 0x811c9dc5)}${fnv1a(
    canonical,
    0x9e3779b9,
  )}`;
};

const parseEligibility = (value: unknown): DesignStyleEligibilityV1 | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["garmentTypes", "demographics", "adaptability"])
  ) {
    return null;
  }
  const garmentTypes = parseEnumArray(value.garmentTypes, GARMENT_TYPES);
  const demographics = parseEnumArray(
    value.demographics,
    AUTHORITY_DEMOGRAPHICS,
  );
  if (!garmentTypes || !demographics || !isRecord(value.adaptability)) {
    return null;
  }
  const adaptability = value.adaptability;
  if (
    !hasExactKeys(adaptability, ["mode", "garmentTypes", "demographics"]) ||
    (adaptability.mode !== "exact_only" && adaptability.mode !== "adaptable")
  ) {
    return null;
  }
  const adaptableGarments = parseEnumArray(
    adaptability.garmentTypes,
    GARMENT_TYPES,
  );
  const adaptableDemographics = parseEnumArray(
    adaptability.demographics,
    AUTHORITY_DEMOGRAPHICS,
  );
  if (!adaptableGarments || !adaptableDemographics) return null;
  if (
    adaptability.mode === "exact_only" &&
    (adaptableGarments.length > 0 || adaptableDemographics.length > 0)
  ) {
    return null;
  }
  if (adaptability.mode === "adaptable" && adaptableGarments.length === 0) {
    return null;
  }
  return {
    garmentTypes,
    demographics,
    adaptability: {
      mode: adaptability.mode,
      garmentTypes: adaptableGarments,
      demographics: adaptableDemographics,
    },
  };
};

const parseReferenceComposition = (
  value: unknown,
): DesignStyleReferenceComposition | null => {
  if (!isRecord(value) || !hasExactKeys(value, ["status", "garmentTypes"])) {
    return null;
  }
  const garmentTypes = parseEnumArray(value.garmentTypes, GARMENT_TYPES);
  if (!garmentTypes) return null;
  if (value.status === "legacy_unresolved" && garmentTypes.length === 0) {
    return { status: "legacy_unresolved", garmentTypes: [] };
  }
  if (value.status === "known" && garmentTypes.length > 0) {
    return { status: "known", garmentTypes };
  }
  return null;
};

const parseConstructionDetails = (value: unknown): ConstructionDetail[] | null => {
  if (!Array.isArray(value) || value.length > 100) return null;
  const details: ConstructionDetail[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !Object.keys(item).every((key) =>
        ["code", "type", "price", "discountPrice"].includes(key),
      ) ||
      !isBoundedString(item.code, 128) ||
      !item.code.trim() ||
      !isBoundedString(item.type, 128) ||
      !item.type.trim() ||
      typeof item.price !== "number" ||
      !Number.isFinite(item.price) ||
      item.price < 0 ||
      (item.discountPrice !== undefined &&
        (typeof item.discountPrice !== "number" ||
          !Number.isFinite(item.discountPrice) ||
          item.discountPrice < 0))
    ) {
      return null;
    }
    details.push({
      code: item.code,
      type: item.type,
      price: item.price,
      ...(typeof item.discountPrice === "number"
        ? { discountPrice: item.discountPrice }
        : {}),
    });
  }
  return details;
};

const parsePresentation = (value: unknown): DesignStylePresentationV1 | null => {
  if (!isRecord(value) || !hasExactKeys(value, PRESENTATION_KEYS)) return null;
  if (
    !isBoundedString(value.name, 160) ||
    !value.name.trim() ||
    value.name !== value.name.trim() ||
    !isBoundedString(value.description, 2000) ||
    !isBoundedString(value.image, 3000) ||
    value.image.startsWith("data:") ||
    !isDisplayOrder(value.displayOrder) ||
    typeof value.gender !== "string" ||
    !STYLE_GENDERS.has(value.gender) ||
    !isBoundedString(value.outfitType, 160) ||
    !isBoundedString(value.garmentComposition, 160) ||
    !isBoundedString(value.fabricCategory, 160)
  ) {
    return null;
  }
  const options = parseStringArray(value.options);
  const designCategories = parseStringArray(value.designCategories);
  const constructionDetails = parseConstructionDetails(value.constructionDetails);
  if (
    !options ||
    !designCategories ||
    !constructionDetails ||
    !isRecord(value.detectedColors) ||
    !hasExactKeys(value.detectedColors, ["main", "secondary"]) ||
    !isBoundedString(value.detectedColors.main, 64) ||
    !isBoundedString(value.detectedColors.secondary, 64) ||
    !isRecord(value.customDetailConfiguration) ||
    !hasExactKeys(value.customDetailConfiguration, [
      "supportedGarmentGroups",
      "requiredSelectionGroups",
      "enabled",
    ]) ||
    typeof value.customDetailConfiguration.enabled !== "boolean" ||
    !isRecord(value.includedDesignFeatures) ||
    !hasExactKeys(value.includedDesignFeatures, [
      "hasMonogram",
      "hasEmbroidery",
      "hasMonogramTrimming",
    ]) ||
    !Object.values(value.includedDesignFeatures).every(
      (item) => typeof item === "boolean",
    ) ||
    typeof value.monogramCuffEligible !== "boolean" ||
    (value.embroideryProminence !== "standard" &&
      value.embroideryProminence !== "heavy") ||
    !isRecord(value.defaultGarmentDetails)
  ) {
    return null;
  }
  const supportedGarmentGroups = parseEnumArray(
    value.customDetailConfiguration.supportedGarmentGroups,
    CUSTOM_DETAIL_GARMENT_GROUPS,
  );
  const requiredSelectionGroups = parseEnumArray(
    value.customDetailConfiguration.requiredSelectionGroups,
    CUSTOM_DETAIL_SELECTION_GROUPS,
  );
  if (!supportedGarmentGroups || !requiredSelectionGroups) return null;
  return {
    name: value.name,
    description: value.description,
    image: value.image,
    displayOrder: value.displayOrder,
    gender: value.gender as DesignStylePresentationV1["gender"],
    outfitType: value.outfitType,
    garmentComposition: value.garmentComposition,
    fabricCategory: value.fabricCategory,
    options,
    designCategories,
    detectedColors: {
      main: value.detectedColors.main,
      secondary: value.detectedColors.secondary,
    },
    constructionDetails,
    customDetailConfiguration: {
      supportedGarmentGroups,
      requiredSelectionGroups,
      enabled: value.customDetailConfiguration.enabled,
    },
    includedDesignFeatures: {
      hasMonogram: value.includedDesignFeatures.hasMonogram as boolean,
      hasEmbroidery: value.includedDesignFeatures.hasEmbroidery as boolean,
      hasMonogramTrimming: value.includedDesignFeatures
        .hasMonogramTrimming as boolean,
    },
    monogramCuffEligible: value.monogramCuffEligible,
    embroideryProminence: value.embroideryProminence,
    defaultGarmentDetails: toJsonMap(value.defaultGarmentDetails),
  };
};

export const parseAuthoritativeDesignStyleRecord = (
  documentId: string,
  value: unknown,
): DesignStyleAuthorityParseResult => {
  if (!isSafeIdentifier(documentId)) {
    return { status: "invalid", reason: "INVALID_DOCUMENT_ID" };
  }
  if (!isRecord(value)) {
    return { status: "invalid", reason: "RECORD_NOT_OBJECT" };
  }
  if (!hasExactKeys(value, TOP_LEVEL_KEYS)) {
    return { status: "invalid", reason: "UNEXPECTED_RECORD_FIELDS" };
  }
  if (value.schemaVersion !== DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION) {
    return { status: "invalid", reason: "UNSUPPORTED_SCHEMA_VERSION" };
  }
  if (value.id !== documentId || !isSafeIdentifier(value.id)) {
    return { status: "invalid", reason: "STYLE_ID_MISMATCH" };
  }
  if (typeof value.lifecycle !== "string" || !LIFECYCLES.has(value.lifecycle as DesignStyleLifecycle)) {
    return { status: "invalid", reason: "INVALID_LIFECYCLE" };
  }
  if (
    !isPositiveRevision(value.publicRevision) ||
    !isPositiveRevision(value.eligibilityRevision) ||
    !isBoundedString(value.eligibilityFingerprint, 128)
  ) {
    return { status: "invalid", reason: "INVALID_REVISION" };
  }
  const presentation = parsePresentation(value.presentation);
  const eligibility = parseEligibility(value.eligibility);
  const referenceComposition = parseReferenceComposition(
    value.referenceComposition,
  );
  if (!presentation || !eligibility || !referenceComposition) {
    return { status: "invalid", reason: "INVALID_RECORD_SHAPE" };
  }
  if (
    value.lifecycle === "published" &&
    (eligibility.garmentTypes.length === 0 ||
      eligibility.demographics.length === 0)
  ) {
    return { status: "invalid", reason: "PUBLISHED_STYLE_NOT_ELIGIBLE" };
  }
  if (
    createDesignStyleEligibilityFingerprint(eligibility) !==
    value.eligibilityFingerprint
  ) {
    return { status: "invalid", reason: "ELIGIBILITY_FINGERPRINT_MISMATCH" };
  }
  return {
    status: "valid",
    record: {
      schemaVersion: DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION,
      id: value.id,
      lifecycle: value.lifecycle as DesignStyleLifecycle,
      publicRevision: value.publicRevision,
      eligibilityRevision: value.eligibilityRevision,
      eligibilityFingerprint: value.eligibilityFingerprint,
      presentation,
      eligibility,
      referenceComposition,
    },
  };
};

const parseCanonicalGarmentTypesFromStyle = (
  style: StyleCategory,
): CanonicalPhysicalGarmentType[] => {
  const composition = style.fabricCapacityComposition;
  if (!Array.isArray(composition)) return [];
  const garmentTypes: CanonicalPhysicalGarmentType[] = [];
  for (const spec of composition) {
    if (
      !isRecord(spec) ||
      typeof spec.garmentType !== "string" ||
      !GARMENT_TYPES.has(spec.garmentType as CanonicalPhysicalGarmentType) ||
      (spec.fabricUnits !== 1 && spec.fabricUnits !== 2)
    ) {
      throw new Error("INVALID_CANONICAL_GARMENT_ELIGIBILITY");
    }
    if (garmentTypes.includes(spec.garmentType as CanonicalPhysicalGarmentType)) {
      throw new Error("DUPLICATE_CANONICAL_GARMENT_ELIGIBILITY");
    }
    garmentTypes.push(spec.garmentType as CanonicalPhysicalGarmentType);
  }
  return sortedUnique(garmentTypes);
};

const demographicsFromStyle = (
  style: StyleCategory,
): CustomDetailDemographic[] => {
  const configured = style.customDetailConfig?.representedGenders;
  if (Array.isArray(configured) && configured.length > 0) {
    const normalized = normalizeAuthorityDemographics(configured);
    if (!normalized) throw new Error("INVALID_STYLE_DEMOGRAPHICS");
    return normalized;
  }
  if (style.gender === "male" || style.gender === "female") {
    return [style.gender];
  }
  if (
    style.gender === "unisex" ||
    style.gender === "couple" ||
    style.gender === "family"
  ) {
    return ["female", "male"];
  }
  return [];
};

const adaptabilityFromStyle = (
  style: StyleCategory,
): DesignStyleEligibilityV1["adaptability"] => {
  const raw = style.styleApplicability;
  if (!raw || raw.mode === "exact_only") {
    return { mode: "exact_only", garmentTypes: [], demographics: [] };
  }
  if (raw.mode !== "adaptable") {
    throw new Error("INVALID_STYLE_ADAPTABILITY");
  }
  const garmentTypes = parseEnumArray(raw.garmentTypes, GARMENT_TYPES);
  const demographics =
    raw.demographics === undefined
      ? []
      : normalizeAuthorityDemographics(raw.demographics);
  if (!garmentTypes || garmentTypes.length === 0 || !demographics) {
    throw new Error("INVALID_STYLE_ADAPTABILITY");
  }
  return { mode: "adaptable", garmentTypes, demographics };
};

const presentationFromStyle = (
  style: StyleCategory,
  displayOrder: number,
  image: string,
): DesignStylePresentationV1 => {
  const customDetailConfig = style.customDetailConfig;
  const supportedGarmentGroups = parseEnumArray(
    customDetailConfig?.supportedGarmentGroups || [],
    CUSTOM_DETAIL_GARMENT_GROUPS,
  );
  const requiredSelectionGroups = parseEnumArray(
    customDetailConfig?.requiredSelectionGroups || [],
    CUSTOM_DETAIL_SELECTION_GROUPS,
  );
  if (!supportedGarmentGroups || !requiredSelectionGroups) {
    throw new Error("INVALID_CUSTOM_DETAIL_CONFIGURATION");
  }
  const gender = STYLE_GENDERS.has(style.gender) ? style.gender : "unisex";
  const features = style.includedDesignFeatures || {};
  return {
    name: style.name.trim(),
    description: String(style.description || "").trim(),
    image,
    displayOrder,
    gender,
    outfitType: String(style.outfitType || "").trim(),
    garmentComposition: String(style.garmentComposition || "").trim(),
    fabricCategory: String(style.fabricCategory || "").trim(),
    options: (style.options || []).map((item) => String(item).trim()),
    designCategories: (style.designCategories || []).map((item) =>
      String(item).trim(),
    ),
    detectedColors: {
      main: String(style.detectedColors?.main || "").trim(),
      secondary: String(style.detectedColors?.secondary || "").trim(),
    },
    constructionDetails: (style.constructionDetails || []).map((item) => ({
      code: String(item.code).trim(),
      type: String(item.type).trim(),
      price: item.price,
      ...(typeof item.discountPrice === "number"
        ? { discountPrice: item.discountPrice }
        : {}),
    })),
    customDetailConfiguration: {
      supportedGarmentGroups,
      requiredSelectionGroups,
      enabled: customDetailConfig?.enabled !== false,
    },
    includedDesignFeatures: {
      hasMonogram: Boolean(features.hasMonogram ?? style.hasMonogram),
      hasEmbroidery: Boolean(features.hasEmbroidery ?? style.hasEmbroidery),
      hasMonogramTrimming: Boolean(
        features.hasMonogramTrimming ?? style.hasMonogramTrimming,
      ),
    },
    monogramCuffEligible: style.monogramCuffEligible === true,
    embroideryProminence:
      style.embroideryProminence === "heavy" ? "heavy" : "standard",
    defaultGarmentDetails: toJsonMap(
      style.defaultGarmentDetails as DesignSelections | undefined,
    ),
  };
};

export const prepareAuthoritativeDesignStyleRecord = ({
  style,
  lifecycle,
  displayOrder,
  referenceComposition,
  currentRecord,
  image = style.image || "",
}: {
  style: StyleCategory;
  lifecycle: DesignStyleLifecycle;
  displayOrder: number;
  referenceComposition: DesignStyleReferenceComposition;
  currentRecord: AuthoritativeDesignStyleRecordV1 | null;
  image?: string;
}): AuthoritativeDesignStyleRecordV1 => {
  if (!isSafeIdentifier(style.id) || !style.name?.trim()) {
    throw new Error("INVALID_STYLE_ID_OR_NAME");
  }
  if (!LIFECYCLES.has(lifecycle) || !isDisplayOrder(displayOrder)) {
    throw new Error("INVALID_STYLE_LIFECYCLE_OR_ORDER");
  }
  if (currentRecord && currentRecord.id !== style.id) {
    throw new Error("STYLE_ID_IMMUTABLE");
  }
  const eligibility: DesignStyleEligibilityV1 = {
    garmentTypes: parseCanonicalGarmentTypesFromStyle(style),
    demographics: demographicsFromStyle(style),
    adaptability: adaptabilityFromStyle(style),
  };
  const fingerprint = createDesignStyleEligibilityFingerprint(eligibility);
  const eligibilityRevision = currentRecord
    ? currentRecord.eligibilityFingerprint === fingerprint
      ? currentRecord.eligibilityRevision
      : currentRecord.eligibilityRevision + 1
    : 1;
  const record: AuthoritativeDesignStyleRecordV1 = {
    schemaVersion: DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION,
    id: style.id,
    lifecycle,
    publicRevision: currentRecord ? currentRecord.publicRevision + 1 : 1,
    eligibilityRevision,
    eligibilityFingerprint: fingerprint,
    presentation: presentationFromStyle(style, displayOrder, image),
    eligibility,
    referenceComposition,
  };
  const parsed = parseAuthoritativeDesignStyleRecord(style.id, record);
  if (parsed.status === "invalid") throw new Error(parsed.reason);
  return parsed.record;
};

const representedGendersFor = (
  demographics: readonly CustomDetailDemographic[],
): Array<"male" | "female"> => {
  if (demographics.includes("unisex")) return ["male", "female"];
  return demographics.filter(
    (value): value is "male" | "female" =>
      value === "male" || value === "female",
  );
};

const metadataFor = (
  record: AuthoritativeDesignStyleRecordV1,
  source: DesignStyleAuthorityMetadata["source"],
): DesignStyleAuthorityMetadata => ({
  source,
  schemaVersion: DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION,
  lifecycle: record.lifecycle,
  publicRevision: record.publicRevision,
  eligibilityRevision: record.eligibilityRevision,
  eligibilityFingerprint: record.eligibilityFingerprint,
  sourceKey: `catalog-style:${record.id}`,
  displayOrder: record.presentation.displayOrder,
  referenceComposition: record.referenceComposition,
});

export const projectDesignStyleRecordForAdmin = (
  record: AuthoritativeDesignStyleRecordV1,
): DesignStyleAdminProjection => {
  const representedGenders = representedGendersFor(
    record.eligibility.demographics,
  );
  const featuresMaleAndFemale =
    representedGenders.includes("male") && representedGenders.includes("female");
  return {
    id: record.id,
    name: record.presentation.name,
    description: record.presentation.description,
    gender: record.presentation.gender,
    options: [...record.presentation.options],
    ...(record.presentation.image ? { image: record.presentation.image } : {}),
    outfitType: record.presentation.outfitType,
    garmentComposition: record.presentation.garmentComposition,
    fabricCategory: record.presentation.fabricCategory,
    designCategories: [...record.presentation.designCategories],
    detectedColors: { ...record.presentation.detectedColors },
    constructionDetails: record.presentation.constructionDetails.map((item) => ({
      ...item,
    })),
    fabricCapacityComposition: record.eligibility.garmentTypes.map(
      createStyleBaseGarmentSpec,
    ),
    customDetailConfig: {
      representedGenders,
      featuresMaleAndFemale,
      supportedGarmentGroups: [
        ...record.presentation.customDetailConfiguration.supportedGarmentGroups,
      ],
      requiredSelectionGroups: [
        ...record.presentation.customDetailConfiguration.requiredSelectionGroups,
      ],
      enabled: record.presentation.customDetailConfiguration.enabled,
    },
    targetDemographic:
      representedGenders.length === 1 ? representedGenders[0] : "unisex",
    featuresMaleAndFemale,
    includedDesignFeatures: { ...record.presentation.includedDesignFeatures },
    hasMonogram: record.presentation.includedDesignFeatures.hasMonogram,
    hasEmbroidery: record.presentation.includedDesignFeatures.hasEmbroidery,
    hasMonogramTrimming:
      record.presentation.includedDesignFeatures.hasMonogramTrimming,
    monogramCuffEligible: record.presentation.monogramCuffEligible,
    embroideryProminence: record.presentation.embroideryProminence,
    defaultGarmentDetails: toJsonMap(
      record.presentation.defaultGarmentDetails,
    ) as DesignSelections,
    styleApplicability:
      record.eligibility.adaptability.mode === "adaptable"
        ? {
            mode: "adaptable",
            garmentTypes: [
              ...record.eligibility.adaptability.garmentTypes,
            ],
            demographics: [
              ...record.eligibility.adaptability.demographics,
            ],
          }
        : { mode: "exact_only" },
    designStyleAuthority: metadataFor(record, "authoritative"),
  };
};

export const projectPublishedDesignStyleRecord = (
  record: AuthoritativeDesignStyleRecordV1,
): PublishedDesignStyleProjection | null =>
  record.lifecycle === "published"
    ? (projectDesignStyleRecordForAdmin(record) as PublishedDesignStyleProjection)
    : null;

export const projectPublishedDesignStyleSnapshot = (
  documents: readonly { readonly id: string; readonly data: unknown }[],
):
  | {
      readonly status: "ready";
      readonly styles: readonly PublishedDesignStyleProjection[];
    }
  | { readonly status: "error"; readonly reason: string } => {
  const styles: PublishedDesignStyleProjection[] = [];
  for (const document of documents) {
    const parsed = parseAuthoritativeDesignStyleRecord(
      document.id,
      document.data,
    );
    if (parsed.status === "invalid") {
      return { status: "error", reason: parsed.reason };
    }
    const projected = projectPublishedDesignStyleRecord(parsed.record);
    if (!projected) {
      return { status: "error", reason: "NON_PUBLISHED_QUERY_RESULT" };
    }
    styles.push(projected);
  }
  return { status: "ready", styles };
};

export const createLegacyDesignStyleMigrationDraft = (
  documentId: string,
  value: unknown,
): DesignStyleAdminProjection | null => {
  if (
    !isRecord(value) ||
    Object.prototype.hasOwnProperty.call(value, "schemaVersion") ||
    value.id !== documentId ||
    !isSafeIdentifier(documentId) ||
    !Array.isArray(value.fabricCapacityComposition) ||
    value.fabricCapacityComposition.length === 0
  ) {
    return null;
  }
  const style = value as unknown as StyleCategory;
  let record: AuthoritativeDesignStyleRecordV1;
  try {
    record = prepareAuthoritativeDesignStyleRecord({
      style,
      lifecycle: "draft",
      displayOrder: 0,
      referenceComposition: {
        status: "legacy_unresolved",
        garmentTypes: [],
      },
      currentRecord: null,
      image: typeof value.image === "string" ? value.image : "",
    });
  } catch {
    return null;
  }
  const projected = projectDesignStyleRecordForAdmin(record);
  return {
    ...projected,
    designStyleAuthority: {
      ...projected.designStyleAuthority,
      source: "legacy_migration",
      publicRevision: 0,
      eligibilityRevision: 0,
    },
  };
};

export const getDesignStyleAuthorityMetadata = (
  style: StyleCategory,
): DesignStyleAuthorityMetadata | null => {
  const metadata = (style as DesignStyleAdminProjection).designStyleAuthority;
  return metadata && metadata.schemaVersion === DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION
    ? metadata
    : null;
};

export const isAuthoritativeDesignStyleProjection = (
  style: StyleCategory,
): style is DesignStyleAdminProjection =>
  getDesignStyleAuthorityMetadata(style)?.source === "authoritative";

export const createDefaultDesignStyleAuthorityMetadata = (
  displayOrder: number,
): DesignStyleAuthorityMetadata => ({
  source: "authoritative",
  schemaVersion: DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION,
  lifecycle: "draft",
  publicRevision: 0,
  eligibilityRevision: 0,
  eligibilityFingerprint: "",
  sourceKey: "",
  displayOrder,
  referenceComposition: {
    status: "legacy_unresolved",
    garmentTypes: [],
  },
});

export const getLegacyStyleMigrationGarmentTypes = (
  value: unknown,
): readonly CanonicalPhysicalGarmentType[] | null => {
  if (!isRecord(value) || !Array.isArray(value.fabricCapacityComposition)) {
    return null;
  }
  try {
    return parseCanonicalGarmentTypesFromStyle(value as unknown as StyleCategory);
  } catch {
    return null;
  }
};

export const cloneReferenceComposition = (
  value: DesignStyleReferenceComposition,
): DesignStyleReferenceComposition =>
  value.status === "known"
    ? { status: "known", garmentTypes: [...value.garmentTypes] }
    : { status: "legacy_unresolved", garmentTypes: [] };

export const getCanonicalEligibilitySpecs = (
  record: AuthoritativeDesignStyleRecordV1,
): readonly FabricCapacityGarmentSpec[] =>
  record.eligibility.garmentTypes.map(createStyleBaseGarmentSpec);
