import type { CanonicalPhysicalGarmentType } from "../types.js";
import type { FuturePaymentReviewCandidate } from "./designStudioFuturePaymentReview.js";
import type { FutureDesignStudioSummary } from "./designStudioFutureSummary.js";
import { getSummaryGarmentReferenceImage } from "./summaryGarmentGroups.js";

/**
 * Stage 10 picture data, one entry per physical garment: its Design Style
 * image (or uploaded design preview), each assigned fabric's swatch, and the
 * Step 1 garment-type reference photo. Presentation only. Nothing here changes
 * prices, payment, or the order candidate.
 */
export interface FuturePaymentReviewPictureDesign {
  readonly sourceKind: "catalogue" | "uploaded" | "none";
  readonly name: string | null;
  readonly imageUrl: string | null;
}

export interface FuturePaymentReviewPictureFabric {
  readonly allocationId: string;
  readonly fabricName: string;
  readonly fabricCode: string;
  readonly imageUrl: string | null;
  readonly colorHex: string | null;
}

export interface FuturePaymentReviewGarmentPicture {
  readonly garmentKey: string;
  readonly label: string;
  readonly role: "main" | "additional";
  readonly wearerLabel: string | null;
  readonly constructionTotalCents: number | null;
  readonly design: FuturePaymentReviewPictureDesign;
  readonly fabrics: readonly FuturePaymentReviewPictureFabric[];
  readonly referenceImageUrl: string | null;
}

/**
 * Only image locations are rendered: http(s) and relative paths, plus
 * in-browser previews (blob:, data:image/). Opaque upload references (which
 * never contain "/") and other URL schemes are ignored.
 */
const cleanUrl = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (/^(blob:|data:image\/)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed))
    return null;
  return trimmed.includes("/") ? trimmed : null;
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const cleanHex = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return HEX_COLOR.test(trimmed) ? trimmed : null;
};

const referenceImageFor = (garmentType: string): string | null =>
  getSummaryGarmentReferenceImage(garmentType as CanonicalPhysicalGarmentType)
    ?.src ?? null;

export const getFuturePaymentReviewGarmentPictures = (
  candidate: FuturePaymentReviewCandidate | null,
  summary: FutureDesignStudioSummary | null,
): FuturePaymentReviewGarmentPicture[] => {
  const summaryFabrics = summary?.fabricSummary ?? [];
  const summaryDesigns = summary?.designStyleOccurrences ?? [];
  const summaryGarments = summary?.garmentSummary ?? [];
  const wearerByKey = new Map(
    summaryGarments.map((garment) => [garment.garmentKey, garment.wearerLabel]),
  );

  const summaryDesignFor = (
    garmentKey: string,
  ): FuturePaymentReviewPictureDesign | null => {
    const occurrence = summaryDesigns.find(
      (entry) => entry.garmentKey === garmentKey,
    );
    if (!occurrence || occurrence.sourceKind === "unassigned") return null;
    return {
      sourceKind: occurrence.sourceKind,
      name: occurrence.name || null,
      imageUrl: cleanUrl(occurrence.image),
    };
  };

  const summaryFabricFor = (allocationId: string, fabricCode: string) =>
    summaryFabrics.find((entry) => entry.allocationId === allocationId) ??
    summaryFabrics.find((entry) => entry.fabricCode === fabricCode) ??
    null;

  if (candidate) {
    const snapshots =
      candidate.schemaVersion === 2 ? candidate.occurrenceStyleSnapshots : [];
    return candidate.garments.map((garment) => {
      const snapshot = snapshots.find(
        (entry) => entry.occurrence.garmentKey === garment.garmentKey,
      );
      let design: FuturePaymentReviewPictureDesign | null = null;
      if (snapshot?.sourceKind === "catalogue" && snapshot.catalogue) {
        design = {
          sourceKind: "catalogue",
          name: snapshot.catalogue.name,
          imageUrl: cleanUrl(snapshot.catalogue.image),
        };
      } else if (snapshot?.sourceKind === "uploaded" && snapshot.uploaded) {
        // previewReference is an opaque upload id, not an image URL. The
        // displayable preview comes from the Summary projection below.
        design = {
          sourceKind: "uploaded",
          name: snapshot.uploaded.displayLabel,
          imageUrl: null,
        };
      } else if (candidate.schemaVersion === 1 && candidate.design) {
        design = {
          sourceKind: "catalogue",
          name: candidate.design.name,
          imageUrl: cleanUrl(candidate.design.image),
        };
      }
      const fromSummary = summaryDesignFor(garment.garmentKey);
      if (!design) design = fromSummary;
      else if (!design.imageUrl && fromSummary?.imageUrl) {
        design = { ...design, imageUrl: fromSummary.imageUrl };
      }
      const fabrics = candidate.fabricAllocations
        .filter((allocation) =>
          allocation.garmentAssignments.some(
            (assignment) => assignment.garmentKey === garment.garmentKey,
          ),
        )
        .map((allocation) => {
          const match = summaryFabricFor(
            allocation.allocationId,
            allocation.fabricCode,
          );
          return {
            allocationId: allocation.allocationId,
            fabricName: allocation.fabricName,
            fabricCode: allocation.fabricCode,
            imageUrl: cleanUrl(match?.image),
            colorHex: cleanHex(match?.colorHex),
          };
        });
      return {
        garmentKey: garment.garmentKey,
        label: garment.label,
        role: garment.role,
        wearerLabel: wearerByKey.get(garment.garmentKey) ?? null,
        constructionTotalCents: garment.constructionTotalCents,
        design: design ?? { sourceKind: "none", name: null, imageUrl: null },
        fabrics,
        referenceImageUrl: referenceImageFor(garment.garmentType),
      };
    });
  }

  return summaryGarments.map((garment) => ({
    garmentKey: garment.garmentKey,
    label: garment.label,
    role: garment.role,
    wearerLabel: garment.wearerLabel,
    constructionTotalCents: garment.constructionTotalCents,
    design: summaryDesignFor(garment.garmentKey) ?? {
      sourceKind: "none",
      name: null,
      imageUrl: null,
    },
    fabrics: summaryFabrics
      .filter((allocation) =>
        allocation.garments.some(
          (assigned) => assigned.garmentKey === garment.garmentKey,
        ),
      )
      .map((allocation) => ({
        allocationId: allocation.allocationId,
        fabricName: allocation.fabricName,
        fabricCode: allocation.fabricCode,
        imageUrl: cleanUrl(allocation.image),
        colorHex: cleanHex(allocation.colorHex),
      })),
    referenceImageUrl: referenceImageFor(garment.garmentType),
  }));
};
