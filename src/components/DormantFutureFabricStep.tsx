import { ArrowLeft, Check, Layers3 } from "lucide-react";
import type {
  Fabric,
  FabricAllocationState,
  GarmentTypeStepSelection,
} from "../types";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import { resolveFabricAllocationMaterialPricing } from "../utils/fabricAllocationPricing";
import { resolveFabricPrice } from "../utils/fabricPricing";
import type { FutureFabricStageCompletion } from "../utils/designStudioFutureFabricStage";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";

const blockerMessages: Record<
  FutureFabricStageCompletion["blockers"][number]["code"],
  string
> = {
  GARMENT_TYPE_INCOMPLETE: "Complete Garment Type before assigning fabric.",
  GARMENT_ASSIGNMENT_REQUIRED: "Choose a fabric for every selected garment.",
  PENDING_GARMENT_ASSIGNMENT: "Finish the pending fabric assignment before continuing.",
  FABRIC_NOT_FOUND: "A previously selected fabric is no longer in the catalogue. Choose another fabric.",
  FABRIC_UNAVAILABLE: "A selected fabric is currently unavailable. Choose another fabric.",
  FABRIC_PRICE_UNAVAILABLE: "A selected fabric needs a current catalogue price before this step can continue.",
  INVALID_ALLOCATION_CAPACITY: "One fabric assignment exceeds the permitted fabric capacity. Review the allocation.",
  MALFORMED_ASSIGNMENT: "One garment assignment needs review before this step can continue.",
};

