import type {
  CanonicalPhysicalGarmentType,
  FabricGarmentType,
  MonogramPlacement,
} from "../types";
import { DEFAULT_MONOGRAM_PLACEMENT } from "../utils/decorativePricing";

/**
 * Vector outlines for the Name Monogram preview. Each path follows the
 * proportions of that Step 1 garment (sleeve, hem, waist, flare, and leg
 * opening). The preview stays line art: it does not load the reference photos.
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
  "M30 18C32 8 48 8 50 18L56 16L70 30L62 40L54 32V68C52 78 28 78 26 68V32L18 40L10 30L24 16Z";

const OUTLINES: Record<MonogramPreviewSilhouette, string> = {
  shirt: SHIRT_PATH,
  // Straight long tunic. No waist. Short sleeves sit out from the shoulder.
  long_shirt:
    "M33 12C33 7 47 7 47 12L51 14L64 20L66 30L54 28V96H26V28L14 30L16 20L29 14Z",
  // Straps, a gentle waist, and a short peplum. The waist stays wide enough to read as a bodice.
  dress:
    "M36 12L34 3H38L40 12H44L46 3H50L48 12L53 20L55 32L51 44L58 54L62 64H18L22 54L29 44L25 32L27 20Z",
  // Short sleeves, round neck, lightly fitted waist, straight floor-length skirt.
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

const BACK_MARK: Record<MonogramPreviewSilhouette, string> = {
  shirt: "M40 18v52",
  long_shirt: "M40 16v76",
  dress: "M40 16v48",
  long_dress: "M40 14v78",
  skirt: "M40 36v30",
  long_skirt: "M40 12v78",
  trouser: "M40 14v28",
  nikka_shorts: "M40 22v18",
  bum_shorts: "M40 32v10",
  agbada: "M40 10v80",
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
  long_shirt: { x: 41.4, y: 34, width: 10, height: 16 },
  long_dress: { x: 41.2, y: 26, width: 6.5, height: 14 },
  skirt: { x: 42, y: 42, width: 12, height: 12 },
  long_skirt: { x: 42, y: 28, width: 10, height: 16 },
  trouser: { x: 44, y: 18, width: 10, height: 14 },
  nikka_shorts: { x: 44, y: 24, width: 10, height: 12 },
  bum_shorts: { x: 46, y: 30, width: 12, height: 8 },
  agbada: { x: 42, y: 26, width: 8, height: 16 },
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
    left_chest: at("46%", "60%"),
    right_chest: at("46%", "40%"),
    neckline: at("12%", "50%"),
    upper_back: at("40%", "50%"),
    cuff: at("28%", "22%"),
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
    left_chest: at("36%", "58%"),
    right_chest: at("36%", "42%"),
    neckline: at("12%", "50%"),
    upper_back: at("34%", "50%"),
    cuff: at("26%", "28%", -12),
    hem: at("90%", "50%"),
  },
  skirt: {
    left_chest: at("52%", "64%"),
    right_chest: at("52%", "36%"),
    neckline: at("32%", "50%"),
    upper_back: at("50%", "50%"),
    cuff: at("58%", "28%"),
    hem: at("66%", "50%"),
  },
  long_skirt: {
    left_chest: at("36%", "62%"),
    right_chest: at("36%", "38%"),
    neckline: at("8%", "50%"),
    upper_back: at("40%", "50%"),
    cuff: at("60%", "18%"),
    hem: at("88%", "50%"),
  },
  trouser: {
    left_chest: at("28%", "62%"),
    right_chest: at("28%", "38%"),
    neckline: at("10%", "50%"),
    upper_back: at("28%", "50%"),
    cuff: at("90%", "36%"),
    hem: at("92%", "50%"),
  },
  nikka_shorts: {
    left_chest: at("36%", "66%"),
    right_chest: at("36%", "34%"),
    neckline: at("20%", "50%"),
    upper_back: at("34%", "50%"),
    cuff: at("56%", "36%"),
    hem: at("54%", "50%"),
  },
  bum_shorts: {
    left_chest: at("40%", "68%"),
    right_chest: at("40%", "32%"),
    neckline: at("30%", "50%"),
    upper_back: at("40%", "50%"),
    cuff: at("48%", "34%"),
    hem: at("50%", "50%"),
  },
  agbada: {
    left_chest: at("36%", "60%"),
    right_chest: at("36%", "40%"),
    neckline: at("8%", "50%"),
    upper_back: at("36%", "50%"),
    cuff: at("36%", "12%", -20),
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
