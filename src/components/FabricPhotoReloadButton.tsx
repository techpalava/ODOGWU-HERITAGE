import { RotateCcw } from "lucide-react";

export const FABRIC_PHOTO_RELOAD_LABEL = "Tap to reload photo";

/**
 * Shown on the colour block after every automatic retry of a Fabric photo
 * failed. It only reloads the photo; it never selects or changes the Fabric.
 * `compact` renders an icon-only button for very small previews.
 */
export const FabricPhotoReloadButton = ({
  fabricName,
  onReload,
  compact = false,
}: {
  fabricName: string;
  onReload: () => void;
  compact?: boolean;
}) => (
  <button
    type="button"
    onClick={(event) => {
      if (event && typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
      onReload();
    }}
    aria-label={`${FABRIC_PHOTO_RELOAD_LABEL} of ${fabricName}`}
    title={FABRIC_PHOTO_RELOAD_LABEL}
    data-fabric-photo-reload="true"
    className={
      compact
        ? "inline-flex size-full items-center justify-center bg-black/10 text-white transition hover:bg-black/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-heritage-gold"
        : "inline-flex min-h-11 max-w-[calc(100%-1rem)] items-center justify-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 py-1.5 text-center text-[11px] font-bold leading-tight text-heritage-green shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
    }
  >
    <RotateCcw
      aria-hidden="true"
      size={compact ? 16 : 14}
      className={compact ? "shrink-0 drop-shadow" : "shrink-0"}
    />
    {compact ? null : <span>{FABRIC_PHOTO_RELOAD_LABEL}</span>}
  </button>
);
