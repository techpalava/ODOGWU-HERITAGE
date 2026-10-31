import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import type { AiTryOnVerifiedPrivateResultReference } from "../types";
import type { AiTryOnInlineImage } from "../utils/aiTryOnGatewayContract";
import type { AiTryOnWearerTarget } from "../utils/aiTryOnWearerTargets";
import {
  AI_TRY_ON_PHOTO_ACCEPT,
  AiTryOnPhotoError,
  AI_TRY_ON_PHOTO_PROCESSING_ERROR,
  fitsAiTryOnTotalLimit,
  loadAiTryOnReferenceImage,
  prepareAiTryOnPersonPhoto,
  validateAiTryOnPhotoFile,
} from "../utils/aiTryOnPhoto";
import {
  requestAiTryOnPreview,
  type AiTryOnPreviewOutcome,
} from "../services/aiTryOnGateway";
import type { AiTryOnGenerationRequest } from "../utils/aiTryOnGatewayContract";

/**
 * Step 5 AI Try-on photo panel: wearer picker, consent notice, "How we use
 * your photo", photo tips, photo picker, Generate, result and errors.
 *
 * Privacy boundary: the photo and the preview live only in this
 * component's memory. Nothing here is written to the draft, the order or
 * browser storage; the parent receives only the opaque result reference.
 */

export const AI_TRY_ON_CONSENT_NOTICE =
  "By uploading a photo, you agree that The Odogwu Heritage can send it to Google's Gemini AI to create a try-on preview. The photo must be of you, or of someone aged 18 or over who has agreed to it.";

export const AI_TRY_ON_HOW_WE_USE_BULLETS: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: "What we send:",
    text: "your photo, the garment picture and, if you chose a fabric, the fabric picture. We also send the design choices and fit measurements for this person. We send them to Google's Gemini AI only to create your preview. We never send names, contact details, prices or the letters of a monogram.",
  },
  {
    label: "What Google does with it:",
    text: "Google processes it for us as our service provider. Under Google's paid API terms, it does not use your photo or the preview to improve its products. Google keeps each request and result for up to 55 days, only to detect misuse, and it may store them briefly in any country where it has facilities.",
  },
  {
    label: "What we keep:",
    text: "we delete your photo straight after the preview is made. We keep the preview privately for up to 30 days, or until you place your order, whichever comes first, and delete it sooner if you ask. We never share it with our workshop.",
  },
  {
    label: "Fair use:",
    text: "each order gets 5 previews, shared by everyone on the order. We also limit how many requests one connection can make in an hour. To count these, we store a scrambled code made from your order and your IP address, never the photo itself.",
  },
  {
    label: "It's optional:",
    text: "you can continue without AI Try-on. It never changes your order, price or measurements.",
  },
  {
    label: "It's a preview:",
    text: "the image is made by AI and is only a guide.",
  },
];

export const AI_TRY_ON_PHOTO_TIPS: readonly string[] = [
  "One person only, standing, facing the camera.",
  "Full body from head to feet, if you can.",
  "A plain background and soft, even light.",
  "A real photo, not a screenshot. No app buttons, text, frames, filters or stickers.",
  "Nothing covering your body, such as a bag, coat or a large hat.",
  "JPEG, PNG or WebP.",
];

export const AI_TRY_ON_PREVIEW_DISCLAIMER =
  "This is an AI preview to help you picture your outfit. The real garment, fabric colour, pattern placement and fit may look different. We make your order from your measurements and choices, not from this image.";

export const AI_TRY_ON_MESSAGES = {
  outOfPreviews:
    "You've used all 5 AI Try-on previews for this order. They're shared by everyone on the order. You can still continue without one.",
  tooManyTries: "That's a lot of tries in a short time. Please wait a while and try again.",
  failed: (left: number) =>
    `We couldn't create a preview this time. This try wasn't counted, so you still have ${left} left. Try again, or use a different photo.`,
  photoBlocked: "We couldn't use this photo. This try wasn't counted. Please try a different photo.",
} as const;

type PanelMessage =
  | { kind: "out_of_previews" }
  | { kind: "too_many_tries" }
  | { kind: "failed"; left: number }
  | { kind: "photo_blocked" };

const messageText = (message: PanelMessage): string => {
  switch (message.kind) {
    case "out_of_previews":
      return AI_TRY_ON_MESSAGES.outOfPreviews;
    case "too_many_tries":
      return AI_TRY_ON_MESSAGES.tooManyTries;
    case "failed":
      return AI_TRY_ON_MESSAGES.failed(message.left);
    case "photo_blocked":
      return AI_TRY_ON_MESSAGES.photoBlocked;
  }
};

interface WearerPreview {
  inputFingerprint: string;
  mimeType: string;
  data: string;
}

