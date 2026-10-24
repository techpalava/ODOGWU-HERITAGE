import { Pencil } from "lucide-react";
import type { MouseEvent } from "react";
import { useImageLoadRetry } from "../hooks/useImageLoadRetry";
import type { Fabric } from "../types";
import { hasUsableFabricImage } from "../utils/fabricCatalogueAvailability";
import { getFabricSelectionBadgeClass } from "../utils/fabricSelectionHighlight";
import {
  formatFabricSelectionSummaryGarmentLine,
  type FabricSelectionSummaryItem,
} from "../utils/fabricSelectionSummaryRow";
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
    "inline-flex h-7 w-7 shrink-0 overflow-hidden rounded-full border border-heritage-gold/40 bg-heritage-cream/60";
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
      className="mb-4 min-w-0 scroll-mt-28"
    >
      <p
        data-fabric-selection-summary-intro="true"
        className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-heritage-ink/85"
      >
        Your Fabric Selections
        <span className="font-bold normal-case tracking-normal text-heritage-ink/75">
          {" "}· tap one to change its fabric
        </span>
      </p>
      <ul data-fabric-selection-summary-list="true"
        data-fabric-selection-summary-safe-area="floating-actions"
        className="-ml-1 mr-14 flex min-w-0 snap-x snap-mandatory scroll-pl-1.5 gap-2 overflow-x-auto overscroll-x-contain pb-2.5 pl-1.5 pr-1.5 pt-1.5 sm:-mr-1 sm:snap-none sm:flex-wrap sm:overflow-visible">
        {items.map((item) => {
          const active = item.allocationId === changingAllocationId;
          const garmentList = formatList(item.garmentLabels);
          const garmentLineFull = formatFabricSelectionSummaryGarmentLine(item.garmentLabels, "full");
          const garmentLineCompact = formatFabricSelectionSummaryGarmentLine(item.garmentLabels, "compact");
          return (
            <li
              key={item.allocationId}
              className="flex w-[calc(100%-2rem)] max-w-56 shrink-0 snap-start sm:w-52 sm:max-w-none"
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
                data-fabric-selection-summary-density="compact"
                data-fabric-selection-summary-hover-cue="lift-underline"
                onClick={(event) => onSelectSelection(item, event)}
                className={`group flex h-full w-full min-w-0 cursor-pointer items-start gap-2 rounded-lg border bg-white px-2 py-1.5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-heritage-gold hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 active:-translate-y-0.5 active:border-heritage-gold active:shadow-md motion-reduce:transform-none motion-reduce:transition-none ${
                  active
                    ? "border-heritage-gold bg-heritage-gold/10 ring-2 ring-heritage-gold ring-offset-2 ring-offset-white"
                    : "border-heritage-gold/30 shadow-sm"
                }`}
              >
                <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                  <span
                    aria-hidden="true"
                    data-fabric-selection-summary-badge="true"
                    className={`shrink-0 ${getFabricSelectionBadgeClass(item.selectionNumber)}`}
                  >
                    {item.selectionNumber}
                  </span>
                  <SelectionSwatch fabric={item.fabric} fabricCode={item.fabricCode} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {active ? (
                    <span
                      data-fabric-selection-summary-changing-tag="true"
                      className="self-start rounded-full border border-heritage-gold bg-heritage-gold/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-wide text-heritage-gold"
                    >
                      Changing
                    </span>
                  ) : null}
                  <span
                    data-fabric-selection-summary-name="true"
                    title={item.fabricName}
                    className="line-clamp-2 min-w-0 break-words text-xs font-extrabold leading-[1.6] text-heritage-green"
                  >
                    {/* Underline lives on the inline text (spans only the name,
                        not the card). line-clamp-2 clips overflow, so the taller
                        leading-[1.6] keeps the 2px line inside each line box
                        (never clipped, no third-line peek). Darker gold
                        #8A6A1F (~5:1 on white) so it reads clearly. */}
                    <span
                      data-fabric-selection-summary-name-underline="true"
                      className="decoration-[#8A6A1F] decoration-2 underline-offset-2 [text-decoration-skip-ink:none] group-hover:underline group-focus-visible:underline group-active:underline"
                    >
                      {item.fabricName}
                    </span>
                  </span>
                  <span
                    data-fabric-selection-summary-garments="true"
                    title={garmentLineFull}
                    className="min-w-0 truncate text-[10.5px] font-semibold leading-tight text-heritage-ink/80"
                  >
                    <span data-fabric-selection-summary-garments-compact="true" className="sm:hidden">
                      {garmentLineCompact}
                    </span>
                    <span data-fabric-selection-summary-garments-full="true" className="hidden sm:inline">
                      {garmentLineFull}
                    </span>
                  </span>
                  <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
                    {item.capacityLabel ? (
                      <span
                        data-fabric-selection-summary-capacity={item.capacityTone}
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${
                          item.capacityTone === "reusable_capacity"
                            ? "border border-red-200 bg-red-600 text-white"
                            : "border border-heritage-gold/30 bg-heritage-green text-white"
                        }`}
                      >
                        {item.capacityLabel}
                      </span>
                    ) : null}
                    <span
                      aria-hidden="true"
                      data-fabric-selection-summary-change-chip="true"
                      className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-heritage-gold bg-heritage-gold/10 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-heritage-gold transition group-hover:bg-heritage-gold group-hover:text-white group-focus-visible:bg-heritage-gold group-focus-visible:text-white group-active:bg-heritage-gold group-active:text-white"
                    >
                      <Pencil className="h-2.5 w-2.5" strokeWidth={2.75} aria-hidden="true" />
                      Change
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
