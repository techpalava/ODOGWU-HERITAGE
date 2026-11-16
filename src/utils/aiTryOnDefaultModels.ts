/**
 * Default try-on models: ten fictional studio personas a customer can pick
 * instead of uploading a photo ("No photo? Try it on a model").
 *
 * Each persona has two static base photos in public/ai-try-on-models/:
 * `long` (full-length trousers) and `short` (neutral bum shorts for women,
 * short knickers for men, bare lower legs). They use no Firebase Storage:
 * the browser shows them from the site, and the server reads the same files
 * from disk (vercel.json `includeFiles`) to send to Gemini, so a request
 * only ever carries the model id.
 */

export type AiTryOnModelGroup = "men" | "women";
export type AiTryOnModelSkinTone = "light" | "medium" | "deep";
export type AiTryOnModelBuild = "regular" | "medium" | "plus";
/** Which base photo this catalogue row uses. */
export type AiTryOnModelLengthCategory = "short" | "long";

export interface AiTryOnDefaultModel {
  readonly id: string;
  readonly group: AiTryOnModelGroup;
  readonly skinTone: AiTryOnModelSkinTone;
  readonly build: AiTryOnModelBuild;
  /** Short customer-facing description (wording approved by Xavier). */
  readonly label: string;
  readonly lengthCategory: AiTryOnModelLengthCategory;
  /** Shared identity for the long and short base photos of one persona. */
  readonly personaId: string;
}

export const AI_TRY_ON_MODEL_GROUP_LABELS: Readonly<Record<AiTryOnModelGroup, string>> = {
  men: "Men",
  women: "Women",
};

const SKIN_TONE_LABELS: Readonly<Record<AiTryOnModelSkinTone, string>> = {
  light: "Light skin tone",
  medium: "Medium skin tone",
  deep: "Deep skin tone",
};
const BUILD_LABELS: Readonly<Record<AiTryOnModelBuild, string>> = {
  regular: "regular build",
  medium: "medium build",
  plus: "plus-size",
};

const model = (
  personaId: string,
  group: AiTryOnModelGroup,
  skinTone: AiTryOnModelSkinTone,
  build: AiTryOnModelBuild,
  lengthCategory: AiTryOnModelLengthCategory,
): AiTryOnDefaultModel => ({
  id: lengthCategory === "short" ? `${personaId}-short` : personaId,
  group,
  skinTone,
  build,
  lengthCategory,
  personaId,
  label: `${SKIN_TONE_LABELS[skinTone]}, ${BUILD_LABELS[build]}`,
});

const PERSONAS: readonly (readonly [string, AiTryOnModelGroup, AiTryOnModelSkinTone, AiTryOnModelBuild])[] = [
  ["male-1-light", "men", "light", "regular"],
  ["male-2-medium", "men", "medium", "regular"],
  ["male-3-deep", "men", "deep", "regular"],
  ["male-medium-build", "men", "medium", "medium"],
  ["male-plus", "men", "medium", "plus"],
  ["female-1-light", "women", "light", "regular"],
  ["female-2-medium", "women", "medium", "regular"],
  ["female-3-deep", "women", "deep", "regular"],
  ["female-medium-build", "women", "medium", "medium"],
  ["female-plus", "women", "medium", "plus"],
];

/**
 * Display order: the original long (trouser) bases first, in the approved
 * persona order, then the matching short bases. Skin tones first, then
 * builds, men before women.
 */
export const AI_TRY_ON_DEFAULT_MODELS: readonly AiTryOnDefaultModel[] = [
  ...PERSONAS.map(([personaId, group, skinTone, build]) => model(personaId, group, skinTone, build, "long")),
  ...PERSONAS.map(([personaId, group, skinTone, build]) => model(personaId, group, skinTone, build, "short")),
];

const BY_ID = new Map(AI_TRY_ON_DEFAULT_MODELS.map((entry) => [entry.id, entry]));

export const AI_TRY_ON_DEFAULT_MODEL_PUBLIC_DIR = "ai-try-on-models" as const;

/**
 * Garments whose try-on base must be the short photo. Everything else,
 * including a standalone Standard Shirt or Long Shirt, uses the long photo.
 */
const SHORT_STUDIO_GARMENT_TYPES = new Set([
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
]);

export const findAiTryOnDefaultModel = (id: unknown): AiTryOnDefaultModel | null =>
  typeof id === "string" ? BY_ID.get(id) ?? null : null;

/** The other length of the same persona, or null when the id is unknown. */
export const aiTryOnDefaultModelLengthVariant = (
  personaId: string,
  lengthCategory: AiTryOnModelLengthCategory,
): AiTryOnDefaultModel | null =>
  AI_TRY_ON_DEFAULT_MODELS.find(
    (entry) => entry.personaId === personaId && entry.lengthCategory === lengthCategory,
  ) ?? null;

/**
 * Short bases for Standard Skirt, Standard Nikka Shorts, Standard Bum Shorts
 * and Standard Dress. Long bases for Long Dress, Long Skirt, Trouser, and a
 * standalone Standard Shirt or Long Shirt. An unknown type has no length yet.
 */
export const aiTryOnStudioModelLengthForGarment = (
  garmentType: string | null | undefined,
): AiTryOnModelLengthCategory | null => {
  if (!garmentType) return null;
  return SHORT_STUDIO_GARMENT_TYPES.has(garmentType) ? "short" : "long";
};

/**
 * Studio model pre-selected for a design style's audience and garment length.
 * A women's style uses the first women's model of that length. Every other
 * audience, including unisex and unknown, uses the first men's model of that
 * length. Long stays the historical default.
 */
export const defaultAiTryOnStudioModelId = (
  styleGender: string | null | undefined,
  lengthCategory: AiTryOnModelLengthCategory = "long",
): string => {
  const group: AiTryOnModelGroup = styleGender === "female" ? "women" : "men";
  return (
    AI_TRY_ON_DEFAULT_MODELS.find(
      (entry) => entry.group === group && entry.lengthCategory === lengthCategory,
    )?.id ?? AI_TRY_ON_DEFAULT_MODELS[0].id
  );
};

/** Site-relative picture URL, e.g. `/ai-try-on-models/male-plus.webp`. */
export const aiTryOnDefaultModelImageUrl = (entry: AiTryOnDefaultModel): string =>
  `/${AI_TRY_ON_DEFAULT_MODEL_PUBLIC_DIR}/${entry.id}.webp`;

export const aiTryOnDefaultModelsInGroup = (
  group: AiTryOnModelGroup,
  lengthCategory?: AiTryOnModelLengthCategory,
): readonly AiTryOnDefaultModel[] =>
  AI_TRY_ON_DEFAULT_MODELS.filter(
    (entry) => entry.group === group && (lengthCategory === undefined || entry.lengthCategory === lengthCategory),
  );
