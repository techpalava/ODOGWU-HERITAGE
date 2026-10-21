/**
 * Card-sized catalogue photos through Vercel Image Optimization.
 *
 * Fabric photos in Firebase Storage are up to ~1600 px wide and 0.6-0.9 MB,
 * but the cards that show them are ~100-400 CSS px wide. 512 px is the
 * largest width served (sharp enough for a ~300 px card on a 2x screen). On Vercel,
 * `/_vercel/image?url=<encoded>&w=<width>&q=<quality>` (enabled by the
 * `images` block in vercel.json) resizes the original on demand, converts it
 * to WebP, and serves it from the site's own domain. The stored Firestore
 * `image` URL is never changed: it stays the full-size original and is the
 * fallback when an optimised request fails.
 *
 * Keep these widths, the quality, and the allowed hosts in sync with
 * `images.sizes`, `images.qualities` and `images.remotePatterns` in vercel.json
 * (test_fabric_photo_reliability.tsx checks that they match).
 */

export const VERCEL_IMAGE_ENDPOINT = "/_vercel/image";

/** Every width the site may request. Must equal vercel.json `images.sizes`. */
export const VERCEL_IMAGE_SIZES = [128, 256, 384, 512] as const;
export type VercelImageWidth = (typeof VERCEL_IMAGE_SIZES)[number];

/**
 * Must be listed in vercel.json `images.qualities`. 60 keeps every current
 * fabric under ~80 KB at 512 px (measured on the preview, 2026-10-20).
 */
export const VERCEL_IMAGE_QUALITY = 60;

/** The project's Firebase Storage bucket (firebase-applet-config.json). */
export const FIREBASE_STORAGE_BUCKET = "gen-lang-client-0614710868.firebasestorage.app";

export interface ResponsiveImagePreset {
  /** Widths offered in `srcset`, smallest first; each must be in VERCEL_IMAGE_SIZES. */
  widths: readonly VercelImageWidth[];
  /** Width used for the plain `src` (browsers without srcset support). */
  fallbackWidth: VercelImageWidth;
  /** The `sizes` attribute for the layout the image sits in. */
  sizes: string;
}

/** Fabric catalogue cards: 1 column on phones, up to 4 columns on wide screens. */
export const FABRIC_CARD_IMAGE_PRESET: ResponsiveImagePreset = {
  widths: [256, 384, 512],
  fallbackWidth: 384,
  sizes: "(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 46vw, 92vw",
};

/** Assigned-Fabric previews: full width (100 px tall) on phones, 128 px from `sm`. */
export const FABRIC_PREVIEW_IMAGE_PRESET: ResponsiveImagePreset = {
  widths: [128, 256, 384, 512],
  fallbackWidth: 256,
  sizes: "(min-width: 640px) 128px, 92vw",
};

/** Small square thumbs (Summary fabric thumb, 44 px Step 5 previews). */
export const FABRIC_THUMB_IMAGE_PRESET: ResponsiveImagePreset = {
  widths: [128, 256],
  fallbackWidth: 128,
  sizes: "96px",
};

/** Design Style catalogue cards: 1 column on phones, 2 from `sm`, 3 from `xl` (4:3, object-contain). */
export const DESIGN_STYLE_CARD_IMAGE_PRESET: ResponsiveImagePreset = {
  widths: [256, 384, 512],
  fallbackWidth: 384,
  sizes: "(min-width: 1280px) 30vw, (min-width: 640px) 46vw, 92vw",
};

/** Design Style dialog photos (Apply / Read more), up to ~576 CSS px wide. */
export const DESIGN_STYLE_DIALOG_IMAGE_PRESET: ResponsiveImagePreset = {
  widths: [384, 512],
  fallbackWidth: 512,
  sizes: "(min-width: 640px) 576px, 92vw",
};

/** Small Design Style thumbs (Step 3 occurrence preview, Summary 96 px thumb). */
export const DESIGN_STYLE_THUMB_IMAGE_PRESET: ResponsiveImagePreset = {
  widths: [128, 256],
  fallbackWidth: 256,
  sizes: "96px",
};

export interface OptimizedImageSources {
  src: string;
  srcSet: string;
  sizes: string;
}

let optimizationOverride: boolean | null = null;

/**
 * `/_vercel/image` only exists on Vercel deployments, so the optimised URLs are
 * used in production builds only. Local `vite` dev keeps the original URLs.
 * Tests can force either mode.
 */
export const isImageOptimizationEnabled = (): boolean => {
  if (optimizationOverride !== null) return optimizationOverride;
  const env = (import.meta as { env?: { PROD?: boolean } }).env;
  return env?.PROD === true;
};

/** Test hook: force optimisation on/off, or pass null to follow the build mode. */
export const setImageOptimizationEnabledForTests = (value: boolean | null): void => {
  optimizationOverride = value;
};

/** True for Firebase Storage download URLs of this project's bucket only. */
export const isOptimizableImageUrl = (url: string | null | undefined): url is string => {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.port !== "") return false;
  if (parsed.hostname === "firebasestorage.googleapis.com") {
    return parsed.pathname.startsWith(`/v0/b/${FIREBASE_STORAGE_BUCKET}/o/`);
  }
  return parsed.hostname === FIREBASE_STORAGE_BUCKET;
};

/**
 * True only for published catalogue Design Style photos (`styles/` or the
 * seeded `designs/` folder). Customer uploads stay on their original URL so
 * they are never cached by the site's image optimiser.
 */
export const isCatalogueDesignImageUrl = (url: string | null | undefined): url is string => {
  if (!isOptimizableImageUrl(url)) return false;
  let objectPath = "";
  try {
    const parsed = new URL(url.trim());
    const prefix = `/v0/b/${FIREBASE_STORAGE_BUCKET}/o/`;
    objectPath =
      parsed.hostname === "firebasestorage.googleapis.com"
        ? decodeURIComponent(parsed.pathname.slice(prefix.length))
        : decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return false;
  }
  return objectPath.startsWith("styles/") || objectPath.startsWith("designs/");
};

export const buildVercelImageUrl = (
  url: string,
  width: VercelImageWidth,
  quality: number = VERCEL_IMAGE_QUALITY,
): string =>
  `${VERCEL_IMAGE_ENDPOINT}?url=${encodeURIComponent(url.trim())}&w=${width}&q=${quality}`;

/**
 * Optimised `src` / `srcSet` / `sizes` for a remote photo, or null when the
 * photo cannot (or should not) go through `/_vercel/image`. A null result
 * means "render the original URL".
 */
export const buildOptimizedImageSources = (
  url: string | null | undefined,
  preset: ResponsiveImagePreset,
  options: { enabled?: boolean } = {},
): OptimizedImageSources | null => {
  const enabled = options.enabled ?? isImageOptimizationEnabled();
  if (!enabled || !isOptimizableImageUrl(url)) return null;
  const original = url.trim();
  return {
    src: buildVercelImageUrl(original, preset.fallbackWidth),
    srcSet: preset.widths
      .map((width) => `${buildVercelImageUrl(original, width)} ${width}w`)
      .join(", "),
    sizes: preset.sizes,
  };
};

/** Hostname for logs ("" when the URL is not absolute). */
export const getImageHost = (url: string | null | undefined): string => {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    return new URL(url.trim()).hostname;
  } catch {
    return "";
  }
};
