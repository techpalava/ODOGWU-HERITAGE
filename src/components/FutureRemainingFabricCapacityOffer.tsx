import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type { CanonicalPhysicalGarmentType, Fabric } from "../types";
import type { FutureRemainingFabricCapacityOffer } from "../utils/designStudioFutureFabricStage";

export const FutureRemainingFabricCapacityOfferCard = ({
  offer,
  fabric,
  eligibleGarmentTypes,
  onAddAdditionalGarment,
  onDismiss,
}: {
  offer: FutureRemainingFabricCapacityOffer;
  fabric: Fabric;
  eligibleGarmentTypes: readonly CanonicalPhysicalGarmentType[];
  onAddAdditionalGarment: (garmentType: CanonicalPhysicalGarmentType) => void;
  onDismiss: () => void;
}) => {
  const [selectingGarment, setSelectingGarment] = useState(false);
  const offerIdentity = `${offer.allocationId}:${offer.fabricCode}:${offer.assignedGarmentKeys.join("|")}`;

  useEffect(() => {
    setSelectingGarment(false);
  }, [offerIdentity]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="remaining-fabric-capacity-offer"
      data-fabric-capacity-offer-allocation-id={offer.allocationId}
      data-fabric-capacity-offer-fabric-code={offer.fabricCode}
      className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl border border-heritage-gold/40 bg-white p-4 shadow-xl sm:left-auto sm:max-w-md"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-base font-bold text-heritage-green">
            Your fabric can carry one more garment. (Optional)
          </p>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">
            {fabric.name} still has {offer.remainingUnits}/2 fabric capacity remaining.
            Would you like to add another garment using this fabric?
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

      {selectingGarment ? (
        <div
          data-testid="remaining-fabric-capacity-offer-selector"
          className="mt-3 border-t border-heritage-gold/20 pt-3"
        >
          <p className="text-xs font-bold text-heritage-green">
            Choose another garment to use {fabric.name}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {eligibleGarmentTypes.map((garmentType) => (
              <button
                key={garmentType}
                type="button"
                onClick={() => onAddAdditionalGarment(garmentType)}
                aria-label={`Add ${getFabricGarmentLabel(garmentType)} using ${fabric.name}`}
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
            No, Continue
          </button>
        </div>
      )}
    </div>
  );
};