interface DormantFutureFabricStepProps {
  fabrics: Fabric[];
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  completion: FutureFabricStageCompletion;
  constructionPrice: number;
  stagePrice: number | null;
  onSelectFabric: (fabric: Fabric) => void;
  onChangeFabricForGarment: (garmentKey: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onUseSameFabric: () => void;
  onChooseAnotherFabric: () => void;
  onCancelPendingFabric: () => void;
}

export const DormantFutureFabricStep = ({
  fabrics,
  garmentTypeSelection,
  fabricAllocationState,
  completion,
  constructionPrice,
  stagePrice,
  onSelectFabric,
  onChangeFabricForGarment,
  onBack,
  onContinue,
  onUseSameFabric,
  onChooseAnotherFabric,
  onCancelPendingFabric,
}: DormantFutureFabricStepProps) => {
  const visibleFabrics = fabrics.filter(
    (fabric) => fabric.stockStatus !== "HIDDEN",
  );
  const pricing = resolveFabricAllocationMaterialPricing(
    fabricAllocationState.fabricAllocations,
    fabrics,
  );
  const primaryFabricCode =
    fabricAllocationState.fabricAllocations[0]?.fabricCode || null;
  const assignmentByGarmentKey = new Map(
    fabricAllocationState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => [
        assignment.garmentKey,
        { assignment, allocation },
      ]),
    ),
  );
  const uniqueBlockers = Array.from(
    new Set(
      completion.blockers.map((blocker) => blockerMessages[blocker.code]),
    ),
  );

  return (
    <section
      aria-labelledby="future-fabric-step-title"
      className="space-y-6 font-sans"
      data-stage-id="fabric"
      data-stage-complete={completion.isComplete}
    >
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-heritage-green/20 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Garment Type
        </button>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 2 of 9
        </p>
        <h2
          id="future-fabric-step-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Fabric
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Assign fabric to every garment selected in Step 1. Garments may share
          a fabric while the existing two-unit capacity rule allows it.
        </p>

        <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {garmentTypeSelection.garmentTypes.map((garmentType) => {
            const garmentKey = `base:${garmentType}`;
            const assigned = assignmentByGarmentKey.get(garmentKey);
            const fabricName = assigned
              ? fabrics.find(
                  (fabric) => fabric.code === assigned.allocation.fabricCode,
                )?.name || "Unavailable fabric"
              : "Fabric not assigned";
            return (
              <div
                key={garmentKey}
                className="min-w-0 rounded-xl border border-heritage-gold/20 bg-heritage-cream/25 p-3"
              >
                <p className="break-words text-xs font-bold text-heritage-green">
                  {getFabricGarmentLabel(garmentType)}
                </p>
                <p className="mt-1 break-words text-[11px] leading-relaxed text-heritage-ink/65">
                  {fabricName}
                  {assigned
                    ? ` · Fabric Selection ${
                        fabricAllocationState.fabricAllocations.findIndex(
                          (allocation) =>
                            allocation.allocationId ===
                            assigned.allocation.allocationId,
                        ) + 1
                      }`
                    : ""}
                </p>
                {assigned && (
                  <button
                    type="button"
                    onClick={() => onChangeFabricForGarment(garmentKey)}
                    disabled={Boolean(fabricAllocationState.pendingFabricGarment)}
                    aria-label={`Change fabric for ${getFabricGarmentLabel(garmentType)}`}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green/25 px-3 text-[10px] font-bold uppercase tracking-wide text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Change Fabric
                  </button>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {uniqueBlockers.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4"
        >
          <p className="text-sm font-bold text-heritage-green">Fabric needs attention</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-heritage-ink/70">
            {uniqueBlockers.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {fabricAllocationState.pendingFabricGarment &&
        !fabricAllocationState.awaitingFabricForPendingGarment && (
          <div
            role="dialog"
            aria-labelledby="future-fabric-limit-title"
            className="rounded-2xl border border-heritage-gold/40 bg-heritage-cream/40 p-5 shadow-sm"
          >
            <h3
              id="future-fabric-limit-title"
              className="font-serif text-lg font-bold text-heritage-green"
            >
              Fabric Selection Limit
            </h3>
            <p className="mt-2 text-sm text-heritage-ink/70">
              {getFabricGarmentLabel(
                fabricAllocationState.pendingFabricGarment.garmentType,
              )}{" "}
              needs another fabric allocation.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={onUseSameFabric}
                className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Use Same Fabric Again
              </button>
              <button
                type="button"
                onClick={onChooseAnotherFabric}
                className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Choose Another Fabric
              </button>
              <button
                type="button"
                onClick={onCancelPendingFabric}
                className="min-h-11 rounded-xl px-4 text-xs font-bold uppercase tracking-wider text-heritage-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {visibleFabrics.map((fabric) => {
          const unavailable =
            fabric.stockStatus === "OUT_OF_STOCK" ||
            resolveFabricPrice(fabric) === null;
          const isPrimary = primaryFabricCode === fabric.code;
          return (
            <article
              key={fabric.code}
              className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm ${
                isPrimary ? "border-heritage-gold" : "border-gray-200"
              }`}
            >
              <div className="aspect-[4/3] overflow-hidden bg-heritage-cream/40">
                {fabric.image ? (
                  <img
                    src={fabric.image}
                    alt={`${fabric.name} fabric swatch`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: fabric.colorHex }}
                    aria-label={`${fabric.color} fabric color`}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-4">
                <h3 className="break-words font-serif text-base font-bold text-heritage-green">
                  {fabric.name}
                </h3>
                <p className="mt-1 break-words font-mono text-[10px] text-heritage-ink/55">
                  {fabric.code}
                </p>
                <button
                  type="button"
                  disabled={unavailable}
                  onClick={() => onSelectFabric(fabric)}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isPrimary && <Check aria-hidden="true" size={14} />}
                  {unavailable
                    ? "Unavailable"
                    : fabricAllocationState.awaitingFabricForPendingGarment
                      ? "Assign Fabric"
                      : isPrimary
                        ? "Selected"
                        : "Select"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <aside className="rounded-2xl border border-heritage-gold/25 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-heritage-green">
          <Layers3 aria-hidden="true" size={18} />
          <h3 className="font-serif text-lg font-bold">Fabric Summary</h3>
        </div>
        <p className="mt-2 text-xs text-heritage-ink/65">
          {completion.assignedGarmentCount} of {completion.requiredGarmentCount}{" "}
          garments assigned across {completion.fabricQuantity} fabric selection
          {completion.fabricQuantity === 1 ? "" : "s"}.
        </p>
        {pricing.status === "resolved" && (
          <div className="mt-4 space-y-2 border-t border-heritage-gold/15 pt-4 text-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 break-words text-heritage-ink/70">
                Garment construction
              </span>
              <span className="shrink-0 font-mono font-bold text-heritage-green">
                {PRICING_CURRENCY_SYMBOL}{constructionPrice.toFixed(2)}
              </span>
            </div>
            {pricing.allocationLines.map((line, index) => (
              <div
                key={line.allocationId}
                className="flex min-w-0 items-start justify-between gap-3"
              >
                <span className="min-w-0 break-words text-heritage-ink/70">
                  Fabric Selection {index + 1}: {line.fabric.name}
                </span>
                <span className="shrink-0 font-mono font-bold text-heritage-green">
                  {PRICING_CURRENCY_SYMBOL}{line.materialPrice.toFixed(2)}
                </span>
              </div>
            ))}
            {stagePrice !== null && (
              <div className="flex items-start justify-between gap-3 border-t border-heritage-gold/15 pt-3 font-bold text-heritage-green">
                <span>Garment and fabric total</span>
                <span className="shrink-0 font-mono">
                  {PRICING_CURRENCY_SYMBOL}{stagePrice.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Garment Type
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!completion.isComplete}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Continue to Design Style
        </button>
      </div>
    </section>
  );
};
