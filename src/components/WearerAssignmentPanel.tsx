import { useEffect, useId, useRef, useState } from "react";
import { MAX_CONFIGURED_ACTIVE_WEARERS, resolveActiveWearerCap } from "../config/WearerPolicy";
import { getStep1GarmentDisplayLabel } from "../utils/garmentConstructionPricing";
import { REMAINING_FABRIC_CAPACITY_OFFER_ADD_GARMENT } from "./FutureRemainingFabricCapacityOffer";
import type { MeasurementPhysicalGarment } from "../utils/measurementBlueprint";
import type {
  AdditionalGarmentConstructionStateV1,
  GarmentTypeStepSelection,
  WearerOrderStateV2,
} from "../types";
import {
  canonicalWearerDisplayName,
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
/** Sole mode (people panel open, one person): the system owns the split. */
const SOLE_ALL_ASSIGNED_COPY = "All garments are for this person.";
const SOLE_SPLIT_HINT_COPY = "Add another person to split garments between people.";

const blockedWearerRemovalMessage = (displayName: string): string => {
  const name = displayName.trim() || "this person";
  return `Cannot remove ${name} yet. Reassign their garments to another person first.`;
};

/** Save -> Saved success flash before settling to the green outline. */
export const NAME_SAVED_FLASH_MS = 500;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  onDeleteWearer,
  onAssignGarment,
  onUnassignGarment,
  onCollapseToSolo,
  onPeopleUiChange,
  onUnsavedNameWearerIdsChange,
  onAddGarment,
  spareFabricCapacityAvailable = false,
  initialPeopleExpanded = false,
}: {
  order: WearerOrderStateV2;
  presentation?: "people" | "solo" | "fit";
  activeWearerId: string | null;
  garments: readonly MeasurementPhysicalGarment[];
  garmentLabels: Readonly<Record<string, string>>;
  onSelectWearer: (wearerId: string) => void;
  /** New people start with no stored fit; measurement fields follow the Studio garment demographic. */
  onAddWearer: (displayName: string, fitContext: "male" | "female" | null) => void;
  onRenameWearer: (wearerId: string, displayName: string) => void;
  onReorderWearers: (wearerIds: string[]) => void;
  /** @deprecated Ignored: Step 7 no longer asks for a per-person fit. */
  onSetFitContext?: (wearerId: string, fitContext: "male" | "female") => void;
  onDeleteWearer: (wearerId: string) => WearerMutationResult;
  onAssignGarment: (garmentKey: string, wearerId: string) => WearerMutationResult;
  /** Clears a garment's owner (in-card checkbox unchecked). Leaves it unassigned. */
  onUnassignGarment?: (garmentKey: string) => void;
  /**
   * Only for me / For me / sole Remove: return to the solo strip.
   * `clearSoleIdentity` is set only for Remove on the last card.
   */
  onCollapseToSolo?: (options?: { clearSoleIdentity?: boolean }) => void;
  /**
   * Reports whether the people panel is open (Add a person or 2+ people), so
   * Design Studio knows the people UI is showing. Reports false on unmount.
   */
  onPeopleUiChange?: (open: boolean) => void;
  /**
   * Reports the wearer ids whose name was edited since the last Save / blur
   * (still unconfirmed here). Design Studio uses it to keep summary person
   * labels off until names are saved. Reports [] on unmount.
   */
  onUnsavedNameWearerIdsChange?: (wearerIds: readonly string[]) => void;
  /** @deprecated Ignored: fit no longer gates garments, so rows need no eligibility context. */
  garmentTypeSelection?: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
  /**
   * Starts Design Studio's existing Add Garment path (fabric-capacity offer or
   * the Step 5 Additional Garment chooser). Shown on the people panel when the
   * garment-tied cap blocks another person, or when spare fabric capacity exists.
   */
  onAddGarment?: () => void;
  /** The unused fabric capacity offer exists (same signal as the capacity prompt). */
  spareFabricCapacityAvailable?: boolean;
  /** Mount with the people panel open (returning from the Add Garment trip). */
  initialPeopleExpanded?: boolean;
}) => {
  const [deleteRejection, setDeleteRejection] = useState<string | null>(null);
  const [peopleExpanded, setPeopleExpanded] = useState(
    () => order.wearers.length > 1 || presentation === "people" || initialPeopleExpanded,
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
  const addAnotherHintId = useId();
  const nameInputByWearerId = useRef(new Map<string, HTMLInputElement>());
  const knownWearerIds = useRef<string[] | null>(null);
  /**
   * Split mode: the one card held open on purpose (Edit, or a newly added
   * person). Falls back to the selected wearer. Complete cards other than this
   * one collapse to a short row; incomplete cards always stay open.
   */
  const [expandedWearerId, setExpandedWearerId] = useState<string | null>(null);
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
    const ids = wearers.map((wearer) => wearer.wearerId);
    const previous = knownWearerIds.current;
    knownWearerIds.current = ids;
    if (!previous) return;
    const added = ids.find((wearerId) => !previous.includes(wearerId));
    if (!added) return;
    setExpandedWearerId(added);
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
  const unsavedNameWearerIdsKey = wearers
    .filter((wearer) => unsavedNameWearerIds.has(wearer.wearerId))
    .map((wearer) => wearer.wearerId)
    .join("|");
  const onUnsavedNameWearerIdsChangeRef = useRef(onUnsavedNameWearerIdsChange);
  onUnsavedNameWearerIdsChangeRef.current = onUnsavedNameWearerIdsChange;
  useEffect(() => {
    onUnsavedNameWearerIdsChangeRef.current?.(
      unsavedNameWearerIdsKey ? unsavedNameWearerIdsKey.split("|") : [],
    );
  }, [unsavedNameWearerIdsKey]);
  useEffect(
    () => () => {
      onUnsavedNameWearerIdsChangeRef.current?.([]);
    },
    [],
  );
  /** Confirmed = a real non-empty name (not the "You" placeholder) that was saved or blurred. */
  const isNameConfirmed = (wearer: (typeof wearers)[number]) =>
    wearer.displayName.trim().length > 0 && !unsavedNameWearerIds.has(wearer.wearerId);
  /**
   * The only place a typed name is trimmed: Save and blur store the canonical
   * (leading/trailing-trimmed) name; onChange stores the raw value. A name that
   * is empty after trimming ("   ") is stored blank and never confirms.
   */
  const confirmName = (wearer: (typeof wearers)[number], source: "save" | "blur") => {
    const canonical = canonicalWearerDisplayName(wearer.displayName);
    if (canonical !== wearer.displayName) onRenameWearer(wearer.wearerId, canonical);
    if (canonical.length === 0) {
      if (source === "save") {
        setNameHintWearerIds((current) => withId(current, wearer.wearerId));
      }
      return;
    }
    setUnsavedNameWearerIds((current) => withoutId(current, wearer.wearerId));
    setNameHintWearerIds((current) => withoutId(current, wearer.wearerId));
  };
  /** Split card setup is complete: confirmed name and at least one owned garment. */
  const isWearerSetupComplete = (wearer: (typeof wearers)[number]) =>
    isNameConfirmed(wearer) &&
    garments.some(
      (garment) => order.assignmentByGarmentKey[garment.garmentKey] === wearer.wearerId,
    );
  const openWearerId = expandedWearerId ?? activeWearerId;
  const isWearerCardCollapsed = (wearer: (typeof wearers)[number]) =>
    wearers.length > 1 &&
    wearer.wearerId !== openWearerId &&
    isWearerSetupComplete(wearer);
  const atWearerCap = wearers.length >= cap;
  const namesPending = wearers.some((wearer) => !isNameConfirmed(wearer));
  /**
   * Presentation only: flash a person's Save button once when it turns into
   * Saved (any path), then settle to the outline. Not on mount, and never under
   * reduced motion. Name confirmation itself is untouched.
   */
  const confirmedWearerIdsKey = wearers
    .filter((wearer) => isNameConfirmed(wearer))
    .map((wearer) => wearer.wearerId)
    .join("|");
  const allWearerIdsKey = wearers.map((wearer) => wearer.wearerId).join("|");
  const previousNameState = useRef<{
    confirmed: ReadonlySet<string>;
    present: ReadonlySet<string>;
  } | null>(null);
  const [flashingSavedIds, setFlashingSavedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const savedFlashTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const confirmed = new Set(confirmedWearerIdsKey ? confirmedWearerIdsKey.split("|") : []);
    const present = new Set(allWearerIdsKey ? allWearerIdsKey.split("|") : []);
    const previous = previousNameState.current;
    previousNameState.current = { confirmed, present };
    if (!previous || prefersReducedMotion()) return;
    // Only people already on screen and unconfirmed last render (Save -> Saved).
    const newlySaved = [...confirmed].filter(
      (wearerId) => previous.present.has(wearerId) && !previous.confirmed.has(wearerId),
    );
    for (const wearerId of newlySaved) {
      setFlashingSavedIds((current) => withId(current, wearerId));
      const pending = savedFlashTimers.current.get(wearerId);
      if (pending) clearTimeout(pending);
      savedFlashTimers.current.set(
        wearerId,
        setTimeout(() => {
          savedFlashTimers.current.delete(wearerId);
          setFlashingSavedIds((current) => withoutId(current, wearerId));
        }, NAME_SAVED_FLASH_MS),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedWearerIdsKey, allWearerIdsKey]);
  useEffect(() => {
    const timers = savedFlashTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);
  // The cap reason always wins over the save-name reason.
  const addAnotherDisabledReason = atWearerCap
    ? wearers.length >= MAX_CONFIGURED_ACTIVE_WEARERS
      ? MAXIMUM_PEOPLE_COPY
      : NEED_GARMENT_FOR_PERSON_COPY
    : namesPending
      ? SAVE_NAMES_BEFORE_ADDING_COPY
      : null;
  // Another garment raises the garment-tied cap, unless the hard ceiling is reached.
  const showAddGarment =
    Boolean(onAddGarment) &&
    ((atWearerCap && wearers.length < MAX_CONFIGURED_ACTIVE_WEARERS) ||
      spareFabricCapacityAvailable);
  const addAnotherPerson = (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-wearer-add-another="true"
          className="inline-flex min-h-10 items-center rounded-xl border border-heritage-green bg-heritage-green px-4 py-1.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          disabled={addAnotherDisabledReason !== null}
          title={addAnotherDisabledReason ?? undefined}
          aria-describedby={addAnotherDisabledReason ? addAnotherReasonId : addAnotherHintId}
          onClick={() => {
            if (addAnotherDisabledReason !== null) return;
            onAddWearer("", null);
          }}
        >
          + Add another person
        </button>
        {showAddGarment ? (
          <button
            type="button"
            data-wearer-add-garment="true"
            className="inline-flex min-h-10 items-center rounded-xl border border-heritage-green bg-white px-4 py-1.5 text-sm font-bold text-heritage-green"
            onClick={() => onAddGarment?.()}
          >
            {REMAINING_FABRIC_CAPACITY_OFFER_ADD_GARMENT}
          </button>
        ) : null}
      </div>
      {addAnotherDisabledReason ? (
        <p
          id={addAnotherReasonId}
          data-wearer-add-another-reason="true"
          className="mt-2 text-xs text-heritage-ink/65"
        >
          {addAnotherDisabledReason}
        </p>
      ) : (
        <p
          id={addAnotherHintId}
          data-wearer-add-person-hint="true"
          className="mt-2 text-xs text-heritage-ink/60"
        >
          Ordering for someone else? Add them here.
        </p>
      )}
    </div>
  );
  const showPeopleUi =
    wearers.length > 1 || peopleExpanded || presentation === "people";
  // For me is the solo first-screen choice; Add a person / people UI deselects it.
  const forMeSelected = !showPeopleUi;

  // Latest callback without re-firing on identity changes.
  const onPeopleUiChangeRef = useRef(onPeopleUiChange);
  useEffect(() => {
    onPeopleUiChangeRef.current = onPeopleUiChange;
  });
  useEffect(() => {
    onPeopleUiChangeRef.current?.(showPeopleUi);
  }, [showPeopleUi]);
  useEffect(
    () => () => {
      onPeopleUiChangeRef.current?.(false);
    },
    [],
  );

  /**
   * Only for me / For me: remove extra people, then return to the solo strip
   * and keep the remaining person's name.
   * Remove on the last card uses the same collapse and also clears that
   * person's name (`clearSoleIdentity`).
   */
  const collapseToSolo = (options?: { clearSoleIdentity?: boolean }) => {
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
    onCollapseToSolo?.(options);
  };

  if (!showPeopleUi) {
    return (
      <section
        className="mb-4 rounded-2xl border border-heritage-gold/25 bg-white p-4 shadow-sm"
        data-wearer-solo-first="true"
      >
        <p className="text-sm text-heritage-ink/70">{SOLO_FIRST_COPY}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-wearer-for-me="true"
            data-wearer-for-me-selected={forMeSelected ? "true" : "false"}
            aria-pressed={forMeSelected}
            className={`inline-flex min-h-10 items-center rounded-xl border px-4 py-1.5 text-sm font-bold ${
              forMeSelected
                ? "border-heritage-green bg-heritage-green text-white"
                : "border-heritage-gold/30 bg-white text-heritage-green"
            }`}
            onClick={() => collapseToSolo()}
          >
            For me
          </button>
          <button
            type="button"
            data-wearer-add-people="true"
            className={`inline-flex min-h-10 items-center rounded-xl border px-4 py-1.5 text-sm font-bold ${
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
      className="mb-4 rounded-2xl border border-heritage-gold/25 bg-white p-4 shadow-sm"
      data-wearer-people="true"
    >
      <p className="text-sm text-heritage-ink/70">{SOLO_FIRST_COPY}</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-serif text-base font-bold text-heritage-green">
          People in this order
        </h3>
        <button
          type="button"
          data-wearer-only-for-me="true"
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-heritage-green/30 px-3 text-xs font-bold text-heritage-green"
          onClick={() => collapseToSolo()}
        >
          Only for me
        </button>
      </div>
      <p className="mt-1 text-sm text-heritage-ink/65">
        Add everyone these clothes are for, then tick the
        garments each person will wear on their card.
      </p>
      {deleteRejection ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {deleteRejection}
        </p>
      ) : null}
      <h4 className="mt-4 text-sm font-bold text-heritage-green">Add people</h4>
      <div className="mt-2 grid gap-2">
        {wearers.map((wearer, index) => isWearerCardCollapsed(wearer) ? (
          <article
            key={wearer.wearerId}
            data-wearer-card-collapsed="true"
            className={`rounded-2xl border ${
              wearer.wearerId === activeWearerId
                ? "border-heritage-gold bg-heritage-cream/40"
                : "border-heritage-gold/20 bg-white"
            }`}
          >
            <button
              type="button"
              data-wearer-card-expand="true"
              aria-expanded={false}
              aria-label={`Edit ${labelForWearer(wearer)}`}
              className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-2xl px-3 py-1.5 text-left text-sm"
              onClick={() => {
                setExpandedWearerId(wearer.wearerId);
                onSelectWearer(wearer.wearerId);
              }}
            >
              <span className="font-bold text-heritage-green">{labelForWearer(wearer)}</span>
              <span className="min-w-0 flex-1 basis-36 break-words text-xs text-heritage-ink/65">
                {garments
                  .filter((garment) => order.assignmentByGarmentKey[garment.garmentKey] === wearer.wearerId)
                  .map((garment) => labelFor(garment))
                  .join(", ")}
              </span>
              <span aria-hidden="true" className="ml-auto shrink-0 text-xs font-bold text-heritage-green underline">
                Edit
              </span>
            </button>
          </article>
        ) : (
          <article
            key={wearer.wearerId}
            onClick={() => {
              setExpandedWearerId(wearer.wearerId);
              onSelectWearer(wearer.wearerId);
            }}
            className={`rounded-2xl border p-2.5 ${
              wearer.wearerId === activeWearerId
                ? "border-heritage-gold bg-heritage-cream/40"
                : "border-heritage-gold/20 bg-white"
            }`}
          >
            {/* Name + Save stay on one row; Move up / Remove trail it when they fit
                (desktop) and wrap together onto a short second row otherwise. */}
            <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
              <label className="block min-w-0 flex-1 basis-36 text-xs font-semibold text-heritage-ink/70">
                Name or nickname
                <input
                  ref={(node) => {
                    if (node) nameInputByWearerId.current.set(wearer.wearerId, node);
                    else nameInputByWearerId.current.delete(wearer.wearerId);
                  }}
                  aria-label={`Name or nickname for ${labelForWearer(wearer)}`}
                  className="mt-0.5 min-h-9 w-full min-w-0 rounded-xl border border-heritage-gold/30 bg-white px-3 py-1 text-sm text-heritage-ink placeholder:text-heritage-ink/40"
                  placeholder={index === 0 ? "You" : "Add person"}
                  value={wearer.displayName}
                  onFocus={() => {
                    setExpandedWearerId(wearer.wearerId);
                    onSelectWearer(wearer.wearerId);
                  }}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    // Any edit clears confirmation until Save or blur again. The raw
                    // value is stored (no trim) so internal/trailing spaces survive typing.
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
                data-wearer-name-saved-flash={
                  isNameConfirmed(wearer) && flashingSavedIds.has(wearer.wearerId) ? "true" : undefined
                }
                className={`inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl border px-3 text-xs font-bold ${
                  isNameConfirmed(wearer)
                    ? // Saved reads as success: bold green outline (ring keeps the 1px border box).
                      `gap-1 border-heritage-green text-heritage-green ring-1 ring-inset ring-heritage-green motion-safe:transition-colors motion-safe:duration-500 ${
                        flashingSavedIds.has(wearer.wearerId)
                          ? "bg-heritage-green/25"
                          : "bg-heritage-green/5"
                      }`
                    : "border-heritage-green bg-heritage-green text-white"
                }`}
                onClick={(event) => {
                  event?.stopPropagation?.();
                  confirmName(wearer, "save");
                }}
              >
                {isNameConfirmed(wearer) ? (
                  <>
                    <span aria-hidden="true">✓</span>
                    Saved
                  </>
                ) : (
                  "Save"
                )}
              </button>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {/* Sole expanded card: no ordering to do, so Move up is hidden, not just disabled. */}
                {wearers.length > 1 ? (
                  <button
                    type="button"
                    data-wearer-move-up="true"
                    className="inline-flex min-h-9 items-center justify-center rounded-xl border border-heritage-green/30 px-3 text-xs font-bold text-heritage-green disabled:cursor-not-allowed disabled:opacity-40"
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
                ) : null}
                <button
                  type="button"
                  data-wearer-remove="true"
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-heritage-green/30 px-3 text-xs font-bold text-heritage-green"
                  onClick={(event) => {
                    event?.stopPropagation();
                    // Last card: collapse to the solo strip and clear the name.
                    // Only for me keeps it. The wearer id stays.
                    if (wearers.length === 1) {
                      setNameHintWearerIds((current) => withoutId(current, wearer.wearerId));
                      setUnsavedNameWearerIds((current) => withoutId(current, wearer.wearerId));
                      collapseToSolo({ clearSoleIdentity: true });
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
            </div>
            {nameHintWearerIds.has(wearer.wearerId) && wearer.displayName.trim().length === 0 ? (
              <p data-wearer-name-hint="true" className="mt-1 text-xs font-semibold text-red-700">
                {NAME_REQUIRED_HINT}
              </p>
            ) : null}
            {wearers.length === 1 ? (
              // Sole mode: reconcileWearerOrder auto-assigns every garment to this
              // person, so there is nothing to tick. Split mode shows the checklist.
              <div
                data-wearer-sole-all-assigned="true"
                className="mt-1.5 rounded-xl bg-heritage-cream/40 px-2.5 py-1.5 text-xs leading-snug text-heritage-ink/70"
              >
                <p className="font-semibold text-heritage-ink">{SOLE_ALL_ASSIGNED_COPY}</p>
                <p className="mt-0.5">{SOLE_SPLIT_HINT_COPY}</p>
                {garments.length > 0 ? (
                  <p data-wearer-sole-garment-names="true" className="mt-0.5 break-words text-heritage-ink/55">
                    {garments.map((garment) => labelFor(garment)).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : (
              <fieldset
                className="mt-1"
                data-wearer-garment-assign="true"
              >
                <legend className="text-xs font-semibold text-heritage-ink">
                  Garments for this person
                </legend>
                <ul className="mt-1 grid gap-1">
                  {garments.map((garment) => {
                    const label = labelFor(garment);
                    const ownerId = order.assignmentByGarmentKey[garment.garmentKey];
                    const checked = ownerId === wearer.wearerId;
                    // Owned by another person: listed but locked (no stealing). The owner
                    // unticks first.
                    const otherOwner =
                      ownerId && !checked
                        ? wearers.find((candidate) => candidate.wearerId === ownerId) || null
                        : null;
                    const locked = otherOwner !== null;
                    const muted = locked;
                    const noteId = `${wearer.wearerId}-${garment.garmentKey}-note`;
                    return (
                      <li
                        key={garment.garmentKey}
                        // A tick is not a card select: React runs the card's onClick before
                        // the checkbox onChange, so a bubbling click re-pointed the live
                        // form mid-tick (B1). Card chrome outside the rows still selects.
                        onClick={(event) => event.stopPropagation()}
                        data-wearer-garment-owned-by-other={otherOwner ? otherOwner.wearerId : undefined}
                      >
                        <label
                          className={`flex min-h-9 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border px-3 py-1.5 text-sm ${
                            checked
                              ? "border-heritage-green bg-heritage-green/5 font-semibold text-heritage-green"
                              : muted
                                ? "border-heritage-gold/20 bg-heritage-cream/30 text-heritage-ink/55"
                                : "border-heritage-gold/30 bg-white text-heritage-ink"
                          } ${locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                        >
                          <span className="flex min-w-0 flex-1 basis-36 items-center gap-3">
                            <input
                              type="checkbox"
                              data-wearer-garment-key={garment.garmentKey}
                              aria-label={`${label} for ${labelForWearer(wearer)}`}
                              className={`size-4 shrink-0 accent-heritage-green disabled:cursor-not-allowed`}
                              checked={checked}
                              disabled={locked}
                              onClick={(event) => event.stopPropagation()}
                              aria-describedby={muted ? noteId : undefined}
                              onChange={() => {
                                if (locked) return;
                                setExpandedWearerId(wearer.wearerId);
                                if (checked) {
                                  onUnassignGarment?.(garment.garmentKey);
                                  return;
                                }
                                // Assign to this person only; a blocked result changes nothing.
                                onAssignGarment(garment.garmentKey, wearer.wearerId);
                              }}
                            />
                            <span className="min-w-0 break-words">{label}</span>
                          </span>
                          {/* The note trails the name inside this garment's pill, so it can
                              never read as belonging to the row above or below. */}
                          {otherOwner ? (
                            <span
                              id={noteId}
                              data-wearer-garment-owner-note="true"
                              className="ml-auto shrink-0 text-xs font-normal text-heritage-ink/75"
                            >
                              Assigned to {labelForWearer(otherOwner)}
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
          </article>
        ))}
      </div>
      {wearers.length > 1 && garmentsRemainUnassigned ? (
        <p
          data-wearer-unassigned-note="true"
          className="mt-3 text-sm font-semibold text-heritage-ink"
        >
          Assign all garments to continue.
        </p>
      ) : null}
      {addAnotherPerson}
    </section>
  );
};
