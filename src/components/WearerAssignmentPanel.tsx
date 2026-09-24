import { useState } from "react";
import { resolveActiveWearerCap } from "../config/WearerPolicy";
import { getStep1GarmentDisplayLabel } from "../utils/garmentConstructionPricing";
import type { MeasurementPhysicalGarment } from "../utils/measurementBlueprint";
import type { WearerOrderStateV2 } from "../types";
import type { WearerMutationResult } from "../utils/wearerOrder";

const blockedWearerRemovalMessage = (displayName: string): string => {
  const name = displayName.trim() || "this person";
  return `Cannot remove ${name} yet. Reassign their garments to another person first.`;
};

export const WearerAssignmentPanel = ({
  order,
  activeWearerId,
  garments,
  garmentLabels,
  onSelectWearer,
  onAddWearer,
  onRenameWearer,
  onReorderWearers,
  onSetFitContext,
  onDeleteWearer,
  onAssignGarment,
}: {
  order: WearerOrderStateV2;
  activeWearerId: string | null;
  garments: readonly MeasurementPhysicalGarment[];
  garmentLabels: Readonly<Record<string, string>>;
  onSelectWearer: (wearerId: string) => void;
  onAddWearer: (displayName: string, fitContext: "male" | "female") => void;
  onRenameWearer: (wearerId: string, displayName: string) => void;
  onReorderWearers: (wearerIds: string[]) => void;
  onSetFitContext: (wearerId: string, fitContext: "male" | "female") => void;
  onDeleteWearer: (wearerId: string) => WearerMutationResult;
  onAssignGarment: (garmentKey: string, wearerId: string) => void;
}) => {
  const [deleteRejection, setDeleteRejection] = useState<string | null>(null);
  const wearers = [...order.wearers].sort(
    (left, right) => left.presentationOrder - right.presentationOrder,
  );
  const cap = resolveActiveWearerCap(garments.length);
  const labelFor = (garment: MeasurementPhysicalGarment) =>
    garmentLabels[garment.garmentKey] ||
    getStep1GarmentDisplayLabel(garment.garmentType);

  return (
    <section className="mb-6 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm">
      <h3 className="font-serif text-lg font-bold text-heritage-green">
        People in this order
      </h3>
      <p className="mt-1 text-sm text-heritage-ink/65">
        Each person keeps their own measurements. A garment belongs to one person.
      </p>
      {deleteRejection ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {deleteRejection}
        </p>
      ) : null}
      <div className="mt-4 grid gap-3">
        {wearers.map((wearer, index) => (
          <article
            key={wearer.wearerId}
            className={`rounded-2xl border p-4 ${
              wearer.wearerId === activeWearerId
                ? "border-heritage-gold bg-heritage-cream/40"
                : "border-heritage-gold/20"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-sm font-bold text-heritage-green"
                onClick={() => onSelectWearer(wearer.wearerId)}
              >
                {wearer.displayName}
              </button>
              <input
                aria-label={`Name for ${wearer.displayName}`}
                className="min-w-0 flex-1 rounded-xl border border-heritage-gold/30 px-3 py-2 text-sm"
                value={wearer.displayName}
                onChange={(event) =>
                  onRenameWearer(wearer.wearerId, event.currentTarget.value)
                }
              />
              <button
                type="button"
                className="text-xs font-bold text-heritage-ink/60"
                disabled={index === 0}
                onClick={() => {
                  const ids = wearers.map((item) => item.wearerId);
                  const swapped = [...ids];
                  [swapped[index - 1], swapped[index]] = [
                    swapped[index],
                    swapped[index - 1],
                  ];
                  onReorderWearers(swapped);
                }}
              >
                Move up
              </button>
              <button
                type="button"
                className="text-xs font-bold text-red-700"
                onClick={() => {
                  const result = onDeleteWearer(wearer.wearerId);
                  if (
                    result.status === "blocked" &&
                    result.code === "WEARER_OWNS_GARMENTS"
                  ) {
                    setDeleteRejection(
                      blockedWearerRemovalMessage(wearer.displayName),
                    );
                    return;
                  }
                  if (result.status === "updated") setDeleteRejection(null);
                }}
              >
                Remove person
              </button>
            </div>
            <div className="mt-3 flex gap-3 text-sm">
              {(["male", "female"] as const).map((fitContext) => (
                <label key={fitContext} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`wearer-fit-${wearer.wearerId}`}
                    checked={wearer.fitContext === fitContext}
                    onChange={() => onSetFitContext(wearer.wearerId, fitContext)}
                  />
                  {fitContext === "male" ? "Male fit" : "Female fit"}
                </label>
              ))}
            </div>
          </article>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 text-sm font-bold text-heritage-green disabled:opacity-40"
        disabled={wearers.length >= cap}
        onClick={() => onAddWearer("Friend", "female")}
      >
        Add another person
      </button>
      <ul className="mt-5 space-y-2">
        {garments.map((garment) => (
          <li key={garment.garmentKey} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-heritage-green">
              {labelFor(garment)}
            </span>
            <label>
              For:{" "}
              <select
                aria-label={`Wearer for ${labelFor(garment)}`}
                value={order.assignmentByGarmentKey[garment.garmentKey] || ""}
                onChange={(event) =>
                  onAssignGarment(garment.garmentKey, event.currentTarget.value)
                }
              >
                <option value="">Choose a person</option>
                {wearers.map((wearer) => (
                  <option key={wearer.wearerId} value={wearer.wearerId}>
                    {wearer.displayName}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
};
