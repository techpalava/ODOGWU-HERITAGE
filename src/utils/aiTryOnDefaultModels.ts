/**
 * Default try-on models: ten fictional studio models a customer can pick
 * instead of uploading a photo ("No photo? Try it on a model").
 *
 * The pictures are AI-generated, fictional adults (no real person), shipped
 * as static WebP files in public/ai-try-on-models/ (~20 KB each). They use no
 * Firebase Storage: the browser shows them from the site, and the server
 * reads the same files from disk (vercel.json `includeFiles`) to send to
 * Gemini, so a request only ever carries the model id.
 */

export type AiTryOnModelGroup = "men" | "women";
export type AiTryOnModelSkinTone = "light" | "medium" | "deep";
export type AiTryOnModelBuild = "slim" | "medium" | "plus";

export interface AiTryOnDefaultModel {
  readonly id: string;
  readonly group: AiTryOnModelGroup;
  readonly skinTone: AiTryOnModelSkinTone;
  readonly build: AiTryOnModelBuild;
  /** Short customer-facing description (pending Xavier's wording approval). */
  readonly label: string;
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
  slim: "slim build",
  medium: "medium build",
  plus: "plus-size",
};

const model = (
  id: string,
  group: AiTryOnModelGroup,
  skinTone: AiTryOnModelSkinTone,
  build: AiTryOnModelBuild,
): AiTryOnDefaultModel => ({
  id,
  group,
  skinTone,
  build,
  label: `${SKIN_TONE_LABELS[skinTone]}, ${BUILD_LABELS[build]}`,
});

/** Display order: skin tones first, then builds, men before women. */
export const AI_TRY_ON_DEFAULT_MODELS: readonly AiTryOnDefaultModel[] = [
  model("male-1-light", "men", "light", "slim"),
  model("male-2-medium", "men", "medium", "slim"),
  model("male-3-deep", "men", "deep", "slim"),
  model("male-medium-build", "men", "medium", "medium"),
  model("male-plus", "men", "medium", "plus"),
  model("female-1-light", "women", "light", "slim"),
  model("female-2-medium", "women", "medium", "slim"),
  model("female-3-deep", "women", "deep", "slim"),
  model("female-medium-build", "women", "medium", "medium"),
  model("female-plus", "women", "medium", "plus"),
];

const BY_ID = new Map(AI_TRY_ON_DEFAULT_MODELS.map((entry) => [entry.id, entry]));

export const AI_TRY_ON_DEFAULT_MODEL_PUBLIC_DIR = "ai-try-on-models" as const;

export const findAiTryOnDefaultModel = (id: unknown): AiTryOnDefaultModel | null =>
  typeof id === "string" ? BY_ID.get(id) ?? null : null;

/** Site-relative picture URL, e.g. `/ai-try-on-models/male-plus.webp`. */
export const aiTryOnDefaultModelImageUrl = (entry: AiTryOnDefaultModel): string =>
  `/${AI_TRY_ON_DEFAULT_MODEL_PUBLIC_DIR}/${entry.id}.webp`;

export const aiTryOnDefaultModelsInGroup = (
  group: AiTryOnModelGroup,
): readonly AiTryOnDefaultModel[] =>
  AI_TRY_ON_DEFAULT_MODELS.filter((entry) => entry.group === group);
