import type {
  CanonicalPhysicalGarmentType,
  FabricGarmentType,
  MonogramPlacement,
} from "../types";
import {
  MONOGRAM_PLACEMENT_OPTIONS,
  getDefaultMonogramPlacementForGarmentType,
  getMonogramPlacementLabel,
  getMonogramPlacementsForGarmentType,
} from "../utils/decorativePricing";
import { getStep1GarmentDisplayLabel } from "../utils/garmentConstructionPricing";

/**
 * Concept C icon plus a separate placement map.
 * The icon and Step 1 name identify the garment. The map is dots only
 * for the placements that garment can take. No product photos.
 */
export const MONOGRAM_PREVIEW_SILHOUETTES = [
  "shirt",
  "long_shirt",
  "dress",
  "long_dress",
  "skirt",
  "long_skirt",
  "trouser",
  "nikka_shorts",
  "bum_shorts",
  "agbada",
] as const;

export type MonogramPreviewSilhouette =
  (typeof MONOGRAM_PREVIEW_SILHOUETTES)[number];

export const MONOGRAM_PREVIEW_SILHOUETTE_BY_GARMENT_TYPE = {
  shirt: "shirt",
  trouser: "trouser",
  skirt: "skirt",
  long_skirt: "long_skirt",
  standard_shorts: "nikka_shorts",
  bum_shorts: "bum_shorts",
  dress: "dress",
  kaftan: "long_shirt",
  full_length_gown: "long_dress",
  agbada: "agbada",
} as const satisfies Record<
  CanonicalPhysicalGarmentType,
  MonogramPreviewSilhouette
>;

/** Simple 64×64 icons. Each shape fills the box so it reads at icon size. */
const OUTLINES: Record<MonogramPreviewSilhouette, string> = {
  shirt:
    "M20 16C22 8 42 8 44 16L52 18L60 28L52 34L46 28V52H18V28L12 34L4 28L12 18Z",
  long_shirt:
    "M22 8C24 3 40 3 42 8L48 10L58 16L58 26L48 22V58H16V22L6 26L6 16L16 10Z",
  dress:
    "M26 8L24 2H30L32 10H36L38 2H44L42 10L50 20L46 32L56 58H8L18 32L14 20Z",
  long_dress:
    "M24 8C26 3 38 3 40 8L46 10L56 16L60 26L50 28L44 18V58H20V18L14 28L4 26L8 16L18 10Z",
  skirt: "M16 14H48V22L58 56H6L16 22Z",
  long_skirt: "M26 2H38V8L60 62H4L26 8Z",
  trouser:
    "M14 4H50V14C54 20 52 26 48 30L46 60H34L32 34L30 60H18L16 30C12 26 10 20 14 14Z",
  nikka_shorts: "M12 8H52V18L50 40H36L34 26L30 40H14L12 18Z",
  bum_shorts: "M4 16H60V26L54 40H40L36 30L32 40H10L4 26Z",
  agbada:
    "M24 6C26 2 38 2 40 6L46 8L60 18L64 32L48 26L50 60H14L16 26L0 32L4 18L18 8Z",
};

type DotPoint = { cx: number; cy: number };

/** Schematic map, 80×72. Wearer's left is the viewer's right. Not a garment body. */
const MAP_HEIGHT = 72;
const MAP_DOTS: Record<MonogramPlacement, DotPoint> = {
  neckline: { cx: 40, cy: 12 },
  left_chest: { cx: 62, cy: 30 },
  right_chest: { cx: 18, cy: 30 },
  upper_back: { cx: 40, cy: 30 },
  cuff: { cx: 8, cy: 48 },
  hem: { cx: 40, cy: 58 },
};

export const MONOGRAM_PREVIEW_FRAME_CLASS =
  "relative w-24 max-w-full shrink-0";

const PLACEMENT_ORDER = MONOGRAM_PLACEMENT_OPTIONS.map((option) => option.value);

export const monogramPreviewSilhouette = (
  garmentType: FabricGarmentType,
): MonogramPreviewSilhouette =>
  garmentType === "other"
    ? "shirt"
    : MONOGRAM_PREVIEW_SILHOUETTE_BY_GARMENT_TYPE[garmentType];

export const monogramPreviewOutline = (
  garmentType: FabricGarmentType,
): string => OUTLINES[monogramPreviewSilhouette(garmentType)];

export const monogramPlacementDot = (
  _garmentType: FabricGarmentType,
  placement: MonogramPlacement,
): DotPoint => MAP_DOTS[placement];

/**
 * The name is a caption under the dots, so it does not cover them.
 * `left` stays centered. `top` is unused by the layout and kept only so
 * callers can tell placements apart in tests.
 */
