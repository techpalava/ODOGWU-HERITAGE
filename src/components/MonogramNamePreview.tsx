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

/**
 * Placement map drawn on a vector outline of the Step 1 garment.
 * The outline is line art, not a product photo. Dots are only the
 * placements that garment can take.
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

const FRONT_MARK: Record<MonogramPreviewSilhouette, string> = {
  shirt: "M34 16l6 8 6-8",
  long_shirt: "M34 12h12M40 13v14",
  dress: "M40 12h4",
  long_dress: "M36 12q4 4 8 0",
  skirt: "M27 33h26",
  long_skirt: "M36 7h8",
  trouser: "M24 11h32M40 13v16",
  nikka_shorts: "M22 18h36M40 20v10",
  bum_shorts: "M16 27h48M40 29v6",
  agbada: "M37 9q3 3 6 0",
};

type DotPoint = { cx: number; cy: number };

/** Dots sit on that garment, not on a shared box. Wearer's left is the viewer's right. */
const DOTS: Record<
  MonogramPreviewSilhouette,
  Partial<Record<MonogramPlacement, DotPoint>>
> = {
  shirt: {
    neckline: { cx: 40, cy: 14 },
    left_chest: { cx: 48, cy: 34 },
    right_chest: { cx: 32, cy: 36 },
    upper_back: { cx: 40, cy: 42 },
    cuff: { cx: 16, cy: 34 },
    hem: { cx: 40, cy: 70 },
  },
  long_shirt: {
    neckline: { cx: 40, cy: 14 },
    left_chest: { cx: 48, cy: 36 },
    right_chest: { cx: 32, cy: 36 },
    upper_back: { cx: 40, cy: 44 },
    cuff: { cx: 18, cy: 26 },
    hem: { cx: 40, cy: 90 },
  },
  dress: {
    neckline: { cx: 42, cy: 14 },
    left_chest: { cx: 48, cy: 28 },
    right_chest: { cx: 34, cy: 28 },
    upper_back: { cx: 40, cy: 34 },
    cuff: { cx: 26, cy: 24 },
    hem: { cx: 40, cy: 58 },
  },
  long_dress: {
    neckline: { cx: 40, cy: 12 },
    left_chest: { cx: 46, cy: 28 },
    right_chest: { cx: 34, cy: 28 },
    upper_back: { cx: 40, cy: 36 },
    cuff: { cx: 20, cy: 26 },
    hem: { cx: 40, cy: 90 },
  },
  skirt: { hem: { cx: 40, cy: 68 } },
  long_skirt: { hem: { cx: 40, cy: 84 } },
  trouser: { hem: { cx: 50, cy: 90 } },
  nikka_shorts: { hem: { cx: 49, cy: 52 } },
  bum_shorts: { hem: { cx: 51, cy: 45 } },
  agbada: {
    neckline: { cx: 40, cy: 12 },
    left_chest: { cx: 46, cy: 30 },
    right_chest: { cx: 34, cy: 30 },
    upper_back: { cx: 40, cy: 42 },
    cuff: { cx: 16, cy: 34 },
    hem: { cx: 40, cy: 86 },
  },
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
  garmentType: FabricGarmentType,
  placement: MonogramPlacement,
): DotPoint => {
  const silhouette = monogramPreviewSilhouette(garmentType);
  return DOTS[silhouette][placement] ?? DOTS[silhouette].hem ?? { cx: 40, cy: 70 };
};

/** Name sits just off the active dot so it stays on the garment. */
export const monogramPlacementNameAnchor = (
  garmentType: FabricGarmentType,
  placement: MonogramPlacement,
): { top: string; left: string } => {
  const point = monogramPlacementDot(garmentType, placement);
  const left = `${Math.round((point.cx / 80) * 100)}%`;
  const shifted = placement === "hem" ? point.cy - 8 : point.cy + 14;
  const top = Math.min(88, Math.max(14, shifted));
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
  const label = getMonogramPlacementLabel(resolvedPlacement) ?? "Hem";

  return (
    <div
      data-monogram-name-preview={garmentKey}
      data-monogram-preview-kind="placement-map"
      data-monogram-preview-garment={garmentType}
      data-monogram-preview-silhouette={silhouette}
      data-monogram-preview-placement={resolvedPlacement}
      data-monogram-preview-view={back ? "back" : "front"}
      data-monogram-preview-text={empty ? "" : shown}
      data-monogram-preview-placeholder={empty ? "true" : "false"}
      className={MONOGRAM_PREVIEW_FRAME_CLASS}
      aria-hidden="true"
    >
      <p
        data-monogram-placement-label={resolvedPlacement}
        className="mb-1 text-center text-[9px] font-bold uppercase leading-none tracking-wide text-heritage-green"
      >
        {label}
      </p>
      <div className="relative aspect-[4/5] w-full">
        <svg viewBox="0 0 80 100" className="h-full w-full" aria-hidden="true">
          <path
            data-monogram-placement-zone="true"
            d={OUTLINES[silhouette]}
            fill="#F9F6F0"
            stroke="#0A291B"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d={FRONT_MARK[silhouette]}
            fill="none"
            stroke="#0A291B"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
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
                r={active ? 3.6 : 2.6}
                fill={active ? "#0A291B" : "#F9F6F0"}
                stroke="#0A291B"
                strokeWidth="1.3"
              />
            );
          })}
        </svg>
        <span
          data-monogram-preview-lettering="true"
          className={`pointer-events-none absolute max-w-[88%] truncate text-center font-display font-semibold uppercase leading-none tracking-[0.08em] ${
            empty ? "text-heritage-ink/40" : "text-heritage-green"
          }`}
          style={{
            top: anchor.top,
            left: anchor.left,
            transform: "translate(-50%, -50%)",
            fontSize: lettering.length > 8 ? "0.42rem" : "0.5rem",
          }}
        >
          {lettering}
        </span>
      </div>
    </div>
  );
};
