export const NECK_DESIGN_IMAGE_DIR = "/images/neck-designs";

/**
 * Presentation-only Neck Design photos. Same-origin WebP files live in
 * public/images/neck-designs/ so img-src 'self' can load them.
 * Keyed by the seeded neck_design option ids. None stays text-only.
 */
export const NECK_DESIGN_OPTION_IDS = [
  "neck_no_round",
  "neck_no_v",
  "neck_no_u",
  "neck_vert_round",
  "neck_vert_v",
  "neck_vert_u",
  "neck_flat_round",
  "neck_flat_v",
  "neck_flat_u",
] as const;

export type NeckDesignOptionId = (typeof NECK_DESIGN_OPTION_IDS)[number];

export const NECK_DESIGN_IMAGES: Record<
  NeckDesignOptionId,
  { src: string }
> = {
  neck_no_round: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_no_round.webp`,
  },
  neck_no_v: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_no_v.webp`,
  },
  neck_no_u: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_no_u.webp`,
  },
  neck_vert_round: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_vert_round.webp`,
  },
  neck_vert_v: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_vert_v.webp`,
  },
  neck_vert_u: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_vert_u.webp`,
  },
  neck_flat_round: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_flat_round.webp`,
  },
  neck_flat_v: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_flat_v.webp`,
  },
  neck_flat_u: {
    src: `${NECK_DESIGN_IMAGE_DIR}/neck_flat_u.webp`,
  },
};

export const isNeckDesignOptionId = (
  optionId: string,
): optionId is NeckDesignOptionId =>
  (NECK_DESIGN_OPTION_IDS as readonly string[]).includes(optionId);

export const getNeckDesignImage = (
  optionId: string,
): { src: string } | null =>
  isNeckDesignOptionId(optionId) ? NECK_DESIGN_IMAGES[optionId] : null;
