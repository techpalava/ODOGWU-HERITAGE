/**
 * Cache-Control for admin catalogue image uploads (fabrics, styles, designs,
 * gallery, logos, hero). Upload paths are content-unique (uuid or millisecond
 * timestamp file names) and are never overwritten in place, so browsers may
 * keep them for a year. A replaced image always gets a new path and URL.
 * If an upload ever writes to a fixed, reused path, use
 * STORAGE_REUSED_PATH_CACHE_CONTROL instead.
 */
export const STORAGE_IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const STORAGE_REUSED_PATH_CACHE_CONTROL = "public, max-age=86400";
