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
  hasUnassignedPhysicalGarments,
  isGarmentEligibleForWearer,
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

/** Quiet in-card guide for an unassigned garment this person's fit cannot wear. */
/** One-shot polite announcement when a Fit change leaves garments newly unfit. */
const FIT_CONFLICT_LIVE_COPY = "Some garments are not available for this fit.";
/** How long newly unfit pills pulse after a Fit change (matches the 1.2s keyframes). */
export const FIT_CONFLICT_PULSE_MS = 1300;

/** Save -> Saved success flash before settling to the green outline. */
export const NAME_SAVED_FLASH_MS = 500;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const unfitGarmentGuide = (wearerLabel: string): string =>
  wearerLabel === "You"
    ? "Not available for your selected fit."
    : `Not available for ${wearerLabel}'s selected fit.`;

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
  onPeopleUiChange,
  garmentTypeSelection,
  additionalGarmentConstructions,
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
  /**
   * Reports whether the people panel is open (Add a person or 2+ people), so
   * Design Studio can hide the solo-only Dimension fit. Reports false on unmount.
   */
  onPeopleUiChange?: (open: boolean) => void;
  /**
   * Garment construction context for the up-front fit eligibility check on
   * unassigned garment rows (same inputs as assignGarmentToWearer). Without it
   * rows are treated as eligible and the assign mutation still guards.
   */
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
  /**
   * Same rule as the in-card unfit note: unassigned (no other owner, not this
   * person's), a fit is chosen, and the garment is ineligible for that fit.
   */
  const isGarmentUnfitForWearer = (
    wearerId: string,
    fitContext: (typeof wearers)[number]["fitContext"],
    garment: MeasurementPhysicalGarment,
  ): boolean => {
    const ownerId = order.assignmentByGarmentKey[garment.garmentKey];
    const checked = ownerId === wearerId;
    const otherOwner =
      ownerId && !checked
        ? wearers.find((candidate) => candidate.wearerId === ownerId) || null
        : null;
    return (
      !checked &&
      !otherOwner &&
      fitContext !== null &&
      garmentTypeSelection !== undefined &&
      !isGarmentEligibleForWearer({
        garment,
        fitContext,
        garmentTypeSelection,
        additionalGarmentConstructions,
      })
    );
  };
  const unfitKeysFor = (
    wearerId: string,
    fitContext: (typeof wearers)[number]["fitContext"],
  ): string[] =>
    garments
      .filter((garment) => isGarmentUnfitForWearer(wearerId, fitContext, garment))
      .map((garment) => garment.garmentKey);

  /**
   * Fit-conflict attention: set only from a Fit change on a Split card that makes
   * at least one garment newly unfit (never on mount, panel open or card select).
   */
  const [fitAttention, setFitAttention] = useState<{
    wearerId: string;
    garmentKeys: readonly string[];
    pulsing: boolean;
    nonce: number;
  } | null>(null);
  const [fitAttentionLive, setFitAttentionLive] = useState("");
  const fitAttentionNonce = useRef(0);
  const unfitRowByKey = useRef(new Map<string, HTMLLIElement>());
  const fitAttentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleFitChange = (
    wearer: (typeof wearers)[number],
    fitContext: "male" | "female",
  ) => {
    const before = new Set(unfitKeysFor(wearer.wearerId, wearer.fitContext));
    const newlyUnfit =
      wearers.length > 1 && wearer.fitContext !== fitContext
        ? unfitKeysFor(wearer.wearerId, fitContext).filter((key) => !before.has(key))
        : [];
    onSetFitContext(wearer.wearerId, fitContext);
    if (newlyUnfit.length === 0) return;
    fitAttentionNonce.current += 1;
    setFitAttention({
      wearerId: wearer.wearerId,
      garmentKeys: newlyUnfit,
      pulsing: true,
      nonce: fitAttentionNonce.current,
    });
    setFitAttentionLive(FIT_CONFLICT_LIVE_COPY);
  };
  useEffect(() => {
    if (!fitAttention?.pulsing) return;
    // Scroll/focus happen even with reduced motion; only the pulse is motion-safe.
    const first = unfitRowByKey.current.get(
      `${fitAttention.wearerId}|${fitAttention.garmentKeys[0]}`,
    );
    first?.scrollIntoView?.({ block: "nearest" });
    first?.focus?.();
    if (fitAttentionTimer.current) clearTimeout(fitAttentionTimer.current);
    fitAttentionTimer.current = setTimeout(() => {
      fitAttentionTimer.current = null;
      setFitAttention((current) =>
        current && current.nonce === fitAttention.nonce
          ? { ...current, pulsing: false }
          : current,
      );
      setFitAttentionLive("");
    }, FIT_CONFLICT_PULSE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAttention?.nonce]);
  useEffect(
    () => () => {
      if (fitAttentionTimer.current) clearTimeout(fitAttentionTimer.current);
    },
    [],
  );

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
          aria-describedby={addAnotherDisabledReason ? addAnotherReasonId : undefined}
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
      ) : null}
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
            onClick={collapseToSolo}
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
      <h4 className="mt-4 text-sm font-bold text-heritage-green">Add people</h4>
      <div className="mt-2 grid gap-2">
        {wearers.map((wearer, index) => (
          <article
            key={wearer.wearerId}
            onClick={() => onSelectWearer(wearer.wearerId)}
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
            </div>
            {nameHintWearerIds.has(wearer.wearerId) && wearer.displayName.trim().length === 0 ? (
              <p data-wearer-name-hint="true" className="mt-1 text-xs font-semibold text-red-700">
                {NAME_REQUIRED_HINT}
              </p>
            ) : null}
            <fieldset className="mt-1">
              <legend className="text-xs font-semibold text-heritage-ink">
                Fit for measurements
              </legend>
              <div className="mt-1 grid grid-cols-2 gap-1.5 text-sm">
                {(["male", "female"] as const).map((fitContext) => (
                  <label
                    key={fitContext}
                    className={`flex min-h-9 cursor-pointer items-center justify-center rounded-xl border px-3 font-semibold ${
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
                      onChange={() => handleFitChange(wearer, fitContext)}
                    />
                    {fitContext === "male" ? "Male fit" : "Female fit"}
                  </label>
                ))}
              </div>
              {wearer.fitContext === null ? (
                <p className="mt-1 text-sm text-heritage-ink/70">
                  {wearers.length > 1
                    ? `Select a fit for ${labelForWearer(wearer)} before assigning garments.`
                    : `Select a fit for ${labelForWearer(wearer)} to see the right measurements.`}
                </p>
              ) : null}
            </fieldset>
            {wearers.length === 1 ? (
              // Sole mode: reconcileWearerOrder auto-assigns every eligible garment to
              // this person, so there is nothing to tick. Split mode shows the checklist.
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
                disabled={wearer.fitContext === null}
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
                    // unticks first. Shown even when this card's fit is missing.
                    const otherOwner =
                      ownerId && !checked
                        ? wearers.find((candidate) => candidate.wearerId === ownerId) || null
                        : null;
                    const fitMissing = wearer.fitContext === null;
                    // Unassigned garment this fit cannot wear: decided up front, so the
                    // box is disabled before any click (quiet guide, never a red alert).
                    const unfit = isGarmentUnfitForWearer(wearer.wearerId, wearer.fitContext, garment);
                    const locked = fitMissing || otherOwner !== null || unfit;
                    const muted = otherOwner !== null || unfit;
                    const noteId = `${wearer.wearerId}-${garment.garmentKey}-note`;
                    const attentionHere =
                      unfit && fitAttention?.wearerId === wearer.wearerId
                        ? fitAttention.garmentKeys.indexOf(garment.garmentKey)
                        : -1;
                    const pulsing = attentionHere >= 0 && fitAttention?.pulsing === true;
                    const focusTarget = attentionHere === 0;
                    const rowKey = `${wearer.wearerId}|${garment.garmentKey}`;
                    return (
                      <li
                        key={garment.garmentKey}
                        // A tick is not a card select: React runs the card's onClick before
                        // the checkbox onChange, so a bubbling click re-pointed the live
                        // form mid-tick (B1). Card chrome outside the rows still selects.
                        onClick={(event) => event.stopPropagation()}
                        ref={(node) => {
                          if (node) unfitRowByKey.current.set(rowKey, node);
                          else unfitRowByKey.current.delete(rowKey);
                        }}
                        tabIndex={focusTarget ? -1 : undefined}
                        data-wearer-garment-unfit-focus={focusTarget ? "true" : undefined}
                        data-wearer-garment-unfit-pulse={pulsing ? "true" : undefined}
                        className={focusTarget ? "rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold" : undefined}
                        data-wearer-garment-owned-by-other={otherOwner ? otherOwner.wearerId : undefined}
                        data-wearer-garment-unfit={unfit ? "true" : undefined}
                      >
                        <label
                          data-wearer-garment-unfit-beam={unfit ? "true" : undefined}
                          className={`flex min-h-9 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border px-3 py-1.5 text-sm ${
                            checked
                              ? "border-heritage-green bg-heritage-green/5 font-semibold text-heritage-green"
                              : unfit
                                ? // Resting unfit: gold left beam; muting stays on the checkbox and name only.
                                  "border-heritage-gold/60 border-l-4 border-l-heritage-gold bg-heritage-gold/5 text-heritage-ink"
                                : muted
                                  ? "border-heritage-gold/20 bg-heritage-cream/30 text-heritage-ink/55"
                                  : "border-heritage-gold/30 bg-white text-heritage-ink"
                          } ${
                            unfit
                              ? "cursor-not-allowed"
                              : locked
                                ? "cursor-not-allowed opacity-50"
                                : "cursor-pointer"
                          } ${pulsing ? "motion-safe:animate-step2-next-unassigned" : ""}`}
                        >
                          <span className="flex min-w-0 flex-1 basis-36 items-center gap-3">
                            <input
                              type="checkbox"
                              data-wearer-garment-key={garment.garmentKey}
                              aria-label={`${label} for ${labelForWearer(wearer)}`}
                              className={`size-4 shrink-0 accent-heritage-green disabled:cursor-not-allowed ${unfit ? "opacity-50" : ""}`}
                              checked={checked}
                              disabled={locked}
                              onClick={(event) => event.stopPropagation()}
                              aria-describedby={muted ? noteId : undefined}
                              onChange={() => {
                                if (locked) return;
                                if (checked) {
                                  onUnassignGarment?.(garment.garmentKey);
                                  return;
                                }
                                // Assign to this person only; a blocked result changes nothing.
                                onAssignGarment(garment.garmentKey, wearer.wearerId);
                              }}
                            />
                            <span className={`min-w-0 break-words ${unfit ? "text-heritage-ink/60" : ""}`}>{label}</span>
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
                          ) : unfit ? (
                            <span
                              id={noteId}
                              data-wearer-garment-unfit-note="true"
                              className="ml-auto shrink-0 text-xs font-semibold text-heritage-bronze"
                            >
                              {unfitGarmentGuide(labelForWearer(wearer))}
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
      <p className="sr-only" aria-live="polite" data-wearer-fit-attention-live="true">
        {fitAttentionLive}
      </p>
    </section>
  );
};
