import type {
  CanonicalPhysicalGarmentType,
  FabricGarmentType,
  MonogramPlacement,
} from "../types";
import { DEFAULT_MONOGRAM_PLACEMENT } from "../utils/decorativePricing";

/**
 * Line art for the Name Monogram preview. Keys are the Step 1 garment ids
 * (`STEP1_GARMENT_REFERENCE_IMAGES` / `CanonicalPhysicalGarmentType`).
 * Sleeve length follows each card's primary photo: Long Shirt and Long Dress
 * use the short-sleeve reference. The paired long-sleeve photo is the other
 * sleeve of the same garment, not a different silhouette.
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

const SHIRT_PATH =
  "M28 18c0-7 24-7 24 0l6 3 16 12-8 12-8-6v47H22V39l-8 6-8-12 16-12 6-3z";

const OUTLINES: Record<MonogramPreviewSilhouette, string> = {
  shirt: SHIRT_PATH,
  long_shirt:
    "M32 15c0-5 16-5 16 0l4 2 10 8-5 8-7-4v67H30V29l-7 4-5-8 10-8 4-2z",
  dress:
    "M33 14L31 6H35L37 14H43L45 6H49L47 14C52 22 54 32 52 40C56 50 62 60 66 68H14C18 60 24 50 28 40C26 32 28 22 33 14Z",
  long_dress:
    "M34 13c0-5 12-5 12 0l4 2 10 8-5 8-6-4c-1 14-2 30-1 69H32c1-39 0-55-1-69l-6 4-5-8 10-8 4-2z",
  skirt: "M30 26H50V30L64 68H16L30 30Z",
  long_skirt: "M33 8H47V12L72 96H8L33 12Z",
  trouser:
    "M26 12H54V18C58 28 56 40 54 48L52 96H42L40 54L38 96H28L26 48C24 40 22 28 26 18Z",
  nikka_shorts:
    "M24 18H56V24C59 34 57 44 54 52L52 74H42L40 50L38 74H28L26 52C23 44 21 34 24 24Z",
  bum_shorts:
    "M20 26H60V32C62 38 58 44 54 48L50 56H42L40 46L38 56H30L26 48C22 44 18 38 20 32Z",
  agbada:
    "M34 12C34 7 46 7 46 12L52 14L74 40L64 52L50 28L54 96H26L30 28L16 52L6 40L28 14Z",
};

const FRONT_MARK: Record<MonogramPreviewSilhouette, string> = {
  shirt: "M34 16l6 8 6-8",
  long_shirt: "M33 16h14M40 17v10",
  dress: "M37 14h6",
  long_dress: "M34 14q6 5 12 0",
  skirt: "M31 28h18",
  long_skirt: "M34 11h12",
  trouser: "M27 16h26M40 18v14",
  nikka_shorts: "M25 22h30M40 24v10",
  bum_shorts: "M22 30h36M40 32v8",
  agbada: "M35 13q5 4 10 0",
};

const BACK_MARK: Record<MonogramPreviewSilhouette, string> = {
  shirt: "M40 18v64",
  long_shirt: "M40 17v75",
  dress: "M40 16v48",
  long_dress: "M40 15v76",
  skirt: "M40 30v34",
  long_skirt: "M40 14v76",
  trouser: "M40 18v32",
  nikka_shorts: "M40 24v22",
  bum_shorts: "M40 32v12",
  agbada: "M40 15v76",
};

/**
 * Compact portrait frame. Same width as the Summary design preview (`w-24`),
 * so the drawing sits beside the name field instead of spanning the card.
 */
export const MONOGRAM_PREVIEW_FRAME_CLASS =
  "relative aspect-[4/5] w-24 max-w-full shrink-0";

/** Preferred cap height in viewBox units. Short names use at least this size. */
export const MONOGRAM_PREVIEW_MIN_FONT = 3.3;
export const MONOGRAM_PREVIEW_VIEWBOX_WIDTH = 80;
/** Keep lettering this far inside the sleeve seam, as a fraction of the shirt width. */
export const MONOGRAM_PREVIEW_SEAM_MARGIN_RATIO = 0.06;
export const MONOGRAM_PREVIEW_SLEEVE_SEAM_X = { shirt: 58, dress: 54 } as const;

