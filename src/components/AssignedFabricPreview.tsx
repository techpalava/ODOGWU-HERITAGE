import { useEffect, useState } from "react";
import type { Fabric } from "../types";
import {
  hasUsableFabricImage,
} from "../utils/fabricCatalogueAvailability";

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

/**
 * Compact assigned-Fabric preview for garment cards. Derives from the current
 * catalogue Fabric record — never stores image URLs on allocations.
 */
export const AssignedFabricPreview = ({
  fabric,
  garmentKey,
  garmentLabel,
  fabricCode,
}: {
  fabric: Fabric | null | undefined;
  garmentKey: string;
  garmentLabel: string;
  fabricCode: string;
}) => {
  const previewCode = fabric?.code || fabricCode;
  const imageUrl = hasUsableFabricImage(fabric) ? fabric!.image!.trim() : null;
  const colorHex = isUsableFabricColorHex(fabric?.colorHex)
    ? fabric!.colorHex.trim()
    : null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl, previewCode]);

  const commonProps = {
    "data-assigned-fabric-preview": "true",
    "data-garment-key": garmentKey,
    "data-fabric-code": previewCode,
    className: ASSIGNED_FABRIC_PREVIEW_CLASSNAME,
  } as const;

  if (imageUrl && !imageFailed) {
    return (
      <div {...commonProps}>
        <img
          src={imageUrl}
          alt={`${fabric!.name} selected for ${garmentLabel}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  if (colorHex && fabric) {
    return (
      <div
        {...commonProps}
        role="img"
        aria-label={`${fabric.name} Fabric colour preview for ${garmentLabel}`}
        style={{ backgroundColor: colorHex }}
      />
    );
  }

  return (
    <div
      {...commonProps}
      role="img"
      aria-label={`Fabric preview unavailable for ${garmentLabel}`}
    >
      <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-semibold leading-snug text-heritage-ink/50">
        Fabric preview unavailable
      </div>
    </div>
  );
};
