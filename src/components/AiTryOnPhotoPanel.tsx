import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Loader2,
  Sparkles,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import type { AiTryOnVerifiedPrivateResultReference } from "../types";
import type { AiTryOnInlineImage } from "../utils/aiTryOnGatewayContract";
import type { AiTryOnWearerTarget } from "../utils/aiTryOnWearerTargets";
import {
  AI_TRY_ON_PHOTO_ACCEPT,
  AiTryOnPhotoError,
  AI_TRY_ON_PHOTO_PROCESSING_ERROR,
  fitsAiTryOnTotalLimit,
  prepareAiTryOnPersonPhoto,
  validateAiTryOnPhotoFile,
} from "../utils/aiTryOnPhoto";
import {
  requestAiTryOnPreview,
  type AiTryOnCredentials,
  type AiTryOnPreviewOutcome,
} from "../services/aiTryOnGateway";
import type {
  AiTryOnGenerationRequest,
  AiTryOnStoredPreviewSummary,
} from "../utils/aiTryOnGatewayContract";

/**
 * Step 5 AI Try-on photo panel: wearer picker, consent notice, "How we use
 * your photo", photo tips, photo picker, Generate, result and errors.
 *
 * Privacy boundary: the photo lives only in this component's memory and in
 * the generation request; it is dropped once the preview is made. The
 * preview is shown from memory; the server keeps it privately (Step 6) and
 * this panel restores it after a reload through the owner-only gateway.
 * Nothing here is written to the draft, the order or browser storage; the
 * parent receives only the opaque result reference.
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
  previewDeleted: "Your preview was deleted.",
  deleteFailed: "We couldn't delete your preview. Please try again.",
} as const;

type PanelMessage =
  | { kind: "preview_deleted" }
  | { kind: "delete_failed" }
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
    case "preview_deleted":
      return AI_TRY_ON_MESSAGES.previewDeleted;
    case "delete_failed":
      return AI_TRY_ON_MESSAGES.deleteFailed;
  }
};

interface WearerPreview {
  inputFingerprint: string;
  mimeType: string;
  data: string;
  /** Server-side id when the preview is stored privately. */
  storedPreviewId: string | null;
}

interface SelectedPhoto {
  wearerId: string;
  image: AiTryOnInlineImage;
  thumbnailUrl: string | null;
}

export interface AiTryOnPhotoPanelProps {
  targets: readonly AiTryOnWearerTarget[];
  /** Step 7: who is calling, for the server-issued session. */
  credentials?: AiTryOnCredentials;
  triesPerOrder: number;
  /** From GET; null when the server did not report it. */
  initialTriesRemaining: number | null;
  onPreviewCreated: (event: {
    wearerId: string;
    resultReference: AiTryOnVerifiedPrivateResultReference;
  }) => void;
  /** The gateway went away mid-flow (e.g. global cap reached). */
  onUnavailable: () => void;
  /** True while a preview is generating; the step hides its skip button. */
  onGeneratingChange?: (generating: boolean) => void;
  requestPreview?: (request: AiTryOnGenerationRequest) => Promise<AiTryOnPreviewOutcome>;
  /** Stored, still-valid previews of this order (from GET). */
  storedPreviews?: readonly AiTryOnStoredPreviewSummary[];
  /** Owner-only read of a stored preview; null when it is gone. */
  loadStoredPreview?: (previewId: string) => Promise<{ mimeType: string; data: string } | null>;
  /** Deletes a stored preview; true on success. */
  deleteStoredPreview?: (previewId: string) => Promise<boolean>;
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
  credentials,
  triesPerOrder,
  initialTriesRemaining,
  onPreviewCreated,
  onUnavailable,
  onGeneratingChange,
  requestPreview = (request) => requestAiTryOnPreview({ request, credentials }),
  storedPreviews = [],
  loadStoredPreview = async () => null,
  deleteStoredPreview = async () => false,
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
  /** Stored previews by wearer, minus any deleted in this session. */
  const [stored, setStored] = useState<Record<string, AiTryOnStoredPreviewSummary>>(() =>
    Object.fromEntries(storedPreviews.map((entry) => [entry.wearerKey, entry])),
  );
  const [deleting, setDeleting] = useState(false);
  const restoringRef = useRef(new Set<string>());
  const [message, setMessage] = useState<PanelMessage | null>(
    initialTriesRemaining === 0 ? { kind: "out_of_previews" } : null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onGeneratingChangeRef = useRef(onGeneratingChange);
  onGeneratingChangeRef.current = onGeneratingChange;
  useEffect(() => {
    onGeneratingChangeRef.current?.(generating);
  }, [generating]);
  // Never leave the skip button hidden if the panel goes away mid-request.
  useEffect(() => () => onGeneratingChangeRef.current?.(false), []);
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
        (previews[entry.wearerId]?.inputFingerprint === entry.inputFingerprint ||
          stored[entry.wearerId]?.inputFingerprint === entry.inputFingerprint),
    );

