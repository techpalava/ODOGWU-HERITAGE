import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Fabric } from "../types";
import {
  getFabricAvailabilityMessage,
  hasUsableFabricImage,
} from "../utils/fabricCatalogueAvailability";
import { getFabricStockPresentation } from "../utils/fabricStockPresentation";
import type { FutureFabricCatalogueCardPresentation } from "../utils/designStudioFutureFabricStage";
import { isUsableFabricColorHex } from "./AssignedFabricPreview";

export const FutureFabricCatalogueCard = ({
  fabric,
  presentation,
  targetGarmentLabel,
  stockBadgeIdPrefix = "future-fabric-stock",
  describedBy,
  statusLabel,
  actionLabel,
  actionDisabled,
  actionPressed,
  onAction,
  dataAttributes,
}: {
  fabric: Fabric;
  presentation: FutureFabricCatalogueCardPresentation;
  targetGarmentLabel?: string;
  stockBadgeIdPrefix?: string;
  describedBy?: string;
  statusLabel?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  actionPressed?: boolean;
  onAction: (
    event?: { currentTarget: HTMLElement },
  ) => void;
  dataAttributes?: Record<string, string | undefined>;
}) => {
  const availabilityMessage = getFabricAvailabilityMessage(fabric);
  const isCancelAction =
    !availabilityMessage && presentation.action === "cancel";
  const isIdleDisabledAction =
    !availabilityMessage &&
    presentation.action === "none" &&
    (presentation.status === "IN USE" ||
      presentation.status === "NO GARMENTS TO ASSIGN");
  const stockPresentation = getFabricStockPresentation(fabric);
  const stockBadgeId = `${stockBadgeIdPrefix}-${fabric.code}`;
  const stockBadgeClassName =
    stockPresentation.visible && stockPresentation.tone === "low_stock"
      ? "border-amber-200 bg-amber-700 text-white"
      : stockPresentation.visible && stockPresentation.tone === "out_of_stock"
        ? "border-red-200 bg-red-700 text-white"
        : "border-heritage-gold/30 bg-heritage-green text-white";
  const disabled =
    Boolean(availabilityMessage) ||
    Boolean(actionDisabled) ||
    presentation.action === "none";
  const resolvedStatusLabel = statusLabel || presentation.status;
  const resolvedActionLabel =
    actionLabel ||
    (availabilityMessage
      ? "Unavailable"
      : isCancelAction
        ? undefined
        : resolvedStatusLabel);
  const cancelAccessibleName = presentation.cancelGarmentKey
    ? `Cancel ${fabric.name} fabric assignment for ${
        targetGarmentLabel || "the selected garment"
      }`
    : `Cancel ${fabric.name} fabric assignment`;
  const imageUrl = hasUsableFabricImage(fabric) ? fabric.image!.trim() : null;
  const colorHex = isUsableFabricColorHex(fabric.colorHex)
    ? fabric.colorHex.trim()
    : null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [fabric.code, imageUrl]);

  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <article
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm"
      data-fabric-catalogue-card="true"
      {...Object.fromEntries(
        Object.entries(dataAttributes || {}).filter(
          ([, value]) => value !== undefined,
        ),
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-heritage-cream/40">
        {showImage ? (
          <img
            src={imageUrl!}
            alt={`${fabric.name} fabric swatch`}
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
            data-fabric-card-image="true"
          />
        ) : colorHex ? (
          <div
            className="h-full w-full"
            style={{ backgroundColor: colorHex }}
            aria-label={`${fabric.color} fabric color`}
            data-fabric-card-swatch="true"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-heritage-cream/70 text-[10px] font-bold uppercase tracking-wider text-heritage-ink/45"
            aria-label={`${fabric.name} fabric preview unavailable`}
            data-fabric-card-fallback="true"
          >
            No preview
          </div>
        )}
        {stockPresentation.visible && (
          <span
            id={stockBadgeId}
            data-fabric-stock-badge="true"
            data-fabric-stock-code={fabric.code}
            data-fabric-stock-status={stockPresentation.status}
            data-fabric-stock-label={stockPresentation.label}
            className={`pointer-events-none absolute top-2 right-2 z-10 max-w-[calc(100%-1rem)] rounded-full border px-2 py-1 text-[10px] font-bold leading-tight shadow-sm ${stockBadgeClassName}`}
          >
            {stockPresentation.label}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h3 className="break-words font-serif text-base font-bold text-heritage-green">
          {fabric.name}
        </h3>
        <p className="mt-1 break-words font-mono text-[10px] text-heritage-ink/55">
          {fabric.code}
        </p>
        {availabilityMessage && (
          <p className="mt-2 text-xs font-semibold text-red-700">
            {availabilityMessage}
          </p>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={actionPressed}
          onClick={onAction}
          data-fabric-card="true"
          data-fabric-code={fabric.code}
          data-fabric-status={resolvedStatusLabel}
          data-fabric-action={
            isCancelAction ? "cancel" : presentation.action
          }
          data-fabric-idle-label={isCancelAction ? "IN USE" : undefined}
          data-fabric-active-label={isCancelAction ? "CANCEL" : undefined}
          data-fabric-cancel-garment-key={
            isCancelAction
              ? presentation.cancelGarmentKey ?? undefined
              : undefined
          }
          aria-label={
            isCancelAction
              ? cancelAccessibleName
              : `${resolvedStatusLabel} ${fabric.name}${
                  targetGarmentLabel ? ` for ${targetGarmentLabel}` : ""
                }`
          }
          aria-describedby={
            [describedBy, stockBadgeId].filter(Boolean).join(" ") || undefined
          }
          className={`group mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-center text-xs font-bold uppercase leading-snug tracking-wider whitespace-normal break-words transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
            isCancelAction
              ? "bg-heritage-green text-white hover:bg-red-700 hover:text-white focus-visible:bg-red-700"
              : "bg-heritage-green text-white hover:bg-heritage-forest"
          }`}
        >
          {availabilityMessage || resolvedActionLabel === "Unavailable" ? (
            "Unavailable"
          ) : isIdleDisabledAction ? (
            resolvedStatusLabel
          ) : isCancelAction ? (
            <span className="grid w-full place-items-center">
              <span className="col-start-1 row-start-1 group-hover:invisible group-focus-visible:invisible">
                IN USE
              </span>
              <span className="col-start-1 row-start-1 invisible text-white group-hover:visible group-focus-visible:visible">
                CANCEL
              </span>
            </span>
          ) : (
            <>
              {resolvedStatusLabel === "SELECT" && (
                <Check aria-hidden="true" size={14} />
              )}
              {resolvedActionLabel || resolvedStatusLabel}
            </>
          )}
        </button>
      </div>
    </article>
  );
};
