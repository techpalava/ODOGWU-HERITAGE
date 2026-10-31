import type { Fabric } from "../types.js";
import {
  hasUsableFabricImage,
} from "../utils/fabricCatalogueAvailability.js";
import { useImageLoadRetry } from "../hooks/useImageLoadRetry.js";
import {
  buildOptimizedImageSources,
  FABRIC_PREVIEW_IMAGE_PRESET,
  FABRIC_THUMB_IMAGE_PRESET,
} from "../utils/optimizedImageUrl.js";
import { FabricPhotoReloadButton } from "./FabricPhotoReloadButton.js";

/** Accept only catalogue-style hex colours: #RGB, #RRGGBB, #RRGGBBAA. */
export const isUsableFabricColorHex = (
  value: string | null | undefined,
): value is string => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(trimmed);
};

export const ASSIGNED_FABRIC_PREVIEW_CLASSNAME =
  "h-[100px] w-full overflow-hidden rounded-lg border border-heritage-gold/25 bg-heritage-cream/40 sm:h-[100px] sm:w-[128px] sm:shrink-0";

/** Square photo slot on the Fabric step garment cards (88px on phones, 104px from sm up). */
export const GARMENT_CARD_FABRIC_PHOTO_CLASSNAME =
  "h-[88px] w-[88px] shrink-0 overflow-hidden rounded-lg border border-heritage-gold/25 bg-heritage-cream/40 sm:h-[104px] sm:w-[104px]";

/**
 * Compact assigned-Fabric preview for garment cards. Derives from the current
 * catalogue Fabric record — never stores image URLs on allocations.
 *
 * Uses the shared `useImageLoadRetry` hook: resized photo first, then the
 * original, then retries with growing gaps and on `online`. After the last
 * retry it shows the colour block with a "Tap to reload photo" button.
 * `size="thumb"` is for the 44 px Step 5 previews (icon-only reload button).
 */
export const AssignedFabricPreview = ({
  fabric,
  garmentKey,
  garmentLabel,
  fabricCode,
  className = ASSIGNED_FABRIC_PREVIEW_CLASSNAME,
  imageAlt,
  size = "preview",
}: {
  fabric: Fabric | null | undefined;
  garmentKey: string;
  garmentLabel: string;
  fabricCode: string;
  className?: string;
  /** Overrides the image alt text; defaults to "<Fabric> selected for <garment>". */
  imageAlt?: string;
  /** "thumb" for very small previews: smaller photo and an icon-only reload button. */
  size?: "preview" | "thumb";
}) => {
  const previewCode = fabric?.code || fabricCode;
  const imageUrl = hasUsableFabricImage(fabric) ? fabric!.image!.trim() : null;
  const colorHex = isUsableFabricColorHex(fabric?.colorHex)
    ? fabric!.colorHex.trim()
    : null;
  const image = useImageLoadRetry(imageUrl, {
    optimized: buildOptimizedImageSources(
      imageUrl,
      size === "thumb" ? FABRIC_THUMB_IMAGE_PRESET : FABRIC_PREVIEW_IMAGE_PRESET,
    ),
    report: previewCode
      ? { surface: "fabric-preview", fabricCode: previewCode }
      : null,
  });
  const canReloadPhoto = Boolean(imageUrl) && image.failed;
  const fabricName = fabric?.name || previewCode;

  const commonProps = {
    "data-assigned-fabric-preview": "true",
    "data-garment-key": garmentKey,
    "data-fabric-code": previewCode,
    className,
  } as const;

  if (imageUrl && !image.failed) {
    return (
      <div {...commonProps}>
        <img
          key={image.imageKey}
          src={image.src}
          srcSet={image.srcSet}
          sizes={image.sizes}
          alt={imageAlt ?? `${fabric!.name} selected for ${garmentLabel}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={image.onError}
          data-fabric-image-source={image.source}
        />
      </div>
    );
  }

  const reloadControl = canReloadPhoto ? (
    <div className="absolute inset-0 flex items-center justify-center p-1">
      <FabricPhotoReloadButton
        fabricName={fabricName}
        onReload={image.retry}
        compact={size === "thumb"}
      />
    </div>
  ) : null;
  // role="img" hides its children from assistive tech, so once the reload
  // button is shown the frame becomes a labelled group instead.
  const fallbackRole = canReloadPhoto ? "group" : "img";
  const fallbackClassName = canReloadPhoto ? `relative ${className}` : className;

  if (colorHex && fabric) {
    return (
      <div
        {...commonProps}
        className={fallbackClassName}
        role={fallbackRole}
        aria-label={`${fabric.name} Fabric colour preview for ${garmentLabel}`}
        style={{ backgroundColor: colorHex }}
        data-fabric-preview-swatch="true"
      >
        {reloadControl}
      </div>
    );
  }

  return (
    <div
      {...commonProps}
      className={fallbackClassName}
      role={fallbackRole}
      aria-label={`Fabric preview unavailable for ${garmentLabel}`}
    >
      <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-semibold leading-snug text-heritage-ink/50">
        {/* Kept for screen readers; the reload button covers it visually. */}
        <span className={canReloadPhoto ? "sr-only" : undefined}>
          Fabric preview unavailable
        </span>
      </div>
      {reloadControl}
    </div>
  );
};
