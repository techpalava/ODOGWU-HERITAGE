import { getStyleBaseFabricCapacityComposition } from "../config/StyleFabricCapacityConfig.js";
import { getStep1GarmentDisplayLabel } from "./garmentConstructionPricing.js";
import { getDesignStyleAuthorityMetadata } from "./designStyleAuthority.js";
import { resolveFutureDesignStyleCompatibility } from "./designStudioFutureDesignStyle.js";
import { getGarmentTypeSelectedDemographics } from "./garmentTypeStepState.js";
import type { StylesLoadState } from "./stylesCatalogueLoadState.js";
import type {
  CanonicalPhysicalGarmentType,
  FabricGarmentType,
  GarmentTypeStepSelection,
  StyleCategory,
} from "../types.js";

export const GALLERY_STYLE_QUERY_PARAM = "style";
export const EXPLORE_DESIGN_STYLES_ANCHOR = "explore-design-styles";

const GALLERY_STYLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

const CANONICAL_GARMENT_TYPES = new Set<CanonicalPhysicalGarmentType>([
  "shirt",
  "trouser",
  "skirt",
  "long_skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
  "agbada",
]);

export const isGalleryStyleId = (value: string): boolean =>
  GALLERY_STYLE_ID.test(value);

export const readGalleryStyleId = (search: string): string | null => {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const raw = params.get(GALLERY_STYLE_QUERY_PARAM);
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return isGalleryStyleId(id) ? id : null;
};

/** Address bar for a gallery handoff. Other query params stay. Hash is kept only when clearing. */
export const buildGalleryStyleSearch = (
  search: string,
  styleId: string | null,
): string => {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (styleId && isGalleryStyleId(styleId)) {
    params.set(GALLERY_STYLE_QUERY_PARAM, styleId);
  } else {
    params.delete(GALLERY_STYLE_QUERY_PARAM);
  }
  const next = params.toString();
  return next ? `?${next}` : "";
};

export interface GalleryStyleHistory {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  state: unknown;
  back(): void;
}

export interface GalleryStyleLocation {
  pathname: string;
  search: string;
  hash: string;
}

const historyStateRecord = (state: unknown): Record<string, unknown> | null =>
  state && typeof state === "object" ? (state as Record<string, unknown>) : null;

export const galleryStyleHistoryState = (
  state: unknown,
): { galleryStyleEntry: true } | Record<string, unknown> => ({
  ...(historyStateRecord(state) || {}),
  galleryStyleEntry: true,
});

export const isGalleryStyleHistoryEntry = (state: unknown): boolean =>
  historyStateRecord(state)?.galleryStyleEntry === true;

let galleryStyleEntryArmed = false;

export const noteGalleryStyleEntryArmed = (armed: boolean): void => {
  galleryStyleEntryArmed = armed;
};

/** True once, when this studio visit was opened from a gallery card. */
export const consumeGalleryStyleEntryArmed = (): boolean => {
  const armed = galleryStyleEntryArmed;
  galleryStyleEntryArmed = false;
  return armed;
};

/**
 * Open the studio from a gallery card. pushState so Back returns to the page
 * the customer was on. The style id lives in ?style= and survives refresh.
 */
export const pushGalleryStyleEntry = (
  styleId: string,
  history: GalleryStyleHistory,
  location: GalleryStyleLocation,
): void => {
  if (!isGalleryStyleId(styleId)) return;
  const search = buildGalleryStyleSearch(location.search, styleId);
  history.pushState(
    galleryStyleHistoryState(history.state),
    "",
    `${location.pathname}${search}`,
  );
  noteGalleryStyleEntryArmed(true);
};

export const replaceGalleryStyleId = (
  styleId: string | null,
  history: GalleryStyleHistory,
  location: GalleryStyleLocation,
): void => {
  const search = buildGalleryStyleSearch(location.search, styleId);
  const hash =
    styleId == null && location.hash === `#${EXPLORE_DESIGN_STYLES_ANCHOR}`
      ? location.hash
      : styleId == null
        ? ""
        : location.hash;
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${search}${hash}`,
  );
};

/**
 * Banner "Back to styles". Always opens Explore Design Styles.
 * Browser Back still uses the pushState entry created when the card was clicked.
 */
export const requestReturnToExploreDesignStyles = (
  history: GalleryStyleHistory,
  location: GalleryStyleLocation,
): "home" => {
  noteGalleryStyleEntryArmed(false);
  const search = buildGalleryStyleSearch(location.search, null);
  history.pushState(
    history.state,
    "",
    `${location.pathname}${search}#${EXPLORE_DESIGN_STYLES_ANCHOR}`,
  );
  return "home";
};

