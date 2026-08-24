import { useRef, type ChangeEvent } from "react";
import { Check, ImagePlus, LockKeyhole, Trash2, Upload } from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type {
  CustomDetailDemographic,
  CustomerDesignUploadReference,
  FabricCapacityGarmentSpec,
  FabricGarmentType,
  GarmentTypeStepSelection,
  StyleCategory,
  UploadedDesignSource,
} from "../types";
import {
  getFutureDesignStyleCompositionLabel,
  reconcileFutureDesignStyleSelection,
  resolveFutureDesignStyleCompatibility,
} from "../utils/designStudioFutureDesignStyle";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import {
  getUploadedDesignCapacitySummary,
  getUploadedDesignStep1Readiness,
  UPLOADED_DESIGN_GARMENT_OPTIONS,
} from "../utils/uploadedDesignStep1";
import { CUSTOMER_DESIGN_IMAGE_MIME_TYPES } from "../services/customerDesignUploadReference";

interface UploadedDesignPanelState {
  source: UploadedDesignSource | null;
  reference: CustomerDesignUploadReference | null;
  composition: FabricCapacityGarmentSpec[];
  demographic: CustomDetailDemographic | null;
  previewUrl: string | null;
  error: string;
  isUploading: boolean;
  isReplacing: boolean;
  isDeleting: boolean;
  isLoadingPreview: boolean;
  isConfirmed: boolean;
  isPricingActive: boolean;
}

interface DormantFutureDesignStyleStepProps {
  styles: StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
  selectedStyleId: string | null;
  stagePrice: number | null;
  uploadedDesign: UploadedDesignPanelState;
  pendingCatalogStyleName: string | null;
  isCatalogueLoading?: boolean;
  stylesLoadState?: "loading" | "ready" | "error";
  onSelectStyle: (styleId: string) => void;
  onUploadDesignFile: (file: File, isReplacement: boolean) => void;
  onToggleUploadedGarment: (garmentType: FabricGarmentType) => void;
  onUploadedDemographicChange: (
    demographic: CustomDetailDemographic,
  ) => void;
  onRemoveUploadedDesign: () => void;
  onRetryUploadedDesignDeletion: () => void;
  onContinueUploadedDesign: () => void;
  onBack: () => void;
  onReturnToGarmentType: () => void;
  onContinue: () => void;
}

