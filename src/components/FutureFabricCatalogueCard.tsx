import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { Fabric } from "../types";
import {
  getFabricAvailabilityMessage,
  hasUsableFabricImage,
} from "../utils/fabricCatalogueAvailability";
import { getFabricStockPresentation } from "../utils/fabricStockPresentation";
import type { FutureFabricCatalogueCardPresentation } from "../utils/designStudioFutureFabricStage";
import type { FabricStockPresentation } from "../utils/fabricStockPresentation";
import { isUsableFabricColorHex } from "./AssignedFabricPreview";

export const FutureFabricCatalogueCard = ({
  fabric,
  presentation,
  targetGarmentLabel,
  stockBadgeIdPrefix = "future-fabric-stock",
  stockPresentation: stockPresentationOverride,
  stockConstraintMessage,
  describedBy,
  statusLabel,
  actionLabel,
  actionDisabled,
  actionPressed,
  onAction,
  onRemove,
  removeTargetGarmentLabel,
  dataAttributes,
}: {
  fabric: Fabric;
  presentation: FutureFabricCatalogueCardPresentation;
  targetGarmentLabel?: string;
  stockBadgeIdPrefix?: string;
  stockPresentation?: FabricStockPresentation;
  stockConstraintMessage?: string | null;
  describedBy?: string;
  statusLabel?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  actionPressed?: boolean;
  onAction: (
    event?: { currentTarget: HTMLElement },
  ) => void;
  onRemove?: (
    event?: { currentTarget: HTMLElement },
  ) => void;
  removeTargetGarmentLabel?: string;
  dataAttributes?: Record<string, string | undefined>;
}) => {
  const availabilityMessage = getFabricAvailabilityMessage(fabric);
  const isCancelAction =
    !availabilityMessage && presentation.action === "cancel";
  const isIdleDisabledAction =
    !availabilityMessage &&
    presentation.action === "none" &&
    (presentation.status === "IN USE" ||
      presentation.status === "ALL GARMENTS HAVE FABRIC" ||
      presentation.status === "SELECT");
  const stockPresentation =
    stockPresentationOverride ?? getFabricStockPresentation(fabric);
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
    Boolean(
      stockConstraintMessage &&
        (presentation.action === "select" || presentation.action === "use_again"),
    ) ||
    presentation.action === "none";
  const resolvedStatusLabel = statusLabel || presentation.status;
  const resolvedActionLabel =
    actionLabel ||
    (availabilityMessage
      ? "Unavailable"
      : isCancelAction
        ? undefined
        : resolvedStatusLabel);
  const cancelGarmentKeys =
    presentation.cancelGarmentKeys ??
    (presentation.cancelGarmentKey ? [presentation.cancelGarmentKey] : []);
  const opensRemovalChooser = cancelGarmentKeys.length > 1;
  const cancelAccessibleName = opensRemovalChooser
    ? `Choose garment to remove ${fabric.name} from`
    : `Remove ${fabric.name} from ${
        removeTargetGarmentLabel ||
        targetGarmentLabel ||
        "the selected garment"
      }`;
  const canShowRemoveControl =
    !availabilityMessage &&
    cancelGarmentKeys.length > 0 &&
    (presentation.action === "cancel" || presentation.action === "use_again");
  const handleRemove = (event?: { currentTarget: HTMLElement }) => {
    (onRemove ?? onAction)(event);
  };
  const describedByValue =
    [describedBy, stockBadgeId].filter(Boolean).join(" ") || undefined;
  const imageUrl = hasUsableFabricImage(fabric) ? fabric.image!.trim() : null;
  const colorHex = isUsableFabricColorHex(fabric.colorHex)
    ? fabric.colorHex.trim()
    : null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [fabric.code, imageUrl]);

  const showImage = Boolean(imageUrl) && !imageFailed;
  const actionClassName =
    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-3 text-center text-xs font-bold uppercase leading-snug tracking-wider whitespace-normal break-words text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45";
  const useAgainSplitClassName =
    "inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-heritage-green px-3 text-center text-xs font-bold uppercase leading-snug tracking-wider whitespace-normal break-words text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";
  const removeButtonClassName =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/30 bg-white text-heritage-green transition hover:border-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";
  const removeButton = canShowRemoveControl ? (
    <button
      type="button"
      onClick={(event) => {
        if (event && typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        handleRemove(event);
      }}
      data-fabric-card="true"
      data-fabric-code={fabric.code}
      data-fabric-status={resolvedStatusLabel}
      data-fabric-action="cancel"
      data-fabric-remove="true"
      data-fabric-cancel-garment-key={
        presentation.cancelGarmentKey ?? undefined
      }
      data-fabric-cancel-count={String(cancelGarmentKeys.length)}
      data-fabric-remove-chooser={
        opensRemovalChooser ? "true" : undefined
      }
      aria-label={cancelAccessibleName}
      aria-describedby={describedByValue}
      className={removeButtonClassName}
    >
      <X aria-hidden="true" size={16} />
    </button>
  ) : null;

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
        {stockConstraintMessage && !availabilityMessage && (
          <p
            className="mt-2 text-xs font-semibold text-red-700"
            data-fabric-stock-constraint="true"
          >
            {stockConstraintMessage}
          </p>
        )}
        {isCancelAction && removeButton ? (
          <div className="mt-auto flex min-w-0 items-stretch gap-2 pt-4">
            <span
              data-fabric-in-use="true"
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl bg-heritage-green px-3 text-center text-xs font-bold uppercase leading-snug tracking-wider text-white"
            >
              IN USE
            </span>
            {removeButton}
          </div>
        ) : presentation.action === "use_again" && removeButton ? (
          <div className="mt-auto flex min-w-0 items-stretch gap-2 pt-4">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={actionPressed}
              onClick={onAction}
              data-fabric-card="true"
              data-fabric-code={fabric.code}
              data-fabric-status={resolvedStatusLabel}
              data-fabric-action="use_again"
              aria-label={`${resolvedStatusLabel} ${fabric.name}${
                targetGarmentLabel ? ` for ${targetGarmentLabel}` : ""
              }`}
              aria-describedby={describedByValue}
              className={useAgainSplitClassName}
            >
              {resolvedActionLabel || resolvedStatusLabel}
            </button>
            {removeButton}
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            aria-pressed={actionPressed}
            onClick={onAction}
            data-fabric-card="true"
            data-fabric-code={fabric.code}
            data-fabric-status={resolvedStatusLabel}
            data-fabric-action={presentation.action}
            aria-label={`${resolvedStatusLabel} ${fabric.name}${
              targetGarmentLabel ? ` for ${targetGarmentLabel}` : ""
            }`}
            aria-describedby={describedByValue}
            className={`mt-auto ${actionClassName}`}
          >
            {availabilityMessage || resolvedActionLabel === "Unavailable" ? (
              "Unavailable"
            ) : isIdleDisabledAction ? (
              resolvedStatusLabel
            ) : (
              <>
                {resolvedStatusLabel === "SELECT" && (
                  <Check aria-hidden="true" size={14} />
                )}
                {resolvedActionLabel || resolvedStatusLabel}
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
};
