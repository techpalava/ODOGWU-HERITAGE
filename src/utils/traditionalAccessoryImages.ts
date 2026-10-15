import type { TraditionalAccessory } from "./decorativePricing";

export const TRADITIONAL_ACCESSORY_IMAGE_DIR = "/images/accessories";

/**
 * Presentation-only Step 5 photos. Same-origin WebP files live in
 * public/images/accessories/ so img-src 'self' can load them.
 *
 * Owner-supplied brand images, not stock photographs.
 * Traditional Hat — maroon and gold fila. The cap cloth carries the crest
 * from src/assets/images/odogwu_logo_1782556303014.jpg.
 * Traditional Bead — coral bead sets on wooden stands. The wooden bases
 * carry the same crest.
 * Traditional Stick — gold horse-head walking cane, unchanged.
 */
export const TRADITIONAL_ACCESSORY_IMAGES: Record<
  TraditionalAccessory,
  { src: string }
> = {
  "Traditional Hat": {
    src: `${TRADITIONAL_ACCESSORY_IMAGE_DIR}/traditional-hat.webp`,
  },
  "Traditional Bead": {
    src: `${TRADITIONAL_ACCESSORY_IMAGE_DIR}/traditional-bead.webp`,
  },
  "Traditional Stick": {
    src: `${TRADITIONAL_ACCESSORY_IMAGE_DIR}/traditional-stick.webp`,
  },
};
