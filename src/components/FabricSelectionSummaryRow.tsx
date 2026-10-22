import type { MouseEvent } from "react";
import { useImageLoadRetry } from "../hooks/useImageLoadRetry";
import type { Fabric } from "../types";
import { hasUsableFabricImage } from "../utils/fabricCatalogueAvailability";
import { getFabricSelectionBadgeClass } from "../utils/fabricSelectionHighlight";
import type { FabricSelectionSummaryItem } from "../utils/fabricSelectionSummaryRow";
import {
  buildOptimizedImageSources,
  FABRIC_THUMB_IMAGE_PRESET,
} from "../utils/optimizedImageUrl";
import { isUsableFabricColorHex } from "./AssignedFabricPreview";

const formatList = (labels: readonly string[]): string => {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};

/** Decorative swatch; no nested reload button because it sits inside a <button>. */
const SelectionSwatch = ({ fabric, fabricCode }: { fabric: Fabric | null; fabricCode: string }) => {
  const imageUrl = hasUsableFabricImage(fabric) ? fabric!.image!.trim() : null;
  const colorHex = isUsableFabricColorHex(fabric?.colorHex) ? fabric!.colorHex.trim() : null;
  const image = useImageLoadRetry(imageUrl, {
    optimized: buildOptimizedImageSources(imageUrl, FABRIC_THUMB_IMAGE_PRESET),
    report: { surface: "fabric-preview", fabricCode },
  });
  const className =
    "inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-heritage-gold/40 bg-heritage-cream/60";
  if (imageUrl && !image.failed) {
    return (
      <span className={className} aria-hidden="true" data-fabric-selection-summary-swatch="image">
        <img
          key={image.imageKey}
          src={image.src}
          srcSet={image.srcSet}
          sizes={image.sizes}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={image.onError}
        />
      </span>
    );
  }
  return (
    <span
      className={className}
      aria-hidden="true"
      data-fabric-selection-summary-swatch={colorHex ? "color" : "none"}
      style={colorHex ? { backgroundColor: colorHex } : undefined}
    />
  );
};

export const FabricSelectionSummaryRow = ({
  items,
  changingAllocationId,
  onSelectSelection,
}: {
  items: readonly FabricSelectionSummaryItem[];
  changingAllocationId: string | null;
  onSelectSelection: (
    item: FabricSelectionSummaryItem,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
}) => {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Your Fabric Selections"
      data-fabric-selection-summary-row="true"
      className="mb-5 min-w-0 scroll-mt-28"
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-ink/60">
        Your Fabric Selections · tap one to change its fabric
      </p>
      <ul data-fabric-selection-summary-list="true"
        data-fabric-selection-summary-safe-area="floating-actions"
        className="-ml-1 mr-14 flex min-w-0 snap-x snap-mandatory scroll-pl-1.5 gap-3 overflow-x-auto overscroll-x-contain pb-3 pl-1.5 pr-1.5 pt-1.5 sm:-mr-1 sm:snap-none sm:flex-wrap sm:overflow-visible">
        {items.map((item) => {
          const active = item.allocationId === changingAllocationId;
          const garmentList = formatList(item.garmentLabels);
          return (
            <li
              key={item.allocationId}
              className="flex w-[calc(100%-2rem)] max-w-64 shrink-0 snap-start sm:w-60 sm:max-w-none"
            >
              <button
                type="button"
                aria-pressed={active}
                aria-label={`Fabric Selection ${item.selectionNumber}: ${item.fabricName} for ${garmentList}. Capacity ${item.capacityLabel}.${
                  active ? " Changing now." : " Change fabric for this selection."
                }`}
                data-fabric-selection-summary-button={String(item.selectionNumber)}
                data-fabric-selection-summary-allocation={item.allocationId}
                data-fabric-selection-summary-active={active ? "true" : undefined}
                onClick={(event) => onSelectSelection(item, event)}
                className={`flex h-full w-full min-w-0 items-start gap-2 rounded-xl border bg-white p-2.5 text-left sm:gap-3 sm:p-3 transition hover:border-heritage-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${
                  active
                    ? "border-heritage-gold bg-heritage-gold/10 ring-2 ring-heritage-gold ring-offset-2 ring-offset-white"
                    : "border-heritage-gold/25"
                }`}
              >
                <span className="flex shrink-0 flex-col items-center gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                  <span
                    aria-hidden="true"
                    data-fabric-selection-summary-badge="true"
                    className={`shrink-0 ${getFabricSelectionBadgeClass(item.selectionNumber)}`}
                  >
                    {item.selectionNumber}
                  </span>
                  <SelectionSwatch fabric={item.fabric} fabricCode={item.fabricCode} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {active ? (
                    <span
                      data-fabric-selection-summary-changing-tag="true"
                      className="self-start rounded-full border border-heritage-gold bg-heritage-gold/15 px-2 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-heritage-gold"
                    >
                      Changing
                    </span>
                  ) : null}
                  <span
                    data-fabric-selection-summary-name="true"
                    title={item.fabricName}
                    className="line-clamp-2 min-w-0 break-words text-xs font-bold leading-snug text-heritage-green"
                  >
                    {item.fabricName}
                  </span>
                  <span
                    data-fabric-selection-summary-garments="true"
                    className="break-words text-[11px] leading-snug text-heritage-ink/70"
                  >
                    {garmentList}
                  </span>
                  {item.capacityLabel ? (
                    <span
                      data-fabric-selection-summary-capacity={item.capacityTone}
                      className={`self-start rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight ${
                        item.capacityTone === "reusable_capacity"
                          ? "border border-red-200 bg-red-600 text-white"
                          : "border border-heritage-gold/30 bg-heritage-green text-white"
                      }`}
                    >
                      {item.capacityLabel}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
