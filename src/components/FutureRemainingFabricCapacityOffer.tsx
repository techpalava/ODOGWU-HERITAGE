import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type { CanonicalPhysicalGarmentType, DesignStudioStageId, Fabric } from "../types";
import { getRemainingFabricCapacityOfferSignature, type FutureRemainingFabricCapacityOffer } from "../utils/designStudioFutureFabricStage";

export const REMAINING_FABRIC_CAPACITY_OFFER_TITLE =
  "UNUSED FABRIC CAPACITY AVAILABLE";
export const REMAINING_FABRIC_CAPACITY_OFFER_BODY =
  "You still have unused Fabric capacity if you would like to add another standard garment.";
export const REMAINING_FABRIC_CAPACITY_OFFER_ADD_GARMENT = "Add Garment";

export const isRemainingFabricCapacityOfferAutoOpenStage = (
  stageId: DesignStudioStageId | string,
): boolean => stageId === "fabric";

export const isRemainingFabricCapacityOfferPromptStage = (
  stageId: DesignStudioStageId | string,
): boolean =>
  stageId === "design_style" ||
  stageId === "custom_details" ||
  stageId === "personalized_additions" ||
  stageId === "measurement" ||
  stageId === "summary";

export const resolveRemainingFabricCapacityReturnStage = (
  stageId: DesignStudioStageId | string,
):
  | "fabric"
  | "design_style"
  | "custom_details"
  | "personalized_additions"
  | "measurement"
  | "summary" =>
  isRemainingFabricCapacityOfferPromptStage(stageId)
    ? (stageId as
        | "design_style"
        | "custom_details"
        | "personalized_additions"
        | "measurement"
        | "summary")
    : "fabric";

/** Presentation lifecycle only. Does not decide whether leftover capacity exists. */
export const resolveRemainingFabricCapacityOfferPresentation = ({
  stageId,
  offerExists,
  offerDismissed,
  requested,
}: {
  stageId: DesignStudioStageId | string;
  offerExists: boolean;
  offerDismissed: boolean;
  requested: boolean;
}): {
  showPrompt: boolean;
  showModal: boolean;
} => {
  if (!offerExists) {
    return { showPrompt: false, showModal: false };
  }
  if (isRemainingFabricCapacityOfferAutoOpenStage(stageId)) {
    return {
      showPrompt: false,
      showModal: !offerDismissed,
    };
  }
  if (isRemainingFabricCapacityOfferPromptStage(stageId)) {
    return {
      showPrompt: true,
      showModal: requested,
    };
  }
  return { showPrompt: false, showModal: false };
};

const remainingCapacityOfferFabricName = (
  offer: FutureRemainingFabricCapacityOffer,
  fabrics: readonly Fabric[],
): string =>
  fabrics.find((fabric) => fabric.code === offer.fabricCode)?.name ||
  offer.fabricCode;

const RemainingFabricCapacityGrid = ({
  offers,
  fabrics,
  onAddGarment,
}: {
  offers: readonly FutureRemainingFabricCapacityOffer[];
  fabrics: readonly Fabric[];
  onAddGarment: (allocationId: string) => void;
}) => (
  <div className="@container">
  <ul className="mt-3 grid grid-cols-1 gap-2 @[740px]:grid-cols-2">
    {offers.map((offer) => {
      const fabricName = remainingCapacityOfferFabricName(offer, fabrics);
      return (
        <li
          key={offer.allocationId}
          className="flex min-w-0 items-center gap-2 rounded-xl border border-heritage-gold/20 bg-white/70 px-2.5 py-2"
          data-fabric-capacity-offer-allocation-id={offer.allocationId}
          data-testid={`remaining-fabric-capacity-offer-allocation-${offer.allocationId}`}
        >
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-bold text-heritage-green">
              <span className="break-words">{fabricName}</span>
              <span className="shrink-0 font-normal text-heritage-ink/65">
                {offer.remainingUnits}/2 left
              </span>
            </p>
            <p className="sr-only">Fabric Selection {offer.selectionOrdinal}</p>
          </div>
          <button
            type="button"
            onClick={() => onAddGarment(offer.allocationId)}
            data-testid={`remaining-fabric-capacity-offer-add-${offer.allocationId}`}
            aria-label={`${REMAINING_FABRIC_CAPACITY_OFFER_ADD_GARMENT} using ${fabricName}`}
            className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-heritage-green px-2.5 text-[11px] font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            {REMAINING_FABRIC_CAPACITY_OFFER_ADD_GARMENT}
          </button>
        </li>
      );
    })}
  </ul>
  </div>
);