  // Reload: restore the selected wearer's stored preview while it is valid
  // for that wearer's current design.
  useEffect(() => {
    if (!target?.inputFingerprint) return;
    const summary = stored[target.wearerId];
    if (!summary || summary.inputFingerprint !== target.inputFingerprint) return;
    if (previews[target.wearerId]?.inputFingerprint === target.inputFingerprint) return;
    if (restoringRef.current.has(summary.previewId)) return;
    restoringRef.current.add(summary.previewId);
    const wearerId = target.wearerId;
    void loadStoredPreview(summary.previewId).then((image) => {
      if (!image) {
        setStored((current) => {
          const next = { ...current };
          if (next[wearerId]?.previewId === summary.previewId) delete next[wearerId];
          return next;
        });
        return;
      }
      setPreviews((current) =>
        current[wearerId]?.inputFingerprint === summary.inputFingerprint
          ? current
          : {
              ...current,
              [wearerId]: {
                inputFingerprint: summary.inputFingerprint,
                mimeType: image.mimeType,
                data: image.data,
                storedPreviewId: summary.previewId,
              },
            },
      );
    });
  }, [target?.wearerId, target?.inputFingerprint, stored, previews, loadStoredPreview]);

  const handleDeletePreview = async () => {
    if (!target || !preview?.storedPreviewId || deleting) return;
    const wearerId = target.wearerId;
    const previewId = preview.storedPreviewId;
    setDeleting(true);
    try {
      const ok = await deleteStoredPreview(previewId);
      if (!ok) {
        setMessage({ kind: "delete_failed" });
        return;
      }
      setPreviews((current) => {
        const next = { ...current };
        delete next[wearerId];
        return next;
      });
      setStored((current) => {
        const next = { ...current };
        delete next[wearerId];
        return next;
      });
      setMessage({ kind: "preview_deleted" });
    } finally {
      setDeleting(false);
    }
  };
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
      if (!fitsAiTryOnTotalLimit([currentPhoto.image])) {
        setMessage({ kind: "failed", left });
        return;
      }
      // Step 6: the server loads the catalogue pictures itself, so browser
      // CORS on the Storage bucket no longer matters.
      const fabricMode = target.mode === "fabric" && Boolean(target.fabricSwatchImageUrl);
      const request: AiTryOnGenerationRequest = {
        mode: fabricMode ? "fabric" : "garment",
        inputFingerprint,
        wearerKey: wearerId,
        personImage: currentPhoto.image,
        garmentImageUrl: target.garmentImageUrl,
        ...(fabricMode ? { fabricSwatchImageUrl: target.fabricSwatchImageUrl! } : {}),
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
              storedPreviewId: outcome.storedPreviewId ?? null,
            },
          }));
          // The new preview replaces this wearer's stored one on the server.
          setStored((current) => {
            const next = { ...current };
            delete next[wearerId];
            return next;
          });
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
          // Column flow (not a grid): each column stacks on its own, so a
          // two-line tip never leaves a gap beside the other column's rows.
          className="mt-2 text-sm leading-relaxed text-heritage-ink/75 sm:columns-2 sm:gap-x-8"
        >
          {AI_TRY_ON_PHOTO_TIPS.map((tip) => (
            <li key={tip} className="mb-1.5 flex break-inside-avoid gap-2">
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
            role={message.kind === "preview_deleted" ? "status" : "alert"}
            data-ai-try-on-message={message.kind}
            className={
              message.kind === "preview_deleted"
                ? "flex items-start gap-3 rounded-xl border border-heritage-green/25 bg-heritage-cream/40 p-4"
                : "flex items-start gap-3 rounded-xl border border-heritage-gold/40 bg-amber-50 p-4"
            }
          >
            {message.kind === "preview_deleted" ? (
              <CheckCircle2 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-heritage-green" />
            ) : (
              <AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-heritage-gold" />
            )}
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
          {preview.storedPreviewId && (
            <button
              type="button"
              onClick={handleDeletePreview}
              disabled={deleting}
              data-ai-try-on-delete
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 bg-white px-5 text-xs font-bold uppercase tracking-wider text-heritage-green hover:border-heritage-green disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? (
                <Loader2 aria-hidden="true" size={14} className="animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" size={14} />
              )}
              Delete my preview
            </button>
          )}
        </figure>
      )}
    </div>
  );
};