export type GalleryAdvertisedGarments =
  | {
      readonly status: "known";
      readonly garmentTypes: readonly CanonicalPhysicalGarmentType[];
    }
  | { readonly status: "unspecified" };

/**
 * The garment the catalogue card is selling.
 * Known reference composition wins (Bow-Tie Bum Short is bum shorts, even
 * though its fabric-capacity list also includes trousers). A single-garment
 * composition is that garment. Several garments and no reference composition
 * stay unspecified so we do not guess.
 */
export const resolveGalleryAdvertisedGarments = (
  style: StyleCategory,
): GalleryAdvertisedGarments => {
  const metadata = getDesignStyleAuthorityMetadata(style);
  if (
    metadata?.referenceComposition.status === "known" &&
    metadata.referenceComposition.garmentTypes.length > 0
  ) {
    return {
      status: "known",
      garmentTypes: metadata.referenceComposition.garmentTypes,
    };
  }
  const types: CanonicalPhysicalGarmentType[] = [];
  for (const spec of getStyleBaseFabricCapacityComposition(style)) {
    if (!CANONICAL_GARMENT_TYPES.has(spec.garmentType as CanonicalPhysicalGarmentType)) {
      continue;
    }
    const garmentType = spec.garmentType as CanonicalPhysicalGarmentType;
    if (!types.includes(garmentType)) types.push(garmentType);
  }
  if (types.length === 1) return { status: "known", garmentTypes: types };
  return { status: "unspecified" };
};

const isCoupleOrFamilyStyle = (style: StyleCategory): boolean => {
  const gender = String(style.gender || "").trim().toLowerCase();
  return gender === "couple" || gender === "family";
};

const formatGarmentList = (
  garmentTypes: readonly CanonicalPhysicalGarmentType[],
): string => {
  const labels = garmentTypes.map((garmentType) =>
    getStep1GarmentDisplayLabel(garmentType),
  );
  if (labels.length <= 1) return labels[0] || "the advertised garment";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
};

export interface GalleryStyleOccurrenceSnapshot {
  readonly occurrenceToken: string;
  readonly garmentKey: string;
  readonly garmentType: CanonicalPhysicalGarmentType;
  readonly label: string;
  readonly assignmentKind: "none" | "catalog" | "uploaded";
  readonly assignmentStyleId: string | null;
}

export type GalleryStyleIntent =
  | { readonly kind: "none" }
  | { readonly kind: "pending_catalogue"; readonly styleId: string }
  | {
      readonly kind: "catalogue_unavailable";
      readonly styleId: string;
    }
  | {
      readonly kind: "unknown";
      readonly styleId: string;
    }
  | {
      readonly kind: "awaiting_choices";
      readonly styleId: string;
      readonly styleName: string;
    }
  | {
      readonly kind: "choose_on_step_3";
      readonly styleId: string;
      readonly styleName: string;
    }
  | {
      readonly kind: "conflict";
      readonly styleId: string;
      readonly styleName: string;
      readonly customerReason: string;
    }
  | {
      readonly kind: "needs_confirmation";
      readonly styleId: string;
      readonly styleName: string;
    }
  | {
      readonly kind: "ready_to_assign";
      readonly styleId: string;
      readonly styleName: string;
      readonly targets: readonly {
        readonly occurrenceToken: string;
        readonly garmentKey: string;
      }[];
    }
  | {
      readonly kind: "applied";
      readonly styleId: string;
      readonly styleName: string;
      readonly appliedLabels: readonly string[];
    };

const selectionForGarment = (
  garmentTypeSelection: GarmentTypeStepSelection,
  garmentType: CanonicalPhysicalGarmentType,
): GarmentTypeStepSelection => ({
  ...garmentTypeSelection,
  garmentTypes: [garmentType],
});

