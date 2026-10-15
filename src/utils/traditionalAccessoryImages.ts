import type { TraditionalAccessory } from "./decorativePricing";

export const TRADITIONAL_ACCESSORY_IMAGE_DIR = "/images/accessories";

/**
 * Presentation-only Step 5 photos. Same-origin WebP files live in
 * public/images/accessories/ so img-src 'self' can load them.
 *
 * Traditional Hat — striped traditional cap, fila-style crop.
 * Source: https://unsplash.com/photos/man-wearing-traditional-african-attire-and-headwrap-GZ-96_sZZak
 * License: Unsplash License, https://unsplash.com/license — free to use, including commercially.
 *
 * Traditional Bead — Nigerian coral bead necklaces.
 * Source: https://www.pexels.com/photo/nigerian-woman-in-traditional-coral-beaded-attire-40060000/
 * License: Pexels License, https://www.pexels.com/license/ — free to use, including commercially.
 *
 * Traditional Stick — wooden walking-cane handles.
 * Source: https://unsplash.com/photos/several-wooden-cane-handles-arranged-together-bDAandgmreU
 * License: Unsplash License, https://unsplash.com/license — free to use, including commercially.
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
