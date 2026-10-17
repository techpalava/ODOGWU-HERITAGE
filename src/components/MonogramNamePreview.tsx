import type { FabricGarmentType, MonogramPlacement } from "../types";
import { DEFAULT_MONOGRAM_PLACEMENT } from "../utils/decorativePricing";

const DRESS_SILHOUETTE_TYPES = new Set<FabricGarmentType>([
  "dress",
  "full_length_gown",
  "skirt",
  "long_skirt",
]);

const SHIRT_PATH =
  "M28 18c0-7 24-7 24 0l6 3 16 12-8 12-8-6v47H22V39l-8 6-8-12 16-12 6-3z";
const DRESS_PATH =
  "M31 15c0-6 18-6 18 0l5 2 13 9-6 10-7-5-1 14c2 14 16 32 18 42H9c2-10 16-28 18-42l-1-14-7 5-6-10 13-9 5-2z";

export const MONOGRAM_PREVIEW_MIN_FONT = 2.15;

/**
 * Wearer's left chest is the viewer's right side of the torso, below the collar.
 * Coordinates are in the 80×100 silhouette viewBox.
 */
export const monogramPreviewChestBox = (
  silhouette: "shirt" | "dress",
): { x: number; y: number; width: number; height: number } =>
  silhouette === "dress"
    ? { x: 40.5, y: 22, width: 10, height: 10 }
    : { x: 40.5, y: 30, width: 14.5, height: 12 };

export const monogramPreviewSilhouette = (
  garmentType: FabricGarmentType,
): "shirt" | "dress" =>
  DRESS_SILHOUETTE_TYPES.has(garmentType) ? "dress" : "shirt";

/**
 * Front-view coordinates for placements other than Left Chest. Left Chest is
 * drawn inside the silhouette as SVG text. Left Chest is the wearer's left,
 * so it sits on the right side of the drawing. Upper Back uses the same
 * outline from behind.
 */
export const monogramPreviewLetteringPosition = (
  placement: MonogramPlacement,
  silhouette: "shirt" | "dress",
): { top: string; left: string; rotate: number } => {
  switch (placement) {
    case "right_chest":
      return { top: "46%", left: "36%", rotate: 0 };
    case "neckline":
      return { top: silhouette === "dress" ? "16%" : "18%", left: "50%", rotate: 0 };
    case "upper_back":
      return { top: "34%", left: "50%", rotate: 0 };
    case "cuff":
      return { top: "36%", left: "14%", rotate: -28 };
    case "hem":
      return { top: silhouette === "dress" ? "80%" : "74%", left: "50%", rotate: 0 };
    case "left_chest":
    default:
      return { top: "46%", left: "64%", rotate: 0 };
  }
};

/**
 * Shrink long names into the chest box. Short names keep a natural size.
 * textLength forces any remaining overflow to the usable chest width.
 */
export const monogramPreviewLetteringFit = (
  text: string,
  box: { width: number; height: number },
): { fontSize: number; textLength?: number } => {
  const count = Math.max(Array.from(text).length, 1);
  const maxFont = Math.min(4.7, Math.max(box.height - 1.6, MONOGRAM_PREVIEW_MIN_FONT));
  const fontSize = Math.max(
    MONOGRAM_PREVIEW_MIN_FONT,
    Math.min(maxFont, 22 / count),
  );
  const usable = Math.max(box.width - 1.4, 4);
  const estimated = count * fontSize * 0.95;
  if (estimated > usable) {
    return { fontSize, textLength: usable };
  }
  return { fontSize };
};

const clipIdFor = (garmentKey: string) =>
  `monogram-chest-${garmentKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;

export const MonogramNamePreview = ({
  garmentKey,
  garmentType,
  name,
  placement,
}: {
  garmentKey: string;
  garmentType: FabricGarmentType;
  name: string;
  placement?: MonogramPlacement;
}) => {
  const resolvedPlacement = placement ?? DEFAULT_MONOGRAM_PLACEMENT;
  const silhouette = monogramPreviewSilhouette(garmentType);
  const position = monogramPreviewLetteringPosition(resolvedPlacement, silhouette);
  const shown = name.trim();
  const empty = shown.length === 0;
  const lettering = empty ? "YOUR NAME" : shown;
  const back = resolvedPlacement === "upper_back";
  const leftChest = resolvedPlacement === "left_chest";
  const chest = monogramPreviewChestBox(silhouette);
  const fit = monogramPreviewLetteringFit(lettering, chest);
  const bodyClipId = `${clipIdFor(garmentKey)}-body`;
  const chestClipId = `${clipIdFor(garmentKey)}-chest`;
  const outline = silhouette === "dress" ? DRESS_PATH : SHIRT_PATH;

  return (
    <div
      data-monogram-name-preview={garmentKey}
      data-monogram-preview-placement={resolvedPlacement}
      data-monogram-preview-silhouette={silhouette}
      data-monogram-preview-view={back ? "back" : "front"}
      data-monogram-preview-text={empty ? "" : shown}
      data-monogram-preview-placeholder={empty ? "true" : "false"}
      className="relative h-[4.75rem] w-[3.75rem] shrink-0 sm:h-24 sm:w-20"
      aria-hidden="true"
    >
      <svg viewBox="0 0 80 100" className="h-full w-full" aria-hidden="true" overflow="hidden">
        <defs>
          <clipPath id={bodyClipId}>
            <path d={outline} />
          </clipPath>
          <clipPath id={chestClipId}>
            <rect x={chest.x} y={chest.y} width={chest.width} height={chest.height} />
          </clipPath>
        </defs>
        <path
          d={outline}
          fill="#F9F6F0"
          stroke="#0A291B"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {back ? (
          <path
            d={silhouette === "dress" ? "M40 16v72" : "M40 18v64"}
            fill="none"
            stroke="#0A291B"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        ) : (
          <path
            d={silhouette === "dress" ? "M35 14l5 6 5-6" : "M34 16l6 8 6-8"}
            fill="none"
            stroke="#0A291B"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        )}
        {leftChest ? (
          <g clipPath={`url(#${bodyClipId})`}>
            <text
              data-monogram-preview-lettering="true"
              x={chest.x + chest.width / 2}
              y={chest.y + chest.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily='"Cinzel", "Playfair Display", Georgia, serif'
              fontWeight={600}
              fontSize={fit.fontSize}
              fill={empty ? "rgba(197,168,92,0.4)" : "#C5A85C"}
              stroke={empty ? "none" : "#0A291B"}
              strokeWidth={empty ? 0 : 0.16}
              paintOrder="stroke"
              clipPath={`url(#${chestClipId})`}
              lengthAdjust={fit.textLength ? "spacingAndGlyphs" : undefined}
              textLength={fit.textLength}
            >
              {lettering}
            </text>
          </g>
        ) : null}
      </svg>
      {leftChest ? null : (
        <span
          data-monogram-preview-lettering="true"
          className={`pointer-events-none absolute max-w-[78%] truncate text-center font-display font-semibold uppercase leading-none tracking-[0.12em] ${
            empty ? "text-heritage-gold/40" : "text-heritage-gold"
          }`}
          style={{
            top: position.top,
            left: position.left,
            transform: `translate(-50%, -50%) rotate(${position.rotate}deg)`,
            fontSize: lettering.length > 8 ? "0.42rem" : "0.52rem",
            WebkitTextStroke: empty ? "0px transparent" : "0.35px #0A291B",
          }}
        >
          {lettering}
        </span>
      )}
      {back ? (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 font-sans text-[8px] font-bold uppercase tracking-wider text-heritage-green">
          Back
        </span>
      ) : null}
    </div>
  );
};