export const monogramPlacementNameAnchor = (
  garmentType: FabricGarmentType,
  placement: MonogramPlacement,
): { top: string; left: string } => {
  const point = monogramPlacementDot(garmentType, placement);
  return {
    top: `${point.cy}`,
    left: "50%",
  };
};

export const monogramPlacementMapForGarment = (
  garmentType: FabricGarmentType,
  placement: MonogramPlacement | undefined,
  placements?: readonly MonogramPlacement[],
): { active: MonogramPlacement; dots: MonogramPlacement[] } => {
  const cuffOffered = Boolean(placements?.includes("cuff"));
  const catalog = getMonogramPlacementsForGarmentType(garmentType, cuffOffered);
  const offered =
    placements && placements.length > 0
      ? catalog.filter((item) => placements.includes(item))
      : catalog;
  const dots = offered.length > 0 ? offered : catalog;
  const active =
    placement && dots.includes(placement)
      ? placement
      : getDefaultMonogramPlacementForGarmentType(garmentType);
  const visible = dots.includes(active) ? dots : [...dots, active];
  return {
    active,
    dots: PLACEMENT_ORDER.filter((item) => visible.includes(item)),
  };
};

export const MonogramNamePreview = ({
  garmentKey,
  garmentType,
  name,
  placement,
  placements,
}: {
  garmentKey: string;
  garmentType: FabricGarmentType;
  name: string;
  placement?: MonogramPlacement;
  placements?: readonly MonogramPlacement[];
}) => {
  const silhouette = monogramPreviewSilhouette(garmentType);
  const map = monogramPlacementMapForGarment(garmentType, placement, placements);
  const resolvedPlacement = map.active;
  const shown = name.trim();
  const empty = shown.length === 0;
  const lettering = empty ? "YOUR NAME" : shown;
  const back = resolvedPlacement === "upper_back";
  const anchor = monogramPlacementNameAnchor(garmentType, resolvedPlacement);
  const placementLabel = getMonogramPlacementLabel(resolvedPlacement) ?? "Hem";
  const garmentLabel = getStep1GarmentDisplayLabel(garmentType);

  return (
    <div
      data-monogram-name-preview={garmentKey}
      data-monogram-preview-kind="icon-placement-map"
      data-monogram-preview-garment={garmentType}
      data-monogram-preview-silhouette={silhouette}
      data-monogram-preview-placement={resolvedPlacement}
      data-monogram-preview-view={back ? "back" : "front"}
      data-monogram-preview-text={empty ? "" : shown}
      data-monogram-preview-placeholder={empty ? "true" : "false"}
      className={MONOGRAM_PREVIEW_FRAME_CLASS}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 64 64" className="h-10 w-10 shrink-0" aria-hidden="true">
          <path
            data-monogram-garment-icon="true"
            d={OUTLINES[silhouette]}
            fill="#F9F6F0"
            stroke="#0A291B"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
        </svg>
        <span
          data-monogram-garment-label={garmentType}
          className="mt-0.5 text-center text-[9px] font-bold leading-tight text-heritage-green"
        >
          {garmentLabel}
        </span>
      </div>
      <p
        data-monogram-placement-label={resolvedPlacement}
        className="mb-0.5 mt-1.5 text-center text-[9px] font-bold uppercase leading-none tracking-wide text-heritage-green"
      >
        {placementLabel}
      </p>
      <div data-monogram-placement-map="true" className="relative mx-auto h-12 w-12">
        <svg viewBox={`0 0 80 ${MAP_HEIGHT}`} className="h-full w-full" aria-hidden="true">
          {map.dots.map((dot) => {
            const active = dot === resolvedPlacement;
            const point = monogramPlacementDot(garmentType, dot);
            return (
              <circle
                key={dot}
                data-monogram-placement-dot={dot}
                data-monogram-placement-dot-state={active ? "active" : "available"}
                cx={point.cx}
                cy={point.cy}
                r={active ? 7 : 4.2}
                fill={active ? "#0A291B" : "none"}
                stroke="#0A291B"
                strokeWidth={active ? 0 : 1.8}
              />
            );
          })}
        </svg>
      </div>
      <span
        data-monogram-preview-lettering="true"
        data-monogram-preview-lettering-anchor={anchor.left}
        className={`mt-0.5 block truncate text-center font-display text-[9px] font-semibold uppercase leading-none tracking-[0.08em] ${
          empty ? "text-heritage-ink/40" : "text-heritage-green"
        }`}
      >
        {lettering}
      </span>
    </div>
  );
};