const MARK_BOX: Record<
  Exclude<MonogramPreviewSilhouette, "shirt" | "dress">,
  { x: number; y: number; width: number; height: number }
> = {
  long_shirt: { x: 41.2, y: 32, width: 7.2, height: 16 },
  long_dress: { x: 41.2, y: 30, width: 6.2, height: 14 },
  skirt: { x: 42, y: 40, width: 10, height: 12 },
  long_skirt: { x: 42, y: 36, width: 10, height: 16 },
  trouser: { x: 42, y: 22, width: 10, height: 16 },
  nikka_shorts: { x: 42.5, y: 28, width: 11, height: 14 },
  bum_shorts: { x: 43, y: 34, width: 12, height: 10 },
  agbada: { x: 41.5, y: 30, width: 10, height: 16 },
};
/** Placket / collar-V tip. Wearer's left is the viewer's right of this line. */
export const MONOGRAM_PREVIEW_CENTER_X = 40;
/** Small gap so a full line stays off the placket and on the left chest. */
const PLAQUET_GAP = 0.8;

export const monogramPreviewOutline = (
  silhouette: MonogramPreviewSilhouette,
): string => OUTLINES[silhouette];

/**
 * Wearer's left is the viewer's right side of the garment.
 * Shirt and dress boxes start just right of the placket and stop one
 * seam-margin short of the sleeve. Other garments use a box on that shape.
 * Coordinates are in the 80×100 viewBox.
 */
export const monogramPreviewChestBox = (
  silhouette: MonogramPreviewSilhouette,
): { x: number; y: number; width: number; height: number } => {
  if (silhouette === "shirt" || silhouette === "dress") {
    const x = MONOGRAM_PREVIEW_CENTER_X + PLAQUET_GAP;
    const right =
      MONOGRAM_PREVIEW_SLEEVE_SEAM_X[silhouette] -
      MONOGRAM_PREVIEW_VIEWBOX_WIDTH * MONOGRAM_PREVIEW_SEAM_MARGIN_RATIO;
    return silhouette === "dress"
      ? { x, y: 21, width: right - x, height: 15 }
      : { x, y: 25, width: right - x, height: 20 };
  }
  return MARK_BOX[silhouette];
};

export const monogramPreviewSilhouette = (
  garmentType: FabricGarmentType,
): MonogramPreviewSilhouette =>
  garmentType === "other"
    ? "shirt"
    : MONOGRAM_PREVIEW_SILHOUETTE_BY_GARMENT_TYPE[garmentType];

type LetteringPosition = { top: string; left: string; rotate: number };

const at = (top: string, left: string, rotate = 0): LetteringPosition => ({
  top,
  left,
  rotate,
});

/**
 * HTML overlay positions for placements other than Left Chest. Left Chest is
 * drawn inside the silhouette as SVG text, on the wearer's left (viewer's
 * right). Upper Back uses the same outline from behind. Coordinates sit on
 * that garment, not on a shared shirt or dress.
 */
const LETTERING: Record<
  MonogramPreviewSilhouette,
  Record<MonogramPlacement, LetteringPosition>
