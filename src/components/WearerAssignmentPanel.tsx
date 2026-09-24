import { useEffect, useRef, useState } from "react";
import { resolveActiveWearerCap } from "../config/WearerPolicy";
import { getStep1GarmentDisplayLabel } from "../utils/garmentConstructionPricing";
import type { MeasurementPhysicalGarment } from "../utils/measurementBlueprint";
import type { WearerOrderStateV2 } from "../types";
import {
  hasUnassignedPhysicalGarments,
  type WearerMutationResult,
} from "../utils/wearerOrder";

const blockedWearerRemovalMessage = (displayName: string): string => {
  const name = displayName.trim() || "this person";
  return `Cannot remove ${name} yet. Reassign their garments to another person first.`;
};

const assignmentRejectionMessage = (
  code: string,
  displayName: string,
): string | null => {
  const name = displayName.trim() || "this person";
  if (code === "WEARER_FIT_REQUIRED") {
    return `Select a fit for ${name} before assigning this garment.`;
  }
  if (code === "GARMENT_INELIGIBLE_FOR_WEARER") {
    return `This garment is not available for ${name}'s selected fit.`;
  }
  return null;
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
  onAddWearer: (displayName: string, fitContext: "male" | "female" | null) => void;
  onRenameWearer: (wearerId: string, displayName: string) => void;
  onReorderWearers: (wearerIds: string[]) => void;
  onSetFitContext: (wearerId: string, fitContext: "male" | "female") => void;
  onDeleteWearer: (wearerId: string) => WearerMutationResult;
  onAssignGarment: (garmentKey: string, wearerId: string) => WearerMutationResult;
}) => {
  const [deleteRejection, setDeleteRejection] = useState<string | null>(null);
  const [assignmentRejectionByGarmentKey, setAssignmentRejectionByGarmentKey] =
    useState<Readonly<Record<string, string>>>({});
  const nameInputByWearerId = useRef(new Map<string, HTMLInputElement>());
  const knownWearerIds = useRef<string[] | null>(null);
  const wearers = [...order.wearers].sort(
    (left, right) => left.presentationOrder - right.presentationOrder,
  );
  const cap = resolveActiveWearerCap(garments.length);
  const labelFor = (garment: MeasurementPhysicalGarment) =>
    garmentLabels[garment.garmentKey] ||
    getStep1GarmentDisplayLabel(garment.garmentType);
  const garmentsRemainUnassigned = hasUnassignedPhysicalGarments({
    order,
    physicalGarmentKeys: garments.map((garment) => garment.garmentKey),
  });

  useEffect(() => {
    const ids = wearers.map((wearer) => wearer.wearerId);
    const previous = knownWearerIds.current;
    knownWearerIds.current = ids;
    if (!previous) return;
    const added = ids.find((wearerId) => !previous.includes(wearerId));
    if (!added) return;
    nameInputByWearerId.current.get(added)?.focus?.();
  }, [wearers]);

  return (
    <section className="mb-6 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm">
      <h3 className="font-serif text-lg font-bold text-heritage-green">
        People in this order
      </h3>
      <p className="mt-1 text-sm text-heritage-ink/65">
        Add everyone these clothes are for, choose their fit, then assign each
        garment to the right person.
      </p>
      {deleteRejection ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {deleteRejection}
        </p>
      ) : null}
      <h4 className="mt-5 text-sm font-bold text-heritage-green">1. Add people</h4>
      <div className="mt-3 grid gap-3">
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
              <label className="min-w-0 flex-1 text-sm text-heritage-ink/70">
                Name or nickname
                <input
                  ref={(node) => {
                    if (node) nameInputByWearerId.current.set(wearer.wearerId, node);
                    else nameInputByWearerId.current.delete(wearer.wearerId);
                  }}
                  aria-label={`Name or nickname for ${wearer.displayName}`}
                  className="mt-1 w-full rounded-xl border border-heritage-gold/30 px-3 py-2 text-sm text-heritage-ink"
                  value={wearer.displayName}
                  onChange={(event) =>
                    onRenameWearer(wearer.wearerId, event.currentTarget.value)
                  }
                />
              </label>
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
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-heritage-ink">
                Fit for measurements
              </legend>
              <p className="mt-1 text-xs text-heritage-ink/60">
                Used to determine the correct measurement requirements.
              </p>
              <div className="mt-2 flex gap-3 text-sm">
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
              {wearer.fitContext === null ? (
                <p className="mt-2 text-sm text-heritage-ink/70">
                  Select a fit for {wearer.displayName} before assigning garments.
                </p>
              ) : null}
            </fieldset>
          </article>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 inline-flex items-center rounded-xl border border-heritage-green bg-heritage-green px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        disabled={wearers.length >= cap}
        onClick={() => onAddWearer("Friend", null)}
      >
        + Add another person
      </button>
      <h4 className="mt-6 text-sm font-bold text-heritage-green">
        2. Assign garments
      </h4>
      <p className="mt-1 text-sm text-heritage-ink/65">
        Choose who will wear each garment. Every garment must be assigned before
        you continue.
      </p>
      <ul className="mt-4 space-y-3">
        {garments.map((garment) => {
          const label = labelFor(garment);
          const assignedWearerId = order.assignmentByGarmentKey[garment.garmentKey] ?? "";
          const rejection = assignmentRejectionByGarmentKey[garment.garmentKey];
          return (
            <li key={garment.garmentKey} className="text-sm">
              <div className="font-semibold text-heritage-green">{label}</div>
              <label className="mt-1 inline-flex items-center gap-2">
                For:
                <select
                  aria-label={`Wearer for ${label}`}
                  value={assignedWearerId}
                  onChange={(event) => {
                    const wearerId = event.currentTarget.value;
                    if (!wearerId) return;
                    const result = onAssignGarment(garment.garmentKey, wearerId);
                    if (result.status === "updated") {
                      setAssignmentRejectionByGarmentKey((current) => {
                        if (!(garment.garmentKey in current)) return current;
                        const next = { ...current };
                        delete next[garment.garmentKey];
                        return next;
                      });
                      return;
                    }
                    const wearer = order.wearers.find(
                      (candidate) => candidate.wearerId === wearerId,
                    );
                    const message = assignmentRejectionMessage(
                      result.code,
                      wearer?.displayName || "",
                    );
                    if (!message) return;
                    setAssignmentRejectionByGarmentKey((current) => ({
                      ...current,
                      [garment.garmentKey]: message,
                    }));
                  }}
                >
                  <option value="" disabled>Choose a person</option>
                  {wearers.map((wearer) => (
                    <option key={wearer.wearerId} value={wearer.wearerId}>
                      {wearer.displayName}
                    </option>
                  ))}
                </select>
              </label>
              {rejection ? (
                <p role="alert" className="mt-1 text-sm font-semibold text-red-700">
                  {rejection}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {garmentsRemainUnassigned ? (
        <p className="mt-4 text-sm font-semibold text-heritage-ink">
          Assign all garments to continue.
        </p>
      ) : null}
    </section>
  );
};
