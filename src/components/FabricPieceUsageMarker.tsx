import type { FabricUnitCount } from "../types";

export type FabricPieceUsage = "half" | "full";

/** A fabric piece holds 2 units: a 1-unit garment uses half, a 2-unit garment the whole piece. */
export const getFabricPieceUsage = (fabricUnits: FabricUnitCount): FabricPieceUsage =>
  fabricUnits >= 2 ? "full" : "half";

export const FABRIC_PIECE_USAGE_LABEL: Record<FabricPieceUsage, string> = {
  half: "Half piece",
  full: "Full piece",
};

export const FABRIC_PIECE_USAGE_ACCESSIBLE_LABEL: Record<FabricPieceUsage, string> = {
  half: "Uses half a fabric piece",
  full: "Uses a full fabric piece",
};

/** Green circle on Fabric step garment cards: half filled or fully filled. */
export const FabricPieceUsageMarker = ({
  fabricUnits,
}: {
  fabricUnits: FabricUnitCount;
}) => {
  const usage = getFabricPieceUsage(fabricUnits);
  return (
    <span
      data-fabric-piece-usage={usage}
      title={FABRIC_PIECE_USAGE_ACCESSIBLE_LABEL[usage]}
      className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-heritage-green"
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 14 14"
        className="h-3.5 w-3.5 shrink-0"
        data-fabric-piece-usage-icon={usage}
      >
        <circle
          cx="7"
          cy="7"
          r="6"
          fill={usage === "full" ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {usage === "half" ? <path d="M7 1 A6 6 0 0 0 7 13 Z" fill="currentColor" /> : null}
      </svg>
      <span aria-hidden="true">{FABRIC_PIECE_USAGE_LABEL[usage]}</span>
      <span className="sr-only">{FABRIC_PIECE_USAGE_ACCESSIBLE_LABEL[usage]}</span>
    </span>
  );
};