> = {
  shirt: {
    left_chest: at("46%", "64%"),
    right_chest: at("46%", "36%"),
    neckline: at("18%", "50%"),
    upper_back: at("34%", "50%"),
    cuff: at("36%", "14%", -28),
    hem: at("74%", "50%"),
  },
  long_shirt: {
    left_chest: at("42%", "62%"),
    right_chest: at("42%", "38%"),
    neckline: at("16%", "50%"),
    upper_back: at("36%", "50%"),
    cuff: at("30%", "28%", -18),
    hem: at("90%", "50%"),
  },
  dress: {
    left_chest: at("46%", "64%"),
    right_chest: at("46%", "36%"),
    neckline: at("16%", "50%"),
    upper_back: at("34%", "50%"),
    cuff: at("32%", "28%", -12),
    hem: at("62%", "50%"),
  },
  long_dress: {
    left_chest: at("38%", "60%"),
    right_chest: at("38%", "40%"),
    neckline: at("14%", "50%"),
    upper_back: at("34%", "50%"),
    cuff: at("28%", "30%", -16),
    hem: at("90%", "50%"),
  },
  skirt: {
    left_chest: at("50%", "62%"),
    right_chest: at("50%", "38%"),
    neckline: at("28%", "50%"),
    upper_back: at("46%", "50%"),
    cuff: at("52%", "30%"),
    hem: at("62%", "50%"),
  },
  long_skirt: {
    left_chest: at("40%", "62%"),
    right_chest: at("40%", "38%"),
    neckline: at("12%", "50%"),
    upper_back: at("42%", "50%"),
    cuff: at("54%", "24%"),
    hem: at("90%", "50%"),
  },
  trouser: {
    left_chest: at("32%", "64%"),
    right_chest: at("32%", "36%"),
    neckline: at("16%", "50%"),
    upper_back: at("30%", "50%"),
    cuff: at("88%", "34%"),
    hem: at("92%", "50%"),
  },
  nikka_shorts: {
    left_chest: at("38%", "64%"),
    right_chest: at("38%", "36%"),
    neckline: at("22%", "50%"),
    upper_back: at("36%", "50%"),
    cuff: at("66%", "34%"),
    hem: at("68%", "50%"),
  },
  bum_shorts: {
    left_chest: at("42%", "66%"),
    right_chest: at("42%", "34%"),
    neckline: at("30%", "50%"),
    upper_back: at("40%", "50%"),
    cuff: at("50%", "32%"),
    hem: at("52%", "50%"),
  },
  agbada: {
    left_chest: at("38%", "62%"),
    right_chest: at("38%", "38%"),
    neckline: at("14%", "50%"),
    upper_back: at("36%", "50%"),
    cuff: at("42%", "14%", -24),
    hem: at("90%", "50%"),
  },
};

export const monogramPreviewLetteringPosition = (
  placement: MonogramPlacement,
  silhouette: MonogramPreviewSilhouette,
): LetteringPosition => LETTERING[silhouette][placement];

const WIDE_LETTER = /[MW]/;
/** Cinzel wide capitals. Other capitals are narrower, so a mixed name can be larger. */
const WIDE_ADVANCE = 1.08;
const TYPICAL_ADVANCE = 0.8;
const MAX_FONT = 8;

/** Average em width used to size a line so it fills the chest without passing the seam. */
export const monogramPreviewLineAdvance = (line: string): number => {
  const chars = Array.from(line);
  if (chars.length === 0) return TYPICAL_ADVANCE;
  const wide = chars.filter((char) => WIDE_LETTER.test(char)).length;
  return (wide * WIDE_ADVANCE + (chars.length - wide) * TYPICAL_ADVANCE) / chars.length;
};

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
  const usable = Math.max(box.width - 0.35, 4);
  const fontFor = (line: string, lineCount: number) => {
    const count = Math.max(Array.from(line).length, 1);
    const byWidth = usable / (count * monogramPreviewLineAdvance(line));
    const byHeight = (box.height * 0.9) / (lineCount * 1.12);
    return Math.min(byWidth, byHeight, MAX_FONT);
  };
  const chunks = monogramPreviewLines(text);
  if (chunks.length === 1) {
    return { lines: chunks, fontSize: fontFor(chunks[0], 1) };
  }
  const singleLine = fontFor(text, 1);
  if (singleLine >= MONOGRAM_PREVIEW_MIN_FONT) {
    return { lines: [text], fontSize: singleLine };
  }
  const longest = chunks.reduce((best, line) =>
    Array.from(line).length > Array.from(best).length ? line : best,
  );
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
  const outline = monogramPreviewOutline(silhouette);
  const mark = back ? BACK_MARK[silhouette] : FRONT_MARK[silhouette];

  return (
    <div
      data-monogram-name-preview={garmentKey}
      data-monogram-preview-placement={resolvedPlacement}
      data-monogram-preview-silhouette={silhouette}
      data-monogram-preview-view={back ? "back" : "front"}
      data-monogram-preview-text={empty ? "" : shown}
      data-monogram-preview-placeholder={empty ? "true" : "false"}
      className={MONOGRAM_PREVIEW_FRAME_CLASS}
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
        <path
          d={mark}
          fill="none"
          stroke="#0A291B"
          strokeWidth={back ? 1 : 1.3}
          strokeLinejoin="round"
          strokeDasharray={back ? "2 2" : undefined}
        />
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
