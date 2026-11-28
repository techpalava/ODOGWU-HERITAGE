import { useState } from "react";
import type { Fabric } from "../types";
import { AssignedFabricPreview } from "./AssignedFabricPreview";
import {
  getStep1GarmentReferenceAlt,
  getStep1GarmentReferenceImage,
} from "../utils/step1GarmentReferenceImages";

type Step1GarmentReferenceImage = ReturnType<typeof getStep1GarmentReferenceImage>;

export const GarmentContextDesignThumb = ({
  garmentKey,
  garmentLabel,
  imageUrl,
  className = "size-14 sm:size-20 shrink-0 rounded-lg border border-heritage-gold/25 bg-heritage-cream/40 object-cover",
  fallbackClassName = "flex size-14 sm:size-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-heritage-gold/35 px-1 text-center text-[9px] font-semibold leading-tight text-heritage-ink/55",
}: {
  garmentKey: string;
  garmentLabel: string;
  imageUrl: string | null;
  className?: string;
  fallbackClassName?: string;
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={`Selected design for ${garmentLabel}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(imageUrl)}
        data-garment-context-design={garmentKey}
        className={className}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`No design photo for ${garmentLabel}`}
      data-garment-context-design={garmentKey}
      data-garment-context-design-missing="true"
      className={fallbackClassName}
    >
      No design photo
    </div>
  );
};

export interface OrderSummaryGarmentCardProps {
  garmentKey: string;
  baseGarmentLabel: string;
  garmentLabel: string;
  plainDescription: string | null;
  sourceRole: "main" | "additional" | string;
  referenceImage: Step1GarmentReferenceImage | null;
  assignedFabric: {
    fabric: Fabric | null;
    fabricCode: string;
  } | null;
  design: {
    name?: string | null;
    imageUrl?: string | null;
  } | null;
  step4Marker?: string;
  step5Marker?: string;
}

/**
 * Shared order-summary garment context card used across Step 4 (Custom Details)
 * and Step 5 (Personalized Additions).
 * - Card title at top: garment name (+ Additional badge when applicable)
 * - Mobile (<640px): 3 rows separated by thin dividers, each with a 56px thumbnail
 *   on the left and its label + value on the right (Garment, Assigned Fabric, Design).
 * - Desktop (>=640px): the 3 pairs side-by-side in one row, each with an 80px photo
 *   above its label and value.
 */
export const OrderSummaryGarmentCard = ({
  garmentKey,
  baseGarmentLabel,
  garmentLabel,
  plainDescription,
  sourceRole,
  referenceImage,
  assignedFabric,
  design,
  step4Marker,
  step5Marker,
}: OrderSummaryGarmentCardProps) => {
  const fabricDisplayName =
    assignedFabric?.fabric?.name || assignedFabric?.fabricCode || "Not assigned";
  const designDisplayName = design?.name || "Not assigned";

  return (
    <article
      data-step4-garment-context={step4Marker}
      data-step5-garment-context={step5Marker}
      className="flex min-w-0 flex-col rounded-xl border border-heritage-gold/20 bg-heritage-cream/25 p-3 sm:p-3.5"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-heritage-gold/20 pb-2">
        <h4 className="min-w-0 break-words font-serif text-sm font-bold text-heritage-green">
          {garmentLabel}
        </h4>
        {sourceRole === "additional" ? (
          <span className="shrink-0 rounded-full border border-heritage-gold/35 bg-heritage-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-heritage-gold">
            Additional
          </span>
        ) : null}
      </div>

      <div className="divide-y divide-heritage-gold/20 sm:mt-3 sm:grid sm:grid-cols-3 sm:divide-y-0 sm:gap-3">
        {/* Pair 1: Garment photo + Garment name/description */}
        <div className="flex min-w-0 items-center gap-3 py-2.5 first:pt-2.5 last:pb-0 sm:flex-col sm:items-start sm:gap-2 sm:py-0">
          {referenceImage ? (
            <img
              src={referenceImage.src}
              alt={getStep1GarmentReferenceAlt(garmentLabel)}
              data-step4-garment-reference={garmentKey}
              className="size-14 sm:size-20 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div
              role="img"
              aria-label={`Garment preview unavailable for ${baseGarmentLabel}`}
              data-step4-garment-reference={garmentKey}
              className="flex size-14 sm:size-20 shrink-0 items-center justify-center rounded-lg bg-heritage-gold/10 px-1 text-center text-[9px] font-semibold leading-tight text-heritage-ink/55"
            >
              Garment preview unavailable
            </div>
          )}
          <div className="min-w-0 flex-1 text-xs leading-snug">
            <p className="text-[11px] font-medium text-heritage-ink/60">Garment</p>
            <p className="mt-0.5 break-words font-bold text-heritage-green">
              {garmentLabel}
            </p>
            {plainDescription ? (
              <p
                data-testid={`garment-context-plain-description-${garmentKey}`}
                className="mt-0.5 break-words text-[11px] leading-snug text-heritage-ink/70"
              >
                {plainDescription}
              </p>
            ) : null}
          </div>
        </div>

        {/* Pair 2: Fabric swatch + Assigned Fabric */}
        <div className="flex min-w-0 items-center gap-3 py-2.5 sm:flex-col sm:items-start sm:gap-2 sm:py-0">
          {assignedFabric ? (
            <AssignedFabricPreview
              fabric={assignedFabric.fabric}
              garmentKey={garmentKey}
              garmentLabel={baseGarmentLabel}
              fabricCode={assignedFabric.fabricCode}
              className="size-14 sm:size-20 shrink-0 overflow-hidden rounded-lg border border-heritage-gold/25 bg-heritage-cream/40"
              size="thumb"
            />
          ) : (
            <div
              role="img"
              aria-label={`No Fabric assigned to ${baseGarmentLabel}`}
              data-step4-assigned-fabric={garmentKey}
              className="flex size-14 sm:size-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-heritage-gold/35 px-1 text-center text-[9px] font-semibold leading-tight text-heritage-ink/55"
            >
              No Fabric
            </div>
          )}
          <div className="min-w-0 flex-1 text-xs leading-snug">
            <p className="text-[11px] font-medium text-heritage-ink/60">
              Assigned Fabric
            </p>
            <p className="mt-0.5 break-words font-semibold text-heritage-ink">
              {fabricDisplayName}
            </p>
          </div>
        </div>

        {/* Pair 3: Design photo + Design name */}
        <div className="flex min-w-0 items-center gap-3 pt-2.5 sm:flex-col sm:items-start sm:gap-2 sm:pt-0">
          <GarmentContextDesignThumb
            garmentKey={garmentKey}
            garmentLabel={baseGarmentLabel}
            imageUrl={design?.imageUrl ?? null}
          />
          <div className="min-w-0 flex-1 text-xs leading-snug">
            <p className="text-[11px] font-medium text-heritage-ink/60">Design</p>
            <p
              data-garment-context-design-name={garmentKey}
              className="mt-0.5 break-words font-semibold text-heritage-ink"
            >
              {designDisplayName}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
};
