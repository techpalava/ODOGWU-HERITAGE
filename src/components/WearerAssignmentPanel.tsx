import { useEffect, useId, useRef, useState } from "react";
import { MAX_CONFIGURED_ACTIVE_WEARERS, resolveActiveWearerCap } from "../config/WearerPolicy";
import { getStep1GarmentDisplayLabel } from "../utils/garmentConstructionPricing";
import type { MeasurementPhysicalGarment } from "../utils/measurementBlueprint";
import type { WearerOrderStateV2 } from "../types";
import {
  hasUnassignedPhysicalGarments,
  wearerAssignmentLabel,
  type WearerMutationResult,
} from "../utils/wearerOrder";

const SOLO_FIRST_COPY =
  "These clothes are for you. Add another person if you are ordering for someone else.";

const SAVE_NAMES_BEFORE_ADDING_COPY = "Save each person’s name before adding another";
/** People are capped by garment count (each person needs a garment), up to the hard ceiling. */
const NEED_GARMENT_FOR_PERSON_COPY =
  "Each person needs a garment. Add another garment to add another person.";
const MAXIMUM_PEOPLE_COPY = `Maximum of ${MAX_CONFIGURED_ACTIVE_WEARERS} people per order.`;
const NAME_REQUIRED_HINT = "Enter a name or nickname";

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
  presentation = "solo",
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
  onUnassignGarment,
  onCollapseToSolo,
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
  /** Clears a garment's owner (in-card checkbox unchecked). Leaves it unassigned. */
  onUnassignGarment?: (garmentKey: string) => void;
  /** Fired after Only for me successfully returns to the solo first-screen. */
  onCollapseToSolo?: () => void;
}) => {
  const [deleteRejection, setDeleteRejection] = useState<string | null>(null);
  const [assignmentRejectionByGarmentKey, setAssignmentRejectionByGarmentKey] =
    useState<Readonly<Record<string, AssignmentRejection>>>({});
  const [peopleExpanded, setPeopleExpanded] = useState(
    () => order.wearers.length > 1 || presentation === "people",
  );
  /**
   * Name confirmation is panel UI state, not persisted. A person whose name was
   * edited here stays unconfirmed until Save or blur with a non-empty name. A
   * non-empty name that arrives from the order (e.g. a reloaded draft) counts
   * as confirmed, so returning customers are not stuck.
   */
  const [unsavedNameWearerIds, setUnsavedNameWearerIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [nameHintWearerIds, setNameHintWearerIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const addAnotherReasonId = useId();
  const nameInputByWearerId = useRef(new Map<string, HTMLInputElement>());
  const knownWearerIds = useRef<string[] | null>(null);
  const wearers = [...order.wearers].sort(
    (left, right) => left.presentationOrder - right.presentationOrder,
  );
  const labelForWearer = (wearer: (typeof wearers)[number]) =>
    wearerAssignmentLabel(wearer.displayName, wearer.presentationOrder);
  const cap = resolveActiveWearerCap(garments.length);
  const labelFor = (garment: MeasurementPhysicalGarment) =>
    garmentLabels[garment.garmentKey] ||
    getStep1GarmentDisplayLabel(garment.garmentType);
  const garmentsRemainUnassigned = hasUnassignedPhysicalGarments({
    order,
    physicalGarmentKeys: garments.map((garment) => garment.garmentKey),
  });

  useEffect(() => {
    if (wearers.length > 1) setPeopleExpanded(true);
  }, [wearers.length]);

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

  const withoutId = (current: ReadonlySet<string>, wearerId: string) => {
    if (!current.has(wearerId)) return current;
    const next = new Set(current);
    next.delete(wearerId);
    return next;
  };
  const withId = (current: ReadonlySet<string>, wearerId: string) => {
    if (current.has(wearerId)) return current;
    const next = new Set(current);
    next.add(wearerId);
    return next;
  };
  /** Confirmed = a real non-empty name (not the "You" placeholder) that was saved or blurred. */
  const isNameConfirmed = (wearer: (typeof wearers)[number]) =>
    wearer.displayName.trim().length > 0 && !unsavedNameWearerIds.has(wearer.wearerId);
  const confirmName = (wearer: (typeof wearers)[number], source: "save" | "blur") => {
    if (wearer.displayName.trim().length === 0) {
      if (source === "save") {
        setNameHintWearerIds((current) => withId(current, wearer.wearerId));
      }
      return;
    }
    setUnsavedNameWearerIds((current) => withoutId(current, wearer.wearerId));
    setNameHintWearerIds((current) => withoutId(current, wearer.wearerId));
  };
  const atWearerCap = wearers.length >= cap;
  const namesPending = wearers.some((wearer) => !isNameConfirmed(wearer));
  // The cap reason always wins over the save-name reason.
  const addAnotherDisabledReason = atWearerCap
    ? wearers.length >= MAX_CONFIGURED_ACTIVE_WEARERS
      ? MAXIMUM_PEOPLE_COPY
      : NEED_GARMENT_FOR_PERSON_COPY
    : namesPending
      ? SAVE_NAMES_BEFORE_ADDING_COPY
      : null;
  const addAnotherPerson = (
    <div className="mt-4">
      <button
        type="button"
        data-wearer-add-another="true"
        className="inline-flex min-h-11 items-center rounded-xl border border-heritage-green bg-heritage-green px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        disabled={addAnotherDisabledReason !== null}
        title={addAnotherDisabledReason ?? undefined}
        aria-describedby={addAnotherDisabledReason ? addAnotherReasonId : undefined}
        onClick={() => {
          if (addAnotherDisabledReason !== null) return;
          onAddWearer("", null);
        }}
      >
        + Add another person
      </button>
      {addAnotherDisabledReason ? (
        <p
          id={addAnotherReasonId}
          data-wearer-add-another-reason="true"
          className="mt-2 text-xs text-heritage-ink/65"
        >
          {addAnotherDisabledReason}
        </p>
      ) : null}
    </div>
  );
  const showPeopleUi =
    wearers.length > 1 || peopleExpanded || presentation === "people";
  // For me is the solo first-screen choice; Add a person / people UI deselects it.
  const forMeSelected = !showPeopleUi;

  const clearAssignmentRejection = (garmentKey: string) => {
    setAssignmentRejectionByGarmentKey((current) => {
      if (!(garmentKey in current)) return current;
      const next = { ...current };
      delete next[garmentKey];
      return next;
    });
  };

  /** In-card checkbox: assign to this person (moves it off anyone else). */
  const assignGarmentToCardWearer = (garmentKey: string, wearerId: string) => {
    const result = onAssignGarment(garmentKey, wearerId);
    if (result.status === "updated") {
      clearAssignmentRejection(garmentKey);
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
      [garmentKey]: { code: result.code, wearerId },
    }));
  };

  /** Only for me / For me: remove extra people, then return to the solo first-screen. */
  const collapseToSolo = () => {
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
    setPeopleExpanded(false);
    onCollapseToSolo?.();
  };

  if (!showPeopleUi) {
    return (
      <section
        className="mb-6 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm"
        data-wearer-solo-first="true"
      >
        <p className="text-sm text-heritage-ink/70">{SOLO_FIRST_COPY}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-wearer-for-me="true"
            data-wearer-for-me-selected={forMeSelected ? "true" : "false"}
            aria-pressed={forMeSelected}
            className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-bold ${
              forMeSelected
                ? "border-heritage-green bg-heritage-green text-white"
                : "border-heritage-gold/30 bg-white text-heritage-green"
            }`}
            onClick={collapseToSolo}
          >
            For me
          </button>
          <button
            type="button"
            data-wearer-add-people="true"
            className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-bold ${
              forMeSelected
                ? "border-heritage-gold/30 bg-white text-heritage-green"
                : "border-heritage-green bg-heritage-green text-white"
            }`}
            onClick={() => setPeopleExpanded(true)}
          >
            Add a person
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="mb-6 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm"
      data-wearer-people="true"
    >
      <p className="text-sm text-heritage-ink/70">{SOLO_FIRST_COPY}</p>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-serif text-lg font-bold text-heritage-green">
          People in this order
        </h3>
        <button
          type="button"
          data-wearer-only-for-me="true"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/30 px-3 text-xs font-bold text-heritage-green"
          onClick={collapseToSolo}
        >
          Only for me
        </button>
      </div>
      <p className="mt-1 text-sm text-heritage-ink/65">
        Add everyone these clothes are for, choose their fit, then tick the
        garments each person will wear on their card.
      </p>
      {deleteRejection ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {deleteRejection}
        </p>
      ) : null}
      <h4 className="mt-5 text-sm font-bold text-heritage-green">Add people</h4>
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
            <div className="flex items-end gap-2">
              <label className="block min-w-0 flex-1 text-sm font-semibold text-heritage-ink/70">
                Name or nickname
                <input
                  ref={(node) => {
                    if (node) nameInputByWearerId.current.set(wearer.wearerId, node);
                    else nameInputByWearerId.current.delete(wearer.wearerId);
                  }}
                  aria-label={`Name or nickname for ${labelForWearer(wearer)}`}
                  className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-heritage-gold/30 bg-white px-3 py-2 text-sm text-heritage-ink placeholder:text-heritage-ink/40"
                  placeholder={index === 0 ? "You" : "Add person"}
                  value={wearer.displayName}
                  onFocus={() => onSelectWearer(wearer.wearerId)}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    // Any edit clears confirmation until Save or blur again.
                    setUnsavedNameWearerIds((current) => withId(current, wearer.wearerId));
                    if (value.trim().length > 0) {
                      setNameHintWearerIds((current) => withoutId(current, wearer.wearerId));
                    }
                    onRenameWearer(wearer.wearerId, value);
                  }}
                  onBlur={() => confirmName(wearer, "blur")}
                />
              </label>
              <button
                type="button"
                data-wearer-name-save="true"
                data-wearer-name-confirmed={isNameConfirmed(wearer) ? "true" : "false"}
                aria-label={
                  isNameConfirmed(wearer)
                    ? `Name saved for ${labelForWearer(wearer)}`
                    : `Save name for ${labelForWearer(wearer)}`
                }
                className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border px-3 text-xs font-bold ${
                  isNameConfirmed(wearer)
                    ? "border-heritage-gold/30 bg-white text-heritage-ink/55"
                    : "border-heritage-green bg-heritage-green text-white"
                }`}
                onClick={(event) => {
                  event?.stopPropagation?.();
                  confirmName(wearer, "save");
                }}
              >
                {isNameConfirmed(wearer) ? "Saved" : "Save"}
              </button>
            </div>
            {nameHintWearerIds.has(wearer.wearerId) && wearer.displayName.trim().length === 0 ? (
              <p data-wearer-name-hint="true" className="mt-1 text-xs font-semibold text-red-700">
                {NAME_REQUIRED_HINT}
              </p>
            ) : null}
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
                  // Sole expanded card: same path as Only for me (back to For me).
                  if (wearers.length === 1) {
                    collapseToSolo();
                    return;
                  }
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
            {wearers.length > 1 ? (
              <fieldset
                className="mt-4"
                data-wearer-garment-assign="true"
                disabled={wearer.fitContext === null}
              >
                <legend className="text-sm font-semibold text-heritage-ink">
                  Garments for this person
                </legend>
                <ul className="mt-2 grid gap-2">
                  {garments.map((garment) => {
                    const label = labelFor(garment);
                    const checked =
                      order.assignmentByGarmentKey[garment.garmentKey] === wearer.wearerId;
                    const fitMissing = wearer.fitContext === null;
                    const rejection = assignmentRejectionByGarmentKey[garment.garmentKey];
                    return (
                      <li key={garment.garmentKey}>
                        <label
                          className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm ${
                            checked
                              ? "border-heritage-green bg-heritage-green/5 font-semibold text-heritage-green"
                              : "border-heritage-gold/30 bg-white text-heritage-ink"
                          } ${fitMissing ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                        >
                          <input
                            type="checkbox"
                            data-wearer-garment-key={garment.garmentKey}
                            aria-label={`${label} for ${labelForWearer(wearer)}`}
                            className="size-4 shrink-0 accent-heritage-green disabled:cursor-not-allowed"
                            checked={checked}
                            disabled={fitMissing}
                            onChange={() => {
                              if (fitMissing) return;
                              if (checked) {
                                clearAssignmentRejection(garment.garmentKey);
                                onUnassignGarment?.(garment.garmentKey);
                                return;
                              }
                              assignGarmentToCardWearer(garment.garmentKey, wearer.wearerId);
                            }}
                          />
                          <span className="min-w-0 break-words">{label}</span>
                        </label>
                        {rejection && rejection.wearerId === wearer.wearerId ? (
                          <p role="alert" className="mt-1 text-sm font-semibold text-red-700">
                            {assignmentRejectionMessage(rejection.code, labelForWearer(wearer))}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ) : null}
          </article>
        ))}
      </div>
      {wearers.length > 1 && garmentsRemainUnassigned ? (
        <p
          data-wearer-unassigned-note="true"
          className="mt-4 text-sm font-semibold text-heritage-ink"
        >
          Assign all garments to continue.
        </p>
      ) : null}
      {addAnotherPerson}
    </section>
  );
};
