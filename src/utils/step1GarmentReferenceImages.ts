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
  standard_shorts: garmentReferenceImage("ankara-standard-shorts.webp"),
  bum_shorts: garmentReferenceImage("ankara-bum-shorts.webp"),
  dress: garmentReferenceImage("ankara-standard-dress.webp"),
  kaftan: garmentReferenceImage("ankara-kaftan.webp"),
  full_length_gown: garmentReferenceImage("ankara-long-dress-gown.webp"),
};

export const getStep1GarmentReferenceImage = (
  garmentType: CustomerSelectableGarmentType,
): Step1GarmentReferenceImageConfig =>
  STEP1_GARMENT_REFERENCE_IMAGES[garmentType];

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
