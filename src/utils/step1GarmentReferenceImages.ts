import type { CustomerSelectableGarmentType } from "./garmentConstructionPricing.js";
import {
  CUSTOMER_SELECTABLE_GARMENT_TYPES,
  type Step1GarmentCardPresetId,
} from "./garmentConstructionPricing.js";

export const STEP1_GARMENT_REFERENCE_DISCLAIMER =
  "Reference images show garment types only. Your selected Fabric and Design Style determine the final appearance.";

export const STEP1_GARMENT_REFERENCE_IMAGE_DIR = "/images/garments";

export interface Step1GarmentReferenceImageConfig {
  src: string;
  filename: string;
  isPlaceholder?: boolean;
}

const garmentReferenceImage = (
  filename: string,
  isPlaceholder = false,
): Step1GarmentReferenceImageConfig => ({
  filename,
  src: `${STEP1_GARMENT_REFERENCE_IMAGE_DIR}/${filename}`,
  ...(isPlaceholder ? { isPlaceholder: true } : {}),
});

/**
 * Presentation-only Step 1 reference photos, keyed by the authoritative
 * customer-selectable garment IDs. Missing keys fail TypeScript when a new
 * selectable garment is added.
 */
export const STEP1_GARMENT_REFERENCE_IMAGES: {
  readonly [K in CustomerSelectableGarmentType]: Step1GarmentReferenceImageConfig;
} = {
  shirt: garmentReferenceImage("ankara-standard-shirt.webp"),
  trouser: garmentReferenceImage("ankara-trouser.webp"),
  skirt: garmentReferenceImage("ankara-standard-skirt.webp"),
  long_skirt: garmentReferenceImage("ankara-long-skirt.webp"),
  standard_shorts: garmentReferenceImage("ankara-standard-shorts.webp"),
  bum_shorts: garmentReferenceImage("ankara-bum-shorts.webp"),
  dress: garmentReferenceImage("ankara-standard-dress.webp"),
  kaftan: garmentReferenceImage("ankara-kaftan-short-sleeve.webp"),
  full_length_gown: garmentReferenceImage("ankara-long-dress-gown-short-sleeve.webp"),
};

/**
 * These cards always reserve a paired, presentation-only image layout. A
 * secondary reference is only configured once its approved asset is present;
 * the card then renders its neutral unavailable state rather than substituting
 * a different garment image.
 */
export const STEP1_DUAL_IMAGE_GARMENT_TYPES = [
  "shirt",
  "kaftan",
  "dress",
  "full_length_gown",
] as const satisfies readonly CustomerSelectableGarmentType[];

export type Step1DualImageGarmentType =
  (typeof STEP1_DUAL_IMAGE_GARMENT_TYPES)[number];

export const STEP1_GARMENT_SECONDARY_REFERENCE_IMAGES: Readonly<
  Partial<Record<Step1DualImageGarmentType, Step1GarmentReferenceImageConfig>>
> = {
  shirt: garmentReferenceImage("ankara-standard-shirt-long-sleeve.webp"),
  kaftan: garmentReferenceImage("ankara-kaftan.webp"),
  dress: garmentReferenceImage("ankara-standard-dress-long-sleeve.webp"),
  full_length_gown: garmentReferenceImage("ankara-long-dress-gown.webp"),
};

/**
 * Per-card reference image mapping for all 17 Step 1 garment cards.
 * The 4 placeholder dress sleeve entries map to their expected `/images/garments/`
 * paths so the browser falls back to "Reference image unavailable" until those
 * 4 real photos are added.
 */
export const STEP1_GARMENT_PRESET_REFERENCE_IMAGES: Readonly<
  Record<Step1GarmentCardPresetId, Step1GarmentReferenceImageConfig>
