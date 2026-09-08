import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type { CanonicalPhysicalGarmentType, Fabric } from "../types";
import { getRemainingFabricCapacityOfferSignature, type FutureRemainingFabricCapacityOffer } from "../utils/designStudioFutureFabricStage";

export const FutureRemainingFabricCapacityOfferCard = ({
  offers,
  fabrics,
  eligibleGarmentTypes,
  onAddAdditionalGarment,
  onDismiss,
}: {
  offers: readonly FutureRemainingFabricCapacityOffer[];
  fabrics: readonly Fabric[];
  eligibleGarmentTypes: readonly CanonicalPhysicalGarmentType[];
  onAddAdditionalGarment: (garmentType: CanonicalPhysicalGarmentType) => void;
  onDismiss: () => void;
}) => {
  const [selectingGarment, setSelectingGarment] = useState(false);
  const offerIdentity = getRemainingFabricCapacityOfferSignature(offers);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    setSelectingGarment(false);
  }, [offerIdentity]);

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
            UNUSED FABRIC CAPACITY AVAILABLE
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">
            You still have unused Fabric capacity if you would like to add another standard garment.
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

      <ul className="mt-3 space-y-2 text-sm text-heritage-green">
        {offers.map((offer) => (
          <li key={offer.allocationId} className="break-words" data-fabric-capacity-offer-allocation-id={offer.allocationId}>
            {fabrics.find((fabric) => fabric.code === offer.fabricCode)?.name || offer.fabricCode}
            {" — "}{offer.remainingUnits}/2 available
          </li>
        ))}
      </ul>

      {selectingGarment ? (
        <div
          data-testid="remaining-fabric-capacity-offer-selector"
          className="mt-3 border-t border-heritage-gold/20 pt-3"
        >
          <p className="text-xs font-bold text-heritage-green">
            Choose another garment, then choose its Fabric.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {eligibleGarmentTypes.map((garmentType) => (
              <button
                key={garmentType}
                type="button"
                onClick={() => onAddAdditionalGarment(garmentType)}
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
            onClick={() => setSelectingGarment(false)}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setSelectingGarment(true)}
            data-testid="remaining-fabric-capacity-offer-accept"
            className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Add Another Garment
          </button>
          <button
            type="button"
            onClick={onDismiss}
            data-testid="remaining-fabric-capacity-offer-decline"
            className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Continue Without Adding
          </button>
        </div>
      )}
    </div>
    </div>
  );
};
