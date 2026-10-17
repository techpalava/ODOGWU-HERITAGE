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

/** Preferred cap height in viewBox units. Short names use at least this size. */
export const MONOGRAM_PREVIEW_MIN_FONT = 3.3;
export const MONOGRAM_PREVIEW_VIEWBOX_WIDTH = 80;
/** Keep lettering this far inside the sleeve seam, as a fraction of the shirt width. */
export const MONOGRAM_PREVIEW_SEAM_MARGIN_RATIO = 0.06;
export const MONOGRAM_PREVIEW_SLEEVE_SEAM_X = { shirt: 58, dress: 54 } as const;

/**
 * Wearer's left chest is the viewer's right side of the torso, below the collar.
 * The box starts just right of the center line and stops short of the sleeve seam.
 * Coordinates are in the 80×100 silhouette viewBox.
 */
export const monogramPreviewChestBox = (
  silhouette: "shirt" | "dress",
): { x: number; y: number; width: number; height: number } => {
  const x = 41.1;
  const right =
    MONOGRAM_PREVIEW_SLEEVE_SEAM_X[silhouette] -
    MONOGRAM_PREVIEW_VIEWBOX_WIDTH * MONOGRAM_PREVIEW_SEAM_MARGIN_RATIO;
  return silhouette === "dress"
    ? { x, y: 22, width: right - x, height: 14 }
    : { x, y: 27, width: right - x, height: 20 };
};

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

const LETTER_ADVANCE = 1;
const MAX_FONT = 8;

/**
 * Break only at a space or a hyphen. The hyphen stays on the first piece.
 * A word with neither break is never split.
 */
export const monogramPreviewLines = (text: string): string[] => {
  const chunks = text.match(/[^\s-]+-|[^\s-]+/g);
  return chunks && chunks.length > 0 ? chunks : [text];
};

/**
 * Size the left-chest lettering so it stays inside the chest box.
 * One word stays on one line and shrinks to the chest width.
 * Several words wrap only when one line would fall below the preferred size.
 */
export const monogramPreviewLetteringFit = (
  text: string,
  box: { width: number; height: number },
): { lines: string[]; fontSize: number } => {
  const usable = Math.max(box.width - 0.6, 4);
  const fontFor = (charCount: number, lineCount: number) => {
    const byWidth = usable / (Math.max(charCount, 1) * LETTER_ADVANCE);
    const byHeight = (box.height * 0.88) / (lineCount * 1.15);
    return Math.min(byWidth, byHeight, MAX_FONT);
  };
  const chunks = monogramPreviewLines(text);
  if (chunks.length === 1) {
    return { lines: chunks, fontSize: fontFor(Array.from(chunks[0]).length, 1) };
  }
  const singleLine = fontFor(Math.max(Array.from(text).length, 1), 1);
  if (singleLine >= MONOGRAM_PREVIEW_MIN_FONT) {
    return { lines: [text], fontSize: singleLine };
  }
  const longest = Math.max(...chunks.map((line) => Array.from(line).length), 1);
  return { lines: chunks, fontSize: fontFor(longest, chunks.length) };
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
  const chestCenterX = chest.x + chest.width / 2;
  const lineStep = fit.fontSize * 1.15;
  const firstLineY =
    chest.y + chest.height / 2 - ((fit.lines.length - 1) * lineStep) / 2;
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
      className="relative aspect-[4/5] w-80 max-w-full shrink-0 sm:w-96"
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
              x={chestCenterX}
              y={firstLineY}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily='"Cinzel", "Playfair Display", Georgia, serif'
              fontWeight={700}
              fontSize={fit.fontSize}
              fill={empty ? "rgba(10,41,27,0.38)" : "#0A291B"}
              clipPath={`url(#${chestClipId})`}
            >
              {fit.lines.map((line, index) => (
                <tspan key={`${index}-${line}`} x={chestCenterX} y={firstLineY + index * lineStep}>
                  {line}
                </tspan>
              ))}
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
