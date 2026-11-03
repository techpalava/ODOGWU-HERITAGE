import type { FabricGarmentType, MonogramPlacement } from "../types";
import {
  MONOGRAM_PLACEMENT_OPTIONS,
  getDefaultMonogramPlacementForGarmentType,
  getMonogramPlacementLabel,
  getMonogramPlacementsForGarmentType,
} from "../utils/decorativePricing";

/**
 * Compact placement map for the Name Monogram preview. A dashed zone and
 * dots show where the name can sit. It is not a garment drawing and does
 * not load product photos.
 */
export const MONOGRAM_PREVIEW_FRAME_CLASS =
  "relative w-24 max-w-full shrink-0";

export const MONOGRAM_PLACEMENT_MAP_DOTS: Record<
  MonogramPlacement,
  { cx: number; cy: number }
> = {
  neckline: { cx: 40, cy: 16 },
  left_chest: { cx: 54, cy: 32 },
  right_chest: { cx: 26, cy: 32 },
  upper_back: { cx: 40, cy: 46 },
  cuff: { cx: 18, cy: 52 },
  hem: { cx: 40, cy: 72 },
};

const NAME_ANCHOR: Record<MonogramPlacement, { top: string; left: string }> = {
  neckline: { top: "26%", left: "50%" },
  left_chest: { top: "44%", left: "66%" },
  right_chest: { top: "44%", left: "34%" },
  upper_back: { top: "58%", left: "50%" },
  cuff: { top: "64%", left: "30%" },
  hem: { top: "84%", left: "50%" },
};

const PLACEMENT_ORDER = MONOGRAM_PLACEMENT_OPTIONS.map((option) => option.value);

/**
 * Dots for this garment. Upper-body placements are dropped for trousers,
 * skirts, and shorts. An ineligible stored placement is not drawn.
 */
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
  const map = monogramPlacementMapForGarment(garmentType, placement, placements);
  const resolvedPlacement = map.active;
  const shown = name.trim();
  const empty = shown.length === 0;
  const lettering = empty ? "YOUR NAME" : shown;
  const back = resolvedPlacement === "upper_back";
  const anchor = NAME_ANCHOR[resolvedPlacement];
  const label = getMonogramPlacementLabel(resolvedPlacement) ?? "Hem";

  return (
    <div
      data-monogram-name-preview={garmentKey}
      data-monogram-preview-kind="placement-map"
      data-monogram-preview-garment={garmentType}
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
          <rect
            data-monogram-placement-zone="true"
            x="12"
            y="8"
            width="56"
            height="78"
            rx="10"
            fill="#F9F6F0"
            stroke="#0A291B"
            strokeWidth="1.3"
            strokeDasharray="3 2"
          />
          {map.dots.map((dot) => {
            const active = dot === resolvedPlacement;
            const point = MONOGRAM_PLACEMENT_MAP_DOTS[dot];
            return (
              <circle
                key={dot}
                data-monogram-placement-dot={dot}
                data-monogram-placement-dot-state={active ? "active" : "available"}
                cx={point.cx}
                cy={point.cy}
                r={active ? 4.2 : 3.1}
                fill={active ? "#0A291B" : "#F9F6F0"}
                stroke="#0A291B"
                strokeWidth="1.4"
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