interface SelectedPhoto {
  wearerId: string;
  image: AiTryOnInlineImage;
  thumbnailUrl: string | null;
}

export interface AiTryOnPhotoPanelProps {
  targets: readonly AiTryOnWearerTarget[];
  orderKey: string;
  triesPerOrder: number;
  /** From GET; null when the server did not report it. */
  initialTriesRemaining: number | null;
  onPreviewCreated: (event: {
    wearerId: string;
    resultReference: AiTryOnVerifiedPrivateResultReference;
  }) => void;
  /** The gateway went away mid-flow (e.g. global cap reached). */
  onUnavailable: () => void;
  requestPreview?: (request: AiTryOnGenerationRequest) => Promise<AiTryOnPreviewOutcome>;
  loadReferenceImage?: (url: string) => Promise<AiTryOnInlineImage>;
  preparePhoto?: (file: File) => Promise<AiTryOnInlineImage>;
  createThumbnailUrl?: (file: File) => string | null;
  revokeThumbnailUrl?: (url: string) => void;
}

const defaultThumbnail = (file: File) =>
  typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : null;
const defaultRevoke = (url: string) => {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
};

export const AiTryOnPhotoPanel = ({
  targets,
  orderKey,
  triesPerOrder,
  initialTriesRemaining,
  onPreviewCreated,
  onUnavailable,
  requestPreview = (request) => requestAiTryOnPreview({ request }),
  loadReferenceImage = (url) => loadAiTryOnReferenceImage(url),
  preparePhoto = (file) => prepareAiTryOnPersonPhoto(file),
  createThumbnailUrl = defaultThumbnail,
  revokeThumbnailUrl = defaultRevoke,
}: AiTryOnPhotoPanelProps) => {
  const idPrefix = useId();
  const howWeUseId = `${idPrefix}-how-we-use`;
  const photoInputId = `${idPrefix}-photo`;
  const tipsId = `${idPrefix}-tips`;
  const [selectedWearerId, setSelectedWearerId] = useState<string>(
    targets[0]?.wearerId || "",
  );
  const [howWeUseOpen, setHowWeUseOpen] = useState(false);
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [triesRemaining, setTriesRemaining] = useState<number | null>(initialTriesRemaining);
  const [previews, setPreviews] = useState<Record<string, WearerPreview>>({});
  const [message, setMessage] = useState<PanelMessage | null>(
    initialTriesRemaining === 0 ? { kind: "out_of_previews" } : null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<SelectedPhoto | null>(null);
  photoRef.current = photo;

  useEffect(() => {
    setTriesRemaining(initialTriesRemaining);
    if (initialTriesRemaining === 0) setMessage({ kind: "out_of_previews" });
  }, [initialTriesRemaining]);

  // Keep the selection valid when wearers change.
  useEffect(() => {
    if (!targets.some((target) => target.wearerId === selectedWearerId)) {
      setSelectedWearerId(targets[0]?.wearerId || "");
    }
  }, [targets, selectedWearerId]);

  // Drop the in-memory photo on unmount.
  useEffect(
    () => () => {
      const current = photoRef.current;
      if (current?.thumbnailUrl) revokeThumbnailUrl(current.thumbnailUrl);
    },
    [revokeThumbnailUrl],
  );

  const target =
    targets.find((entry) => entry.wearerId === selectedWearerId) || targets[0] || null;
  const showPicker = targets.length > 1;
  const left = triesRemaining ?? triesPerOrder;
  const currentPhoto = photo && target && photo.wearerId === target.wearerId ? photo : null;
  const preview =
    target && target.inputFingerprint
      ? previews[target.wearerId]?.inputFingerprint === target.inputFingerprint
        ? previews[target.wearerId]
        : null
      : null;
  const hasPreview = (entry: AiTryOnWearerTarget) =>
    Boolean(
      entry.inputFingerprint &&
        previews[entry.wearerId]?.inputFingerprint === entry.inputFingerprint,
    );
  const missingGarmentImage = Boolean(target && !target.garmentImageUrl);
  const canGenerate =
    Boolean(target?.inputFingerprint) &&
    !missingGarmentImage &&
    Boolean(currentPhoto) &&
    !generating &&
    !preparingPhoto &&
    left > 0;

  const clearPhoto = () => {
    setPhoto((current) => {
      if (current?.thumbnailUrl) revokeThumbnailUrl(current.thumbnailUrl);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectWearer = (wearerId: string) => {
    if (generating || wearerId === selectedWearerId) return;
    // A photo belongs to one person; never carry it to another wearer.
    clearPhoto();
    setPhotoError(null);
    setMessage(left === 0 ? { kind: "out_of_previews" } : null);
    setSelectedWearerId(wearerId);
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file || !target) return;
    setMessage(left === 0 ? { kind: "out_of_previews" } : null);
    const invalid = validateAiTryOnPhotoFile(file);
    if (invalid) {
      clearPhoto();
      setPhotoError(invalid);
      return;
    }
    setPhotoError(null);
    setPreparingPhoto(true);
    try {
      const image = await preparePhoto(file);
      setPhoto((current) => {
        if (current?.thumbnailUrl) revokeThumbnailUrl(current.thumbnailUrl);
        return { wearerId: target.wearerId, image, thumbnailUrl: createThumbnailUrl(file) };
      });
    } catch (error) {
      clearPhoto();
      setPhotoError(
        error instanceof AiTryOnPhotoError ? error.message : AI_TRY_ON_PHOTO_PROCESSING_ERROR,
      );
    } finally {
      setPreparingPhoto(false);
    }
  };

  const handleGenerate = async () => {
    if (!target || !target.inputFingerprint || !target.garmentImageUrl || !currentPhoto) return;
    if (left <= 0) {
      setMessage({ kind: "out_of_previews" });
      return;
    }
    const wearerId = target.wearerId;
    const inputFingerprint = target.inputFingerprint;
    setGenerating(true);
    setMessage(null);
    try {
      let garmentImage: AiTryOnInlineImage;
      let fabricSwatchImage: AiTryOnInlineImage | undefined;
      try {
        garmentImage = await loadReferenceImage(target.garmentImageUrl);
        if (target.mode === "fabric" && target.fabricSwatchImageUrl) {
          fabricSwatchImage = await loadReferenceImage(target.fabricSwatchImageUrl);
        }
      } catch {
        // No request was sent, so no try was used.
        setMessage({ kind: "failed", left });
        return;
      }
      const images = [currentPhoto.image, garmentImage, ...(fabricSwatchImage ? [fabricSwatchImage] : [])];
      if (!fitsAiTryOnTotalLimit(images)) {
        setMessage({ kind: "failed", left });
        return;
      }
      const request: AiTryOnGenerationRequest = {
        mode: fabricSwatchImage ? "fabric" : "garment",
        orderKey,
        inputFingerprint,
        personImage: currentPhoto.image,
        garmentImage,
        ...(fabricSwatchImage ? { fabricSwatchImage } : {}),
        ...(target.fitHints.length ? { fitHints: target.fitHints } : {}),
        ...(target.orderDetails ? { orderDetails: target.orderDetails } : {}),
      };
      const outcome = await requestPreview(request);
      switch (outcome.kind) {
        case "completed": {
          setPreviews((current) => ({
            ...current,
            [wearerId]: {
              inputFingerprint,
              mimeType: outcome.preview.mimeType,
              data: outcome.preview.data,
            },
          }));
          const remaining = outcome.orderTriesRemaining ?? Math.max(0, left - 1);
          setTriesRemaining(remaining);
          // The photo has done its job; drop it from memory.
          clearPhoto();
          onPreviewCreated({ wearerId, resultReference: outcome.resultReference });
          break;
        }
        case "order_limit_reached":
          setTriesRemaining(0);
          setMessage({ kind: "out_of_previews" });
          break;
        case "rate_limited":
          setMessage({ kind: "too_many_tries" });
          break;
        case "photo_blocked":
          if (outcome.orderTriesRemaining !== null) setTriesRemaining(outcome.orderTriesRemaining);
          setMessage({ kind: "photo_blocked" });
          break;
        case "failed": {
          const remaining = outcome.orderTriesRemaining ?? left;
          setTriesRemaining(remaining);
          setMessage({ kind: "failed", left: remaining });
          break;
        }
        case "unavailable":
          onUnavailable();
          break;
      }
    } finally {
      setGenerating(false);
    }
  };

  if (!target) return null;

  const triesLabel = `${left} ${left === 1 ? "try" : "tries"} left`;

  return (
    <div className="space-y-5" data-ai-try-on-panel="live">
      {showPicker && (
        <fieldset className="min-w-0">
          <legend className="font-serif text-lg font-bold text-heritage-green">
            Who's this for?
          </legend>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
            Choose the person in the photo. We'll use only their garments, fabric, details and
            measurements.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Who's this for?">
            {targets.map((entry) => {
              const selected = entry.wearerId === target.wearerId;
              const done = hasPreview(entry);
              return (
                <button
                  key={entry.wearerId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={generating}
                  onClick={() => selectWearer(entry.wearerId)}
                  data-wearer-chip={entry.wearerId}
                  className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? "border-heritage-green bg-heritage-green text-white"
                      : "border-heritage-green/25 bg-white text-heritage-green hover:border-heritage-green/50"
                  }`}
                >
                  <span className="min-w-0 truncate">{entry.label}</span>
                  {done && (
                    <>
                      <CheckCircle2
                        aria-hidden="true"
                        size={16}
                        className={selected ? "text-white" : "text-heritage-green"}
                      />
                      <span className="sr-only">(preview ready)</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="rounded-xl border border-heritage-green/15 bg-heritage-cream/35 p-4">
        <p className="text-sm leading-relaxed text-heritage-ink/80" data-ai-try-on-consent>
          {AI_TRY_ON_CONSENT_NOTICE}{" "}
          <button
            type="button"
            aria-expanded={howWeUseOpen}
            aria-controls={howWeUseId}
            onClick={() => setHowWeUseOpen((open) => !open)}
            className="inline-flex items-center gap-1 font-semibold text-heritage-green underline underline-offset-2 hover:text-heritage-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            How we use your photo
            <ChevronDown
              aria-hidden="true"
              size={14}
              className={`transition-transform ${howWeUseOpen ? "rotate-180" : ""}`}
            />
          </button>
        </p>
        {howWeUseOpen && (
          <ul
            id={howWeUseId}
            className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-heritage-ink/75"
          >
            {AI_TRY_ON_HOW_WE_USE_BULLETS.map((bullet) => (
              <li key={bullet.label}>
                <strong className="font-semibold text-heritage-green">{bullet.label}</strong>{" "}
                {bullet.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 id={tipsId} className="text-xs font-bold uppercase tracking-[0.14em] text-heritage-gold">
          Tips for a good preview
        </h3>
        <ul
          aria-labelledby={tipsId}
          className="mt-2 grid gap-1.5 text-sm leading-relaxed text-heritage-ink/75 sm:grid-cols-2"
        >
          {AI_TRY_ON_PHOTO_TIPS.map((tip) => (
            <li key={tip} className="flex gap-2">
              <CheckCircle2 aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-heritage-green/70" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <input
            ref={fileInputRef}
            id={photoInputId}
            type="file"
            accept={AI_TRY_ON_PHOTO_ACCEPT}
            className="sr-only"
            disabled={generating || preparingPhoto || missingGarmentImage}
            onChange={handlePhotoChange}
          />
          <label
            htmlFor={photoInputId}
            className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-heritage-green/40 bg-white px-5 text-xs font-bold uppercase tracking-wider text-heritage-green hover:border-heritage-green sm:w-auto ${
              generating || preparingPhoto || missingGarmentImage ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {preparingPhoto ? (
              <Loader2 aria-hidden="true" size={15} className="animate-spin" />
            ) : (
              <ImagePlus aria-hidden="true" size={15} />
            )}
            {currentPhoto ? "Change photo" : "Choose a photo"}
          </label>
          {currentPhoto?.thumbnailUrl && (
            <img
              src={currentPhoto.thumbnailUrl}
              alt={`Photo chosen for ${target.label}`}
              className="h-32 w-24 rounded-lg border border-heritage-green/15 object-cover"
            />
          )}
          {photoError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {photoError}
            </p>
          )}
          {missingGarmentImage && (
            <p className="text-sm leading-relaxed text-heritage-ink/70">
              A preview needs a catalogue picture of this garment, so it isn't available for
              uploaded designs yet.
            </p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            aria-describedby={message ? `${idPrefix}-message` : undefined}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:bg-heritage-green/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {generating ? (
              <Loader2 aria-hidden="true" size={15} className="animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" size={15} />
            )}
            <span>{preview ? "Make a new preview" : "Generate preview"}</span>
            <span className="font-medium normal-case tracking-normal text-white/80">· {triesLabel}</span>
          </button>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {generating && (
          <div
            className="flex items-center gap-3 rounded-xl border border-heritage-gold/30 bg-heritage-cream/40 p-4"
            data-ai-try-on-loading
          >
            <Loader2 aria-hidden="true" size={20} className="shrink-0 animate-spin text-heritage-green" />
            <p className="text-sm text-heritage-ink/80">
              Creating your preview. This can take up to a minute.
            </p>
          </div>
        )}
        {!generating && message && (
          <div
            id={`${idPrefix}-message`}
            role="alert"
            data-ai-try-on-message={message.kind}
            className="flex items-start gap-3 rounded-xl border border-heritage-gold/40 bg-amber-50 p-4"
          >
            <AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-heritage-gold" />
            <p className="text-sm leading-relaxed text-heritage-ink/85">{messageText(message)}</p>
          </div>
        )}
      </div>

      {preview && !generating && (
        <figure className="space-y-3" data-ai-try-on-result>
          <img
            src={`data:${preview.mimeType};base64,${preview.data}`}
            alt={`AI try-on preview for ${target.label}`}
            className="mx-auto max-h-[32rem] w-auto max-w-full rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 object-contain"
          />
          <figcaption className="text-xs leading-relaxed text-heritage-ink/65">
            {AI_TRY_ON_PREVIEW_DISCLAIMER}
          </figcaption>
        </figure>
      )}
    </div>
  );
};
