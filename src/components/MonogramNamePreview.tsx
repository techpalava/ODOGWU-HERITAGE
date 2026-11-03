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

const OUTLINES: Record<MonogramPreviewSilhouette, string> = {
  shirt:
    "M30 18C32 8 48 8 50 18L56 16L70 30L62 40L54 32V68C52 78 28 78 26 68V32L18 40L10 30L24 16Z",
  long_shirt:
    "M33 12C33 7 47 7 47 12L51 14L64 20L66 30L54 28V96H26V28L14 30L16 20L29 14Z",
  dress:
    "M36 12L34 3H38L40 12H44L46 3H50L48 12L53 20L55 32L51 44L58 54L62 64H18L22 54L29 44L25 32L27 20Z",
  long_dress:
    "M35 11C35 6 45 6 45 11L48 13L58 20L62 29L52 32C50 38 48 46 47 52C46 68 47 82 47 97H33C33 82 34 68 33 52C32 46 30 38 28 32L18 29L22 20L32 13Z",
  skirt:
    "M26 30H54V36C60 50 66 62 62 70C50 76 30 76 18 70C14 62 20 50 26 36Z",
  long_skirt:
    "M35 4H45V9C54 28 70 58 76 88C60 98 20 98 4 88C10 58 26 28 35 9Z",
  trouser:
    "M22 5H58V13C62 22 60 32 58 38L56 98H44L40 46L36 98H24L22 38C20 32 18 22 22 13Z",
  nikka_shorts:
    "M22 12H58V18L56 38L54 58H44L40 40L36 58H26L24 38L22 18Z",
  bum_shorts:
    "M14 22H66V29C68 34 64 38 58 42L56 49H46L42 40H38L34 49H24L22 42C16 38 12 34 14 29Z",
  agbada:
    "M36 8C36 4 44 4 44 8L48 10L66 24L76 42L62 38L50 16L54 94H26L30 16L18 38L4 42L14 24L32 10Z",
};

type DotPoint = { cx: number; cy: number };

/** Schematic map, 80×64. Wearer's left is the viewer's right. Not a garment body. */
const MAP_HEIGHT = 64;
const MAP_DOTS: Record<MonogramPlacement, DotPoint> = {
  neckline: { cx: 40, cy: 10 },
  left_chest: { cx: 56, cy: 22 },
  right_chest: { cx: 24, cy: 22 },
  upper_back: { cx: 40, cy: 32 },
  cuff: { cx: 12, cy: 26 },
  hem: { cx: 40, cy: 52 },
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

/** Name sits just off the active dot inside the placement map. */
export const monogramPlacementNameAnchor = (
  garmentType: FabricGarmentType,
  placement: MonogramPlacement,
): { top: string; left: string } => {
  const point = monogramPlacementDot(garmentType, placement);
  const left = `${Math.round((point.cx / 80) * 100)}%`;
  const shifted = placement === "hem" ? point.cy - 10 : point.cy + 12;
  const top = Math.min(92, Math.max(8, (shifted / MAP_HEIGHT) * 100));
  return { top: `${Math.round(top)}%`, left };
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
      <div className="flex items-center gap-1">
        <svg
          viewBox="0 0 80 100"
          className="h-9 w-7 shrink-0"
          aria-hidden="true"
        >
          <path
            data-monogram-garment-icon="true"
            d={OUTLINES[silhouette]}
            fill="#F9F6F0"
            stroke="#0A291B"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
        <span
          data-monogram-garment-label={garmentType}
          className="min-w-0 text-[9px] font-bold leading-tight text-heritage-green"
        >
          {garmentLabel}
        </span>
      </div>
      <p
        data-monogram-placement-label={resolvedPlacement}
        className="mb-0.5 mt-1 text-center text-[9px] font-bold uppercase leading-none tracking-wide text-heritage-green"
      >
        {placementLabel}
      </p>
      <div
        data-monogram-placement-map="true"
        className="relative h-14 w-full"
      >
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
                r={active ? 4.2 : 3}
                fill={active ? "#0A291B" : "none"}
                stroke="#0A291B"
                strokeWidth="1.4"
              />
            );
          })}
        </svg>
        <span
          data-monogram-preview-lettering="true"
          className={`pointer-events-none absolute max-w-[92%] truncate text-center font-display font-semibold uppercase leading-none tracking-[0.08em] ${
            empty ? "text-heritage-ink/40" : "text-heritage-green"
          }`}
          style={{
            top: anchor.top,
            left: anchor.left,
            transform: "translate(-50%, -50%)",
            fontSize: lettering.length > 8 ? "0.4rem" : "0.48rem",
          }}
        >
          {lettering}
        </span>
      </div>
    </div>
  );
};