/**
 * What the gallery handoff should do. Loading never becomes "unknown", so the
 * id survives until the catalogue snapshot arrives.
 * Couple and family styles stay unmatched until Unisex / Family is selected.
 * Auto-assign is exact-match only, and only on the advertised garment.
 */
export const resolveGalleryStyleIntent = ({
  styleId,
  stylesLoadState,
  styles,
  garmentTypeSelection,
  occurrences,
  hydrationSettled,
  replaceConfirmed,
}: {
  styleId: string | null;
  stylesLoadState: StylesLoadState;
  styles: readonly StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
  occurrences: readonly GalleryStyleOccurrenceSnapshot[];
  hydrationSettled: boolean;
  replaceConfirmed: boolean;
}): GalleryStyleIntent => {
  if (!styleId || !isGalleryStyleId(styleId)) return { kind: "none" };
  if (stylesLoadState === "loading") {
    return { kind: "pending_catalogue", styleId };
  }
  if (stylesLoadState === "error") {
    return { kind: "catalogue_unavailable", styleId };
  }

  const style = styles.find((candidate) => candidate.id === styleId) || null;
  if (!style) return { kind: "unknown", styleId };

  const styleName = String(style.name || "").trim() || "This design";
  if (!hydrationSettled) {
    return { kind: "pending_catalogue", styleId };
  }

  const selectedDemographics = getGarmentTypeSelectedDemographics(
    garmentTypeSelection,
  );
  const selectedGarments = garmentTypeSelection.garmentTypes;
  if (selectedGarments.length === 0 || selectedDemographics.length === 0) {
    return { kind: "awaiting_choices", styleId, styleName };
  }

  if (
    isCoupleOrFamilyStyle(style) &&
    !selectedDemographics.includes("unisex")
  ) {
    return {
      kind: "conflict",
      styleId,
      styleName,
      customerReason:
        "This design is for a couple or family. Choose Unisex / Family on Step 1 to use it.",
    };
  }

  const advertised = resolveGalleryAdvertisedGarments(style);
  if (advertised.status === "unspecified") {
    return { kind: "choose_on_step_3", styleId, styleName };
  }

  const advertisedSet = new Set<FabricGarmentType>(advertised.garmentTypes);
  const inOrder = occurrences.filter((occurrence) =>
    advertisedSet.has(occurrence.garmentType),
  );
  if (inOrder.length === 0) {
    return {
      kind: "conflict",
      styleId,
      styleName,
      customerReason: `${styleName} is for ${formatGarmentList(
        advertised.garmentTypes,
      )}, which is not in this order.`,
    };
  }

  const exact = inOrder.filter((occurrence) => {
    const compatibility = resolveFutureDesignStyleCompatibility({
      garmentTypeSelection: selectionForGarment(
        garmentTypeSelection,
        occurrence.garmentType,
      ),
      style,
    });
    return compatibility.status === "exact_match";
  });

  if (exact.length === 0) {
    const sample = resolveFutureDesignStyleCompatibility({
      garmentTypeSelection: selectionForGarment(
        garmentTypeSelection,
        inOrder[0]!.garmentType,
      ),
      style,
    });
    return {
      kind: "conflict",
      styleId,
      styleName,
      customerReason: sample.customerReason,
    };
  }

  const foreign = occurrences.some(
    (occurrence) =>
      occurrence.assignmentKind === "uploaded" ||
      (occurrence.assignmentKind === "catalog" &&
        occurrence.assignmentStyleId !== styleId),
  );
  if (foreign && !replaceConfirmed) {
    return { kind: "needs_confirmation", styleId, styleName };
  }

  const pending = exact.filter(
    (occurrence) =>
      !(
        occurrence.assignmentKind === "catalog" &&
        occurrence.assignmentStyleId === styleId
      ),
  );
  if (pending.length === 0) {
    return {
      kind: "applied",
      styleId,
      styleName,
      appliedLabels: exact.map((occurrence) => occurrence.label),
    };
  }

  return {
    kind: "ready_to_assign",
    styleId,
    styleName,
    targets: pending.map((occurrence) => ({
      occurrenceToken: occurrence.occurrenceToken,
      garmentKey: occurrence.garmentKey,
    })),
  };
};
