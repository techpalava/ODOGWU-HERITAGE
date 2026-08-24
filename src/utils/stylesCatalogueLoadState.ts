import type {
  DesignSource,
  GarmentTypeStepSelection,
  StyleCategory,
  UploadedDesignSource,
} from "../types";
import {
  reconcileFutureDesignStyleSelection,
  type FutureDesignStyleSelectionResolution,
} from "./designStudioFutureDesignStyle";

/** Authoritative Style catalogue readiness from the Firestore listener. */
export type StylesLoadState = "loading" | "ready" | "error";

/**
 * First Style snapshot (success or error) has arrived.
 * styles.length must never be used as readiness.
 */
export const isStylesCatalogueAuthoritative = (
  stylesLoadState: StylesLoadState,
): boolean =>
  stylesLoadState === "ready" || stylesLoadState === "error";

/**
 * Draft hydration must wait for the first Style snapshot/error so catalogue
 * reconciliation is not run against a pre-snapshot empty array.
 */
export const shouldAwaitStylesCatalogueBeforeDraftHydration = (
  stylesLoadState: StylesLoadState,
): boolean => stylesLoadState === "loading";

/**
 * Gate for Design Studio guest/authenticated draft hydration.
 * Must NOT require styles.length > 0 — a ready empty catalogue is valid.
 */
export const canBeginFutureDesignDraftHydration = ({
  guestDraftHydrated,
  isLoadingData,
  stylesLoadState,
  hasFabrics,
  hasGarmentCatalog,
  identityStatus,
}: {
  guestDraftHydrated: boolean;
  isLoadingData: boolean;
  stylesLoadState: StylesLoadState;
  hasFabrics: boolean;
  hasGarmentCatalog: boolean;
  identityStatus: string;
}): boolean => {
  if (guestDraftHydrated) return false;
  if (isLoadingData) return false;
  if (shouldAwaitStylesCatalogueBeforeDraftHydration(stylesLoadState)) {
    return false;
  }
  if (!hasFabrics) return false;
  if (!hasGarmentCatalog) return false;
  if (identityStatus === "resolving") return false;
  return true;
};

/**
 * Preserve a saved catalogue style id without claiming selected/deleted/missing.
 * Used while stylesLoadState is loading or error.
 */
export const preserveUnresolvedCatalogueStyleSelection = (
  selectedStyleId: string | null | undefined,
): FutureDesignStyleSelectionResolution => ({
  selectedStyleId: selectedStyleId?.trim() || null,
  selectedStyle: null,
  status: "none",
  compatibility: null,
});

/**
 * Catalogue-dependent design-style reconciliation during draft hydration.
 * Loading/error: preserve identity without selected/deleted conclusions.
 * Ready: authoritative reconcileFutureDesignStyleSelection.
 */
export const resolveHydratedDesignStyleSelection = ({
  stylesLoadState,
  selectedStyleId,
  styles,
  garmentTypeSelection,
}: {
  stylesLoadState: StylesLoadState;
  selectedStyleId: string | null | undefined;
  styles: readonly StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
}): FutureDesignStyleSelectionResolution => {
  if (stylesLoadState !== "ready") {
    return preserveUnresolvedCatalogueStyleSelection(selectedStyleId);
  }

  return reconcileFutureDesignStyleSelection({
    selectedStyleId: selectedStyleId?.trim() || null,
    styles,
    garmentTypeSelection,
  });
};

/**
 * Catalogue path Step 3 completion. Requires stylesLoadState === "ready".
 */
export const isCatalogueDesignStyleStageComplete = ({
  stylesLoadState,
  selectedStyleId,
  styles,
  garmentTypeSelection,
}: {
  stylesLoadState: StylesLoadState;
  selectedStyleId: string | null | undefined;
  styles: readonly StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
}): boolean => {
  if (stylesLoadState !== "ready") {
    return false;
  }
  return (
    reconcileFutureDesignStyleSelection({
      selectedStyleId,
      styles,
      garmentTypeSelection,
    }).status === "selected"
  );
};

/**
 * Shared Step 3 → Custom Details readiness for DesignStudioView and Step 3 UI.
 * Upload path is independent of Style catalogue readiness.
 */
export const isFutureDesignStyleStageCompleteForCustomDetails = ({
  stylesLoadState,
  selectedStyleId,
  styles,
  garmentTypeSelection,
  designSource,
  isUploadedDesignConfirmed,
  isUploadedDesignPricingActive,
}: {
  stylesLoadState: StylesLoadState;
  selectedStyleId: string | null | undefined;
  styles: readonly StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
  designSource: DesignSource | null;
  isUploadedDesignConfirmed: boolean;
  isUploadedDesignPricingActive: boolean;
}): boolean => {
  if (designSource?.kind === "uploaded") {
    return isUploadedDesignConfirmed && isUploadedDesignPricingActive;
  }
  return isCatalogueDesignStyleStageComplete({
    stylesLoadState,
    selectedStyleId,
    styles,
    garmentTypeSelection,
  });
};

export const isUploadedDesignSource = (
  designSource: DesignSource | null | undefined,
): designSource is UploadedDesignSource => designSource?.kind === "uploaded";

/** Module-level Style listener generation — invalidated before await on re-init. */
let stylesLoadGeneration = 0;

export const peekStylesCatalogueLoadGeneration = (): number =>
  stylesLoadGeneration;

/** Invalidate any prior Style listener callbacks; returns the new generation. */
export const invalidateStylesCatalogueLoadGeneration = (): number => {
  stylesLoadGeneration += 1;
  return stylesLoadGeneration;
};

export const isCurrentStylesCatalogueLoadGeneration = (
  callbackGeneration: number,
): boolean => callbackGeneration === stylesLoadGeneration;

export interface StylesCatalogueListenerState {
  styles: StyleCategory[];
  stylesLoadState: StylesLoadState;
  stylesLoadError: string | null;
}

/**
 * Apply a Style listener callback only when its generation is still current.
 * Stale old-generation data/error events are ignored.
 */
export const applyStylesCatalogueListenerEvent = (
  state: StylesCatalogueListenerState,
  event:
    | {
        kind: "snapshot";
        callbackGeneration: number;
        styles: readonly StyleCategory[];
      }
    | {
        kind: "error";
        callbackGeneration: number;
        message: string;
      },
  currentGeneration: number = stylesLoadGeneration,
): StylesCatalogueListenerState => {
  if (event.callbackGeneration !== currentGeneration) {
    return state;
  }
  if (event.kind === "snapshot") {
    return {
      styles: [...event.styles],
      stylesLoadState: "ready",
      stylesLoadError: null,
    };
  }
  return {
    ...state,
    stylesLoadState: "error",
    stylesLoadError: event.message,
  };
};