export const DormantFutureDesignStyleStep = ({
  styles,
  garmentTypeSelection,
  selectedStyleId,
  stagePrice,
  uploadedDesign,
  pendingCatalogStyleName,
  isCatalogueLoading = false,
  stylesLoadState = "ready",
  onSelectStyle,
  onUploadDesignFile,
  onToggleUploadedGarment,
  onUploadedDemographicChange,
  onRemoveUploadedDesign,
  onRetryUploadedDesignDeletion,
  onContinueUploadedDesign,
  onBack,
  onReturnToGarmentType,
  onContinue,
}: DormantFutureDesignStyleStepProps) => {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const replacementInputRef = useRef<HTMLInputElement | null>(null);
  const catalogueReady = stylesLoadState === "ready";
  const catalogueSelection = catalogueReady
    ? reconcileFutureDesignStyleSelection({
        selectedStyleId,
        styles,
        garmentTypeSelection,
      })
    : null;
  const compatibilityByStyle = catalogueReady
    ? styles.map((style) => ({
        style,
        compatibility: resolveFutureDesignStyleCompatibility({
          garmentTypeSelection,
          style,
        }),
      }))
    : [];
  const compatibleStyleCount = compatibilityByStyle.filter(
    ({ compatibility }) => compatibility.status === "compatible",
  ).length;
  const uploadReadiness = getUploadedDesignStep1Readiness({
    uploadReference:
      uploadedDesign.source?.uploadReference || uploadedDesign.reference,
    fabricCapacityComposition: uploadedDesign.composition,
    demographic: uploadedDesign.demographic,
  });
  const uploadCapacity = getUploadedDesignCapacitySummary(
    uploadedDesign.composition,
  );
  const uploadedSourceSelected = uploadedDesign.source !== null;
  const uploadBusy =
    uploadedDesign.isUploading ||
    uploadedDesign.isReplacing ||
    uploadedDesign.isDeleting;
  const canContinueToCustomDetails =
    !uploadBusy &&
    !uploadedDesign.error &&
    (uploadedSourceSelected
      ? uploadReadiness.isReady &&
        uploadedDesign.isConfirmed &&
        uploadedDesign.isPricingActive
      : catalogueReady && catalogueSelection?.status === "selected");
  const stageCompleteForAttribute = uploadedSourceSelected
    ? canContinueToCustomDetails
    : catalogueReady && catalogueSelection?.status === "selected";
  const uploadStatus = uploadedDesign.isUploading
    ? "Uploading"
    : uploadedDesign.isReplacing
      ? "Replacing"
      : uploadedDesign.isDeleting
        ? "Deleting"
        : uploadedDesign.error
          ? "Needs attention"
          : uploadedSourceSelected && uploadedDesign.isPricingActive
            ? "Ready for Custom Details"
            : uploadedSourceSelected && uploadedDesign.isConfirmed
              ? "Fabric confirmation required"
              : uploadReadiness.isReady
                ? "Uploaded and ready"
                : uploadedDesign.reference
                  ? "Complete required details"
                  : "No uploaded design";
  const handleFileInput = (
    event: ChangeEvent<HTMLInputElement>,
    isReplacement: boolean,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUploadDesignFile(file, isReplacement);
  };

  return (
    <section
      aria-labelledby="future-design-style-title"
      data-stage-id="design_style"
      data-stage-complete={stageCompleteForAttribute}
      className={`space-y-6 font-sans ${
        canContinueToCustomDetails ? "pb-28 sm:pb-32" : ""
      }`}
    >
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioBackButton
          destination="Fabric"
          onClick={onBack}
          className="mb-5"
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 3 of 9
        </p>
        <h2
          id="future-design-style-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Design Style
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Choose a visual design that matches the garments selected in Step 1.
          Your garment and fabric assignments will not change.
        </p>

        {catalogueReady && catalogueSelection?.status === "reselection_required" && (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p className="font-bold">Select another design</p>
            <p className="mt-1 text-xs leading-relaxed">
              {catalogueSelection.compatibility?.customerReason}
            </p>
          </div>
        )}

        {stylesLoadState === "ready" &&
          styles.length > 0 &&
          compatibleStyleCount === 0 && (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4"
          >
            <p className="font-bold text-heritage-green">
              No matching design styles are available yet
            </p>
            <p className="mt-1 text-xs leading-relaxed text-heritage-ink/70">
              None of the current catalogue designs support your Step 1 garment
              and audience selection. Return to Garment Type to adjust, or use
              Upload Your Own Design below.
            </p>
            <button
              type="button"
              onClick={onReturnToGarmentType}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Return to Garment Type
            </button>
          </div>
        )}

        <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(isCatalogueLoading || stylesLoadState === "loading") && (
            <div
              role="status"
              className="rounded-2xl border border-dashed border-heritage-gold/30 bg-heritage-cream/25 p-6 text-center sm:col-span-2 xl:col-span-3"
            >
              <p className="font-serif text-base font-bold text-heritage-green">
                Loading catalogue designs
              </p>
              <p className="mt-2 text-xs leading-relaxed text-heritage-ink/65">
                Design styles are still loading. Your garment selection is
                preserved.
              </p>
            </div>
          )}
          {stylesLoadState === "error" && (
            <div
              role="status"
              className="rounded-2xl border border-dashed border-heritage-gold/30 bg-heritage-cream/25 p-6 text-center sm:col-span-2 xl:col-span-3"
            >
              <p className="font-serif text-base font-bold text-heritage-green">
                Design Style catalogue temporarily unavailable
              </p>
              <p className="mt-2 text-xs leading-relaxed text-heritage-ink/65">
                Catalogue designs could not be loaded right now. You can upload
                your own design below, or return to Garment Type and try again
                shortly.
              </p>
              <button
                type="button"
                onClick={onReturnToGarmentType}
                className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Return to Garment Type
              </button>
            </div>
          )}
          {stylesLoadState === "ready" && styles.length === 0 && (
            <div className="rounded-2xl border border-dashed border-heritage-gold/30 bg-heritage-cream/25 p-6 text-center sm:col-span-2 xl:col-span-3">
              <p className="font-serif text-base font-bold text-heritage-green">
                No catalogue designs are available right now
              </p>
              <p className="mt-2 text-xs leading-relaxed text-heritage-ink/65">
                You can upload your own design below, or return to Garment Type.
              </p>
              <button
                type="button"
                onClick={onReturnToGarmentType}
                className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Return to Garment Type
              </button>
            </div>
          )}
          {stylesLoadState === "ready" &&
            compatibilityByStyle.map(({ style, compatibility }) => {
            const isCompatible = compatibility.status === "compatible";
            const isSelected =
              isCompatible && catalogueSelection?.selectedStyleId === style.id;
            const isUnavailable = compatibility.code === "STYLE_DISABLED";
            const statusLabel = isSelected
              ? "Selected"
              : isCompatible
                ? "Compatible"
                : isUnavailable
                  ? "Unavailable"
                  : "Not compatible";
            const reasonId = `future-style-reason-${style.id}`;
            return (
              <article
                key={style.id}
                data-compatibility-status={compatibility.status}
                className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm ${
                  isSelected
                    ? "border-heritage-gold"
                    : isCompatible
                      ? "border-gray-200"
                      : "border-gray-200 opacity-70"
                }`}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-heritage-cream/35">
                  {style.image ? (
                    <>
                      <img
                        src={style.image}
                        alt={`${style.name} design`}
                        loading="lazy"
                        className="h-full w-full object-contain"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.classList.add("hidden");
                          event.currentTarget.nextElementSibling?.classList.remove(
                            "hidden",
                          );
                        }}
                      />
                      <div className="hidden h-full items-center justify-center px-4 text-center text-xs text-heritage-ink/45">
                        Image unavailable
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-heritage-ink/45">
                      Image unavailable
                    </div>
                  )}
                  {isSelected && (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-heritage-gold px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                      <Check aria-hidden="true" size={15} strokeWidth={3} />
                      <span>Selected</span>
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words font-serif text-base font-bold text-heritage-green">
                    {style.name}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                        isCompatible
                          ? "border-heritage-green/20 bg-heritage-green/5 text-heritage-green"
                          : "border-heritage-gold/25 bg-heritage-cream/55 text-heritage-ink/65"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded border border-heritage-green/15 bg-heritage-green/5 px-2 py-1 text-[9px] font-bold uppercase text-heritage-green">
                      {style.gender}
                    </span>
                    <span className="rounded border border-heritage-gold/20 bg-heritage-gold/5 px-2 py-1 text-[9px] font-bold uppercase text-heritage-gold">
                      Supports: {getFutureDesignStyleCompositionLabel(style)}
                    </span>
                  </div>
                  <p className="mt-3 break-words text-xs leading-relaxed text-heritage-ink/65">
                    {style.description}
                  </p>
                  {!isCompatible && (
                    <p
                      id={reasonId}
                      className="mt-3 rounded-lg bg-heritage-cream/50 p-2 text-[11px] leading-relaxed text-heritage-ink/70"
                    >
                      {compatibility.customerReason}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={!isCompatible || uploadBusy}
                    onClick={() => onSelectStyle(style.id)}
                    aria-label={`${isSelected ? "Selected" : "Select"} ${style.name} design style`}
                    aria-pressed={isSelected}
                    aria-disabled={!isCompatible || uploadBusy}
                    aria-describedby={!isCompatible ? reasonId : undefined}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-heritage-ink/45"
                  >
                    {isSelected ? "Selected" : "Select Design"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="my-8 flex items-center gap-4" aria-hidden="true">
          <span className="h-px flex-1 bg-heritage-gold/30" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-heritage-gold">
            Or
          </span>
          <span className="h-px flex-1 bg-heritage-gold/30" />
        </div>

        <section
          data-testid="upload-your-design-panel"
          aria-labelledby="upload-your-design-title"
          aria-busy={uploadBusy}
          className={`min-w-0 rounded-2xl border-2 p-4 sm:p-5 ${
            uploadedSourceSelected
              ? "border-heritage-gold bg-heritage-gold/5"
              : "border-heritage-green/20 bg-heritage-cream/20"
          }`}
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
                Private design reference
              </p>
              <h3
                id="upload-your-design-title"
                className="mt-1 break-words font-serif text-xl font-bold text-heritage-green"
              >
                Upload Your Own Design
              </h3>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-heritage-ink/65">
                Add a private reference image, then identify every physical
                garment shown and who the design is for.
              </p>
            </div>
            <span
              role="status"
              className="shrink-0 rounded-full border border-heritage-gold/30 bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-heritage-green"
            >
              {uploadStatus}
            </span>
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            disabled={uploadBusy}
            accept={CUSTOMER_DESIGN_IMAGE_MIME_TYPES.join(",")}
            aria-label="Upload your private design reference"
            className="sr-only"
            onChange={(event) => handleFileInput(event, false)}
          />
          <input
            ref={replacementInputRef}
            type="file"
            disabled={uploadBusy}
            accept={CUSTOMER_DESIGN_IMAGE_MIME_TYPES.join(",")}
            aria-label="Replace your private design reference"
            className="sr-only"
            onChange={(event) => handleFileInput(event, true)}
          />

          {!uploadedDesign.reference ? (
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => uploadInputRef.current?.click()}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              <Upload aria-hidden="true" size={16} />
              {uploadedDesign.isUploading ? "Uploading..." : "Upload Your Design"}
            </button>
          ) : (
            <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="min-w-0 rounded-xl border border-heritage-gold/20 bg-white p-3">
                <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-heritage-cream/50">
                  {uploadedDesign.isLoadingPreview ? (
                    <span className="px-4 text-center text-xs font-semibold text-heritage-ink/60">
                      Loading preview...
                    </span>
                  ) : uploadedDesign.previewUrl ? (
                    <img
                      src={uploadedDesign.previewUrl}
                      alt="Your uploaded design reference"
                      className="max-h-72 w-full object-contain"
                    />
                  ) : (
                    <span className="px-4 text-center text-xs leading-relaxed text-heritage-ink/60">
                      Preview unavailable. Your private design reference is
                      still protected.
                    </span>
                  )}
                </div>
                <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={() => replacementInputRef.current?.click()}
                    className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-heritage-gold/35 bg-white px-3 text-xs font-bold text-heritage-green transition hover:bg-heritage-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ImagePlus aria-hidden="true" size={15} />
                    {uploadedDesign.isReplacing ? "Replacing..." : "Replace Image"}
                  </button>
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={onRemoveUploadedDesign}
                    className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                    {uploadedDesign.isDeleting ? "Deleting..." : "Delete Image"}
                  </button>
                </div>
              </div>

              <div className="min-w-0 space-y-5 rounded-xl border border-heritage-gold/20 bg-white p-4">
                <fieldset className="min-w-0">
                  <legend className="text-xs font-bold text-heritage-green">
                    What garments are included in your design?
                  </legend>
                  <p className="mt-1 text-[11px] leading-relaxed text-heritage-ink/65">
                    Select every physical garment shown in your reference.
                  </p>
                  <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                    {UPLOADED_DESIGN_GARMENT_OPTIONS.map((option) => {
                      const checked = uploadedDesign.composition.some(
                        (spec) => spec.garmentType === option.garmentType,
                      );
                      return (
                        <label
                          key={option.garmentType}
                          className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                            uploadBusy
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer"
                          } ${
                            checked
                              ? "border-heritage-gold bg-heritage-gold/10 text-heritage-green"
                              : "border-gray-200 text-heritage-ink hover:border-heritage-gold/45"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={uploadBusy}
                            checked={checked}
                            onChange={() =>
                              onToggleUploadedGarment(option.garmentType)
                            }
                            className="size-5 shrink-0 accent-heritage-green"
                          />
                          <span className="min-w-0 flex-1 break-words font-semibold">
                            {option.label}
                          </span>
                          {option.fabricUnits === 2 && (
                            <span className="shrink-0 text-[9px] text-heritage-gold">
                              Full fabric quantity
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="rounded-lg bg-heritage-cream/45 px-3 py-2 text-[11px] leading-relaxed text-heritage-ink/75">
                  {uploadCapacity.garmentCount > 0 ? (
                    <>
                      <strong className="text-heritage-green">
                        {uploadCapacity.garmentCount} garment
                        {uploadCapacity.garmentCount === 1 ? "" : "s"} ·{" "}
                        {uploadCapacity.fabricQuantity} fabric quantit
                        {uploadCapacity.fabricQuantity === 1 ? "y" : "ies"}
                      </strong>
                      {uploadCapacity.requiresAdditionalAllocation && (
                        <p className="mt-1">
                          This composition needs more than one fabric allocation.
                          The existing Fabric step will guide each assignment.
                        </p>
                      )}
                    </>
                  ) : (
                    "Select the garments in your reference to continue."
                  )}
                </div>

                <fieldset>
                  <legend className="text-xs font-bold text-heritage-green">
                    Who is this design for?
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      ["male", "Male"],
                      ["female", "Female"],
                      ["unisex", "Unisex / Family"],
                    ] as const).map(([value, label]) => (
                      <label
                        key={value}
                        className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                          uploadBusy
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer"
                        } ${
                          uploadedDesign.demographic === value
                            ? "border-heritage-gold bg-heritage-gold/10 text-heritage-green"
                            : "border-gray-200 text-heritage-ink hover:border-heritage-gold/45"
                        }`}
                      >
                        <input
                          type="radio"
                          disabled={uploadBusy}
                          name="uploaded-design-demographic"
                          checked={uploadedDesign.demographic === value}
                          onChange={() => onUploadedDemographicChange(value)}
                          className="size-5 shrink-0 accent-heritage-green"
                        />
                        <span className="min-w-0 break-words">{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <p className="text-[11px] leading-relaxed text-heritage-ink/65">
                  {uploadReadiness.isReady
                    ? uploadedDesign.isConfirmed && uploadedDesign.isPricingActive
                      ? "Your uploaded design and Fabric assignments are confirmed."
                      : "Uploaded design complete. Continue to Fabric to confirm its assignments."
                    : "Image, garment composition, and recipient context are required."}
                </p>
                <p className="rounded-lg border border-heritage-gold/20 bg-heritage-cream/35 px-3 py-2 text-[11px] leading-relaxed text-heritage-ink/70">
                  Final review and payment for uploaded designs remain unavailable
                  until the secure uploaded-order contract supports this journey.
                </p>
              </div>
            </div>
          )}

          {uploadedDesign.error && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs font-medium leading-relaxed text-red-700"
            >
              <p>{uploadedDesign.error}</p>
              {pendingCatalogStyleName && (
                <button
                  type="button"
                  disabled={uploadBusy}
                  onClick={onRetryUploadedDesignDeletion}
                  aria-label={`Retry deleting uploaded design and switch to ${pendingCatalogStyleName}`}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-xs font-bold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                >
                  Retry and switch to {pendingCatalogStyleName}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm">
        <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
          <span className="min-w-0 text-heritage-ink/70">
            Garment Construction Subtotal
          </span>
          <span className="shrink-0 font-mono font-bold text-heritage-green">
            {stagePrice === null
              ? "Pending"
              : `${PRICING_CURRENCY_SYMBOL}${stagePrice.toFixed(2)}`}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-heritage-ink/55">
          Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing. Design
          Style does not add another charge.
        </p>
      </aside>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DesignStudioBackButton destination="Fabric" onClick={onBack} />
        <div
          data-testid="future-design-style-continue-action"
          data-docked={canContinueToCustomDetails}
          className={
            canContinueToCustomDetails
              ? "fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3"
              : ""
          }
        >
          <div
            className={
              canContinueToCustomDetails
                ? "mx-auto flex w-full max-w-4xl justify-end rounded-2xl border border-heritage-gold/30 bg-white/95 p-3 shadow-[0_14px_30px_rgba(19,33,29,0.18)] backdrop-blur-sm sm:px-4 sm:py-3.5"
                : ""
            }
          >
            <button
              type="button"
              onClick={
                uploadedSourceSelected &&
                (!uploadedDesign.isConfirmed || !uploadedDesign.isPricingActive)
                  ? onContinueUploadedDesign
                  : onContinue
              }
              disabled={
                uploadBusy ||
                (uploadedSourceSelected
                  ? !uploadReadiness.isReady
                  : !catalogueReady ||
                    catalogueSelection?.status !== "selected")
              }
              aria-label={
                uploadedSourceSelected &&
                (!uploadedDesign.isConfirmed || !uploadedDesign.isPricingActive)
                  ? "Continue with Uploaded Design to Fabric"
                  : "Continue to Custom Details"
              }
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-heritage-green/35 ${
                canContinueToCustomDetails ? "w-full sm:w-auto" : ""
              }`}
            >
              <LockKeyhole aria-hidden="true" size={14} />
              {uploadedSourceSelected &&
              (!uploadedDesign.isConfirmed || !uploadedDesign.isPricingActive)
                ? "Continue with Uploaded Design"
                : "Continue to Custom Details"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
