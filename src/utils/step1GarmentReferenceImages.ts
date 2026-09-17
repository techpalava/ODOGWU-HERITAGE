import type { CustomerSelectableGarmentType } from "./garmentConstructionPricing";
import { CUSTOMER_SELECTABLE_GARMENT_TYPES } from "./garmentConstructionPricing";

export const STEP1_GARMENT_REFERENCE_DISCLAIMER =
  "Reference images show garment types only. Your selected Fabric and Design Style determine the final appearance.";

export const STEP1_GARMENT_REFERENCE_IMAGE_DIR = "/images/garments";

export interface Step1GarmentReferenceImageConfig {
  src: string;
  filename: string;
}

const garmentReferenceImage = (
  filename: string,
): Step1GarmentReferenceImageConfig => ({
  filename,
  src: `${STEP1_GARMENT_REFERENCE_IMAGE_DIR}/${filename}`,
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