> = {
  shirt_short_sleeve: garmentReferenceImage("ankara-standard-shirt.webp"),
  shirt_long_sleeve: garmentReferenceImage("ankara-standard-shirt-long-sleeve.webp"),
  kaftan_short_sleeve: garmentReferenceImage("ankara-kaftan-short-sleeve.webp"),
  kaftan_long_sleeve: garmentReferenceImage("ankara-kaftan.webp"),
  dress_sleeveless: garmentReferenceImage("ankara-standard-dress.webp"),
  dress_short_sleeve: garmentReferenceImage(
    "ankara-standard-dress-short-sleeve.webp",
    true,
  ),
  dress_mid_sleeve: garmentReferenceImage(
    "ankara-standard-dress-mid-sleeve.webp",
    true,
  ),
  dress_long_sleeve: garmentReferenceImage("ankara-standard-dress-long-sleeve.webp"),
  full_length_gown_sleeveless: garmentReferenceImage(
    "ankara-long-dress-gown-sleeveless.webp",
    true,
  ),
  full_length_gown_short_sleeve: garmentReferenceImage(
    "ankara-long-dress-gown-short-sleeve.webp",
  ),
  full_length_gown_mid_sleeve: garmentReferenceImage(
    "ankara-long-dress-gown-mid-sleeve.webp",
    true,
  ),
  full_length_gown_long_sleeve: garmentReferenceImage("ankara-long-dress-gown.webp"),
  skirt: garmentReferenceImage("ankara-standard-skirt.webp"),
  long_skirt: garmentReferenceImage("ankara-long-skirt.webp"),
  trouser: garmentReferenceImage("ankara-trouser.webp"),
  standard_shorts: garmentReferenceImage("ankara-standard-shorts.webp"),
  bum_shorts: garmentReferenceImage("ankara-bum-shorts.webp"),
};

export const STEP1_PLACEHOLDER_DRESS_REFERENCE_IMAGES: readonly Step1GarmentReferenceImageConfig[] = [
  STEP1_GARMENT_PRESET_REFERENCE_IMAGES.dress_short_sleeve,
  STEP1_GARMENT_PRESET_REFERENCE_IMAGES.dress_mid_sleeve,
  STEP1_GARMENT_PRESET_REFERENCE_IMAGES.full_length_gown_sleeveless,
  STEP1_GARMENT_PRESET_REFERENCE_IMAGES.full_length_gown_mid_sleeve,
];

export const getStep1PresetReferenceImage = (
  presetId: Step1GarmentCardPresetId,
): Step1GarmentReferenceImageConfig =>
  STEP1_GARMENT_PRESET_REFERENCE_IMAGES[presetId];

export const getStep1GarmentReferenceImage = (
  garmentType: CustomerSelectableGarmentType,
): Step1GarmentReferenceImageConfig =>
  STEP1_GARMENT_REFERENCE_IMAGES[garmentType];

export const isStep1DualImageGarmentType = (
  garmentType: string,
): garmentType is Step1DualImageGarmentType =>
  STEP1_DUAL_IMAGE_GARMENT_TYPES.includes(
    garmentType as Step1DualImageGarmentType,
  );

export const getStep1GarmentSecondaryReferenceImage = (
  garmentType: Step1DualImageGarmentType,
): Step1GarmentReferenceImageConfig | null =>
  STEP1_GARMENT_SECONDARY_REFERENCE_IMAGES[garmentType] || null;

export const isStep1GarmentReferenceType = (
  garmentType: string,
): garmentType is CustomerSelectableGarmentType =>
  Object.prototype.hasOwnProperty.call(
    STEP1_GARMENT_REFERENCE_IMAGES,
    garmentType,
  );

export const getStep1GarmentReferenceAlt = (garmentLabel: string): string =>
  `Ankara ${garmentLabel} reference`;

export const listMissingStep1GarmentReferenceImageKeys = (): CustomerSelectableGarmentType[] =>
  CUSTOMER_SELECTABLE_GARMENT_TYPES.filter(
    (garmentType): garmentType is CustomerSelectableGarmentType =>
      garmentType !== "agbada",
  ).filter((garmentType) => !STEP1_GARMENT_REFERENCE_IMAGES[garmentType]);
