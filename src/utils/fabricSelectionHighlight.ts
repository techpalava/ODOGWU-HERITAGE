/**
 * Fabric step card pairing and "changing Fabric Selection N" highlight.
 *
 * Selection numbers are 1-based Fabric Selection order (allocation order).
 * Cards that share a Fabric share a number, so they share a badge colour.
 * Highlight state is derived from the current Change Fabric target: it is
 * never stored on its own, and it clears as soon as that target is gone.
 */

export type FabricSelectionCardHighlight = "changing" | "dimmed" | "idle";

export interface FabricSelectionBadgeTone {
  id: string;
  className: string;
}

/** Distinct, repeating colours for Fabric Selection 1, 2, 3, … */
export const FABRIC_SELECTION_BADGE_TONES: readonly FabricSelectionBadgeTone[] = [
  { id: "gold", className: "bg-heritage-gold text-heritage-forest" },
  { id: "green", className: "bg-heritage-green text-heritage-cream" },
  { id: "bronze", className: "bg-heritage-bronze text-heritage-cream" },
  { id: "teal", className: "bg-[#1F6F6A] text-white" },
  { id: "burgundy", className: "bg-[#7A2E3A] text-white" },
  { id: "navy", className: "bg-[#1E3A5F] text-white" },
  { id: "terracotta", className: "bg-[#C46B3A] text-white" },
  { id: "plum", className: "bg-[#5C3D6E] text-white" },
];

export const FABRIC_SELECTION_CHANGING_CARD_CLASS =
  "border-heritage-gold ring-2 ring-heritage-gold ring-offset-2 ring-offset-white";

/** Lower opacity, still readable and clickable. */
export const FABRIC_SELECTION_DIMMED_CARD_CLASS = "opacity-60";

export const getFabricSelectionBadgeTone = (
  selectionNumber: number,
): FabricSelectionBadgeTone => {
  const index = Math.trunc(selectionNumber);
  if (!Number.isFinite(index) || index < 1) {
    return FABRIC_SELECTION_BADGE_TONES[0]!;
  }
  return FABRIC_SELECTION_BADGE_TONES[
    (index - 1) % FABRIC_SELECTION_BADGE_TONES.length
  ]!;
};

export const getFabricSelectionBadgeClass = (selectionNumber: number): string =>
  `inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold leading-none ${getFabricSelectionBadgeTone(selectionNumber).className}`;

export const resolveFabricSelectionCardHighlight = ({
  changingSelectionNumber,
  cardSelectionNumber,
}: {
  changingSelectionNumber: number | null | undefined;
  cardSelectionNumber: number | null | undefined;
}): FabricSelectionCardHighlight => {
  if (
    changingSelectionNumber == null ||
    !Number.isFinite(changingSelectionNumber) ||
    changingSelectionNumber < 1
  ) {
    return "idle";
  }
  if (cardSelectionNumber === changingSelectionNumber) {
    return "changing";
  }
  return "dimmed";
};

export const getFabricSelectionCardClass = (
  highlight: FabricSelectionCardHighlight,
): string => {
  if (highlight === "changing") return FABRIC_SELECTION_CHANGING_CARD_CLASS;
  if (highlight === "dimmed") return FABRIC_SELECTION_DIMMED_CARD_CLASS;
  return "";
};

/**
 * First garment card in roster order that belongs to the selection being
 * changed. Used to scroll back from the catalogue heading.
 */
export const getFirstChangingGarmentKey = (
  orderedGarmentKeys: readonly string[],
  changingGarmentKeys: readonly string[],
): string | null => {
  if (changingGarmentKeys.length === 0) return null;
  const changing = new Set(changingGarmentKeys);
  return (
    orderedGarmentKeys.find((garmentKey) => changing.has(garmentKey)) ??
    changingGarmentKeys[0] ??
    null
  );
};