export const FutureRemainingFabricCapacityOfferPrompt = ({
  offers,
  fabrics,
  onAddGarment,
}: {
  offers: readonly FutureRemainingFabricCapacityOffer[];
  fabrics: readonly Fabric[];
  onAddGarment: (allocationId: string) => void;
}) => (
  <aside
    data-testid="remaining-fabric-capacity-offer-prompt"
    className="rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-3"
  >
    <h2 className="font-serif text-base font-bold text-heritage-green">
      {REMAINING_FABRIC_CAPACITY_OFFER_TITLE}
    </h2>
    <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">
      {REMAINING_FABRIC_CAPACITY_OFFER_BODY}
    </p>
    <RemainingFabricCapacityGrid
      offers={offers}
      fabrics={fabrics}
      onAddGarment={onAddGarment}
    />
  </aside>
);

const remainingCapacityOfferByAllocationId = (
  offers: readonly FutureRemainingFabricCapacityOffer[],
  allocationId: string | null,
): FutureRemainingFabricCapacityOffer | null =>
  allocationId
    ? offers.find((offer) => offer.allocationId === allocationId) ?? null
    : null;

export const FutureRemainingFabricCapacityOfferCard = ({
  offers,
  fabrics,
  eligibleGarmentTypes,
  lockedAllocationId = null,
  showContinueToDesignStyle = true,
  onAddAdditionalGarment,
  onContinue,
  onDismiss,
}: {
  offers: readonly FutureRemainingFabricCapacityOffer[];
  fabrics: readonly Fabric[];
  eligibleGarmentTypes: readonly CanonicalPhysicalGarmentType[];
  lockedAllocationId?: string | null;
  showContinueToDesignStyle?: boolean;
  onAddAdditionalGarment: (
    garmentType: CanonicalPhysicalGarmentType,
    allocationId: string,
  ) => void;
  onContinue: () => void;
  onDismiss: () => void;
}) => {
  const [chooserAllocationId, setChooserAllocationId] = useState<string | null>(
    lockedAllocationId,
  );
  const offerIdentity = getRemainingFabricCapacityOfferSignature(offers);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    setChooserAllocationId(lockedAllocationId);
  }, [offerIdentity, lockedAllocationId]);

  const chooserOffer = remainingCapacityOfferByAllocationId(
    offers,
    chooserAllocationId,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof document === "undefined") return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); dismissRef.current(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    dialog.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-heritage-ink/40 p-3 sm:p-6">
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="remaining-fabric-capacity-offer"
      className="max-h-[90vh] w-full min-w-0 max-w-lg overflow-y-auto rounded-2xl border border-heritage-gold/40 bg-white p-4 shadow-xl"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-serif text-base font-bold text-heritage-green">
            {REMAINING_FABRIC_CAPACITY_OFFER_TITLE}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">
            {REMAINING_FABRIC_CAPACITY_OFFER_BODY}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss fabric capacity suggestion"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      {chooserOffer ? (
        <div
          data-testid="remaining-fabric-capacity-offer-selector"
          data-fabric-capacity-offer-allocation-id={chooserOffer.allocationId}
          className="mt-3 border-t border-heritage-gold/20 pt-3"
        >
          <p
            className="text-xs font-bold uppercase tracking-wider text-heritage-green"
            data-testid="remaining-fabric-capacity-offer-chooser-heading"
          >
            Adding garment to {remainingCapacityOfferFabricName(chooserOffer, fabrics)}
          </p>
          <p
            className="mt-2 break-words font-bold text-heritage-green"
            data-testid="remaining-fabric-capacity-offer-chooser-fabric"
          >
            {remainingCapacityOfferFabricName(chooserOffer, fabrics)}
          </p>
          <p className="mt-1 text-xs text-heritage-ink/65">
            Fabric Selection {chooserOffer.selectionOrdinal}
          </p>
          <p className="mt-1 text-xs text-heritage-ink/65">
            {chooserOffer.remainingUnits}/2 capacity available
          </p>
          <p
            className="mt-3 text-xs font-bold text-heritage-green"
            data-testid="remaining-fabric-capacity-offer-chooser-instruction"
          >
            Choose a garment to use with {remainingCapacityOfferFabricName(chooserOffer, fabrics)}.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {eligibleGarmentTypes.map((garmentType) => (
              <button
                key={garmentType}
                type="button"
                onClick={() =>
                  onAddAdditionalGarment(garmentType, chooserOffer.allocationId)
                }
                aria-label={`Add ${getFabricGarmentLabel(garmentType)}`}
                data-testid={`remaining-fabric-capacity-offer-select-${garmentType}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-green px-3 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                <Plus aria-hidden="true" size={15} />
                Add {getFabricGarmentLabel(garmentType)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setChooserAllocationId(null)}
            data-testid="remaining-fabric-capacity-offer-back"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Back
          </button>
        </div>
      ) : (
        <>
          <RemainingFabricCapacityGrid
            offers={offers}
            fabrics={fabrics}
            onAddGarment={setChooserAllocationId}
          />
          {showContinueToDesignStyle ? (
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={onContinue}
                data-testid="remaining-fabric-capacity-offer-decline"
                className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Continue to Design Style
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
    </div>
  );
};
