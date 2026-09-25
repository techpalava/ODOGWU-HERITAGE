import { useEffect, useRef, useState } from "react";
import { resolveActiveWearerCap } from "../config/WearerPolicy";
import { getStep1GarmentDisplayLabel } from "../utils/garmentConstructionPricing";
import type { MeasurementPhysicalGarment } from "../utils/measurementBlueprint";
import type { WearerOrderStateV2 } from "../types";
import {
  hasUnassignedPhysicalGarments,
  wearerPublicLabel,
  type WearerMutationResult,
} from "../utils/wearerOrder";

const blockedWearerRemovalMessage = (displayName: string): string => {
  const name = displayName.trim() || "this person";
  return `Cannot remove ${name} yet. Reassign their garments to another person first.`;
};

type AssignmentRejection = {
  code: string;
  wearerId: string;
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
  presentation = "people",
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
  presentation?: "people" | "solo" | "fit";
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
    useState<Readonly<Record<string, AssignmentRejection>>>({});
  const nameInputByWearerId = useRef(new Map<string, HTMLInputElement>());
  const knownWearerIds = useRef<string[] | null>(null);
  const wearers = [...order.wearers].sort(
    (left, right) => left.presentationOrder - right.presentationOrder,
  );
  const labelForWearer = (wearer: (typeof wearers)[number]) =>
    wearerPublicLabel(wearer.displayName, wearer.presentationOrder);
  const cap = resolveActiveWearerCap(garments.length);
  const labelFor = (garment: MeasurementPhysicalGarment) =>
    garmentLabels[garment.garmentKey] ||
    getStep1GarmentDisplayLabel(garment.garmentType);
  const garmentsRemainUnassigned = hasUnassignedPhysicalGarments({
    order,
    physicalGarmentKeys: garments.map((garment) => garment.garmentKey),
  });

  useEffect(() => {
    const liveKeys = new Set(garments.map((garment) => garment.garmentKey));
    setAssignmentRejectionByGarmentKey((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([garmentKey]) => liveKeys.has(garmentKey)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [garments]);

  useEffect(() => {
    const ids = wearers.map((wearer) => wearer.wearerId);
    const previous = knownWearerIds.current;
    knownWearerIds.current = ids;
    if (!previous) return;
    const added = ids.find((wearerId) => !previous.includes(wearerId));
    if (!added) return;
    nameInputByWearerId.current.get(added)?.focus?.();
  }, [wearers]);

  const addAnotherPerson = (
    <button
      type="button"
      className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-heritage-green bg-heritage-green px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
      disabled={wearers.length >= cap}
      onClick={() => onAddWearer("", null)}
    >
      + Add another person
    </button>
  );
  const soleWearer = wearers.length === 1 ? wearers[0] : null;
  if (presentation === "solo") {
    return (
      <section className="mb-6 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm">
        <p className="text-sm text-heritage-ink/70">These clothes are for you.</p>
        {addAnotherPerson}
      </section>
    );
  }
  if (presentation === "fit" && soleWearer) {
    return (
      <section className="mb-6 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm">
        <fieldset>
          <legend className="text-sm font-semibold text-heritage-ink">
            Fit for measurements
          </legend>
          <p className="mt-1 text-xs text-heritage-ink/60">
            Used to determine the correct measurement requirements.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {(["male", "female"] as const).map((fitContext) => (
              <label
                key={fitContext}
                className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-heritage-gold/30 bg-white px-3 font-semibold text-heritage-green"
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={`wearer-fit-${soleWearer.wearerId}`}
                  checked={soleWearer.fitContext === fitContext}
                  onChange={() => onSetFitContext(soleWearer.wearerId, fitContext)}
                />
                {fitContext === "male" ? "Male fit" : "Female fit"}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-heritage-ink/70">
            Select a fit for {labelForWearer(soleWearer)} before assigning garments.
          </p>
        </fieldset>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-serif text-lg font-bold text-heritage-green">
          People in this order
        </h3>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/30 px-3 text-xs font-bold text-heritage-green"
          onClick={() => {
            for (let index = wearers.length - 1; index >= 1; index -= 1) {
              const wearer = wearers[index];
              const result = onDeleteWearer(wearer.wearerId);
              if (
                result.status === "blocked" &&
                result.code === "WEARER_OWNS_GARMENTS"
              ) {
                setDeleteRejection(blockedWearerRemovalMessage(labelForWearer(wearer)));
                return;
              }
              if (result.status === "updated") setDeleteRejection(null);
            }
          }}
        >
          Only for me
        </button>
      </div>
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
            onClick={() => onSelectWearer(wearer.wearerId)}
            className={`rounded-2xl border p-4 ${
              wearer.wearerId === activeWearerId
                ? "border-heritage-gold bg-heritage-cream/40"
                : "border-heritage-gold/20 bg-white"
            }`}
          >
            <label className="block text-sm font-semibold text-heritage-ink/70">
              Name or nickname
              <input
                ref={(node) => {
                  if (node) nameInputByWearerId.current.set(wearer.wearerId, node);
                  else nameInputByWearerId.current.delete(wearer.wearerId);
                }}
                aria-label={`Name or nickname for ${labelForWearer(wearer)}`}
                className="mt-1 min-h-11 w-full rounded-xl border border-heritage-gold/30 bg-white px-3 py-2 text-sm text-heritage-ink placeholder:text-heritage-ink/40"
                placeholder="Add person"
                value={wearer.displayName}
                onFocus={() => onSelectWearer(wearer.wearerId)}
                onChange={(event) =>
                  onRenameWearer(wearer.wearerId, event.currentTarget.value)
                }
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/30 px-3 text-xs font-bold text-heritage-green disabled:cursor-not-allowed disabled:opacity-40"
                disabled={index === 0}
                onClick={(event) => {
                  event?.stopPropagation();
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
                className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-bold text-heritage-ink/60"
                onClick={(event) => {
                  event?.stopPropagation();
                  const result = onDeleteWearer(wearer.wearerId);
                  if (
                    result.status === "blocked" &&
                    result.code === "WEARER_OWNS_GARMENTS"
                  ) {
                    setDeleteRejection(
                      blockedWearerRemovalMessage(labelForWearer(wearer)),
                    );
                    return;
                  }
                  if (result.status === "updated") setDeleteRejection(null);
                }}
              >
                Remove person
              </button>
            </div>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-heritage-ink">
                Fit for measurements
              </legend>
              <p className="mt-1 text-xs text-heritage-ink/60">
                Used to determine the correct measurement requirements.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                {(["male", "female"] as const).map((fitContext) => (
                  <label
                    key={fitContext}
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 font-semibold ${
                      wearer.fitContext === fitContext
                        ? "border-heritage-green bg-heritage-green text-white"
                        : "border-heritage-gold/30 bg-white text-heritage-green"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
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
                  Select a fit for {labelForWearer(wearer)} before assigning garments.
                </p>
              ) : null}
            </fieldset>
          </article>
        ))}
      </div>
      {addAnotherPerson}
      <h4 className="mt-8 text-sm font-bold text-heritage-green">
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
          const rejectedWearer = rejection
            ? wearers.find((candidate) => candidate.wearerId === rejection.wearerId)
            : undefined;
          return (
            <li key={garment.garmentKey} className="grid items-center gap-2 rounded-2xl border border-heritage-gold/20 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] sm:gap-4">
              <div className="font-semibold text-heritage-green">{label}</div>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-heritage-ink/55">
                For:
                <select
                  aria-label={`Wearer for ${label}`}
                  className="min-h-11 w-full rounded-xl border border-heritage-gold/30 bg-white px-3 text-sm font-normal normal-case tracking-normal text-heritage-ink"
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
                    if (
                      result.code !== "WEARER_FIT_REQUIRED" &&
                      result.code !== "GARMENT_INELIGIBLE_FOR_WEARER"
                    ) {
                      return;
                    }
                    setAssignmentRejectionByGarmentKey((current) => ({
                      ...current,
                      [garment.garmentKey]: {
                        code: result.code,
                        wearerId,
                      },
                    }));
                  }}
                >
                  <option value="" disabled>Choose a person</option>
                  {wearers.map((wearer) => (
                    <option key={wearer.wearerId} value={wearer.wearerId}>
                      {labelForWearer(wearer)}
                    </option>
                  ))}
                </select>
              </label>
              {rejection ? (
                <p role="alert" className="mt-1 text-sm font-semibold text-red-700">
                  {assignmentRejectionMessage(
                    rejection.code,
                    rejectedWearer ? labelForWearer(rejectedWearer) : "",
                  )}
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
