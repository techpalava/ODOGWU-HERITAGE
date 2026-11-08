import {
  aiTryOnPreviewTargets,
  aiTryOnOrderPreviewTargets,
  aiTryOnOutfitTarget,
  aiTryOnOutfitChoices,
  aiTryOnOutfitPairFor,
  aiTryOnPreviewFingerprintIsCurrent,
  aiTryOnTargetHasDesign,
  buildAiTryOnOutfitRequestGarment,
} from "../utils/aiTryOnWearerTargets";
import { AI_TRY_ON_ORDER_IMAGE_COPY, AI_TRY_ON_ORDER_IMAGE_PRIVACY_COPY } from "../utils/aiTryOnOrderImageCopy";
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Loader2,
  Sparkles,
  AlertTriangle,
  Trash2,
  UserRound,
} from "lucide-react";
import type { AiTryOnVerifiedPrivateResultReference } from "../types";
import type { AiTryOnInlineImage } from "../utils/aiTryOnGatewayContract";
import type {
  AiTryOnPreviewableGarment,
  AiTryOnWearerTarget,
} from "../utils/aiTryOnWearerTargets";
import {
  AI_TRY_ON_DEFAULT_MODELS,
  AI_TRY_ON_MODEL_GROUP_LABELS,
  aiTryOnDefaultModelImageUrl,
  findAiTryOnDefaultModel,
  type AiTryOnModelGroup,
} from "../utils/aiTryOnDefaultModels";
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
  releaseAiTryOnBusyJob,
  type AiTryOnCredentials,
  type AiTryOnPreviewOutcome,
} from "../services/aiTryOnGateway";
import {
  aiTryOnBackgroundJobs,
  useAiTryOnBackgroundJobs,
  type AiTryOnBackgroundJob,
  type AiTryOnBackgroundJobs,
} from "../services/aiTryOnBackgroundJobs";
import { AI_TRY_ON_BACKGROUND_COPY } from "../utils/aiTryOnBackgroundCopy";
import type {
  AiTryOnGenerationRequest,
  AiTryOnStoredPreviewSummary,
} from "../utils/aiTryOnGatewayContract";

/**
 * Step 5 AI Try-on photo panel: wearer picker, measurement picker, garment
 * picker, consent notice, "How we use your photo", photo tips, photo picker,
 * Generate, result and errors.
 *
 * Privacy boundary: a prepared photo may be kept by Design Studio for this
 * tab, keyed to one wearer, so leaving Try-on and coming back does not
 * clear it. It is never written to the draft, the order or browser storage.
 * It is dropped on a full reload, a new order, sign-out, and when the
 * customer switches wearer. The generated preview is also kept in that tab
 * memory, per wearer, so leaving Try-on does not clear it. A full reload
 * drops the image bytes. The server keeps the preview privately (Step 6)
 * and this panel loads it again when that wearer's design fingerprint still
 * matches. A fingerprint change hides it. Restoring never starts a new
 * generate. The parent receives the prepared photo and the preview image
 * only in that session memory, plus the opaque result reference.
 */

/**
 * Prepared try-on photo held in Design Studio memory for one wearer.
 * Never persisted.
 */
export interface AiTryOnSessionPhoto {
  readonly wearerId: string;
  readonly image: AiTryOnInlineImage;
  readonly thumbnailUrl: string | null;
}

/**
 * Photo-upload consent (Xavier, cards t88s783 / t88s789 and the plain-words
 * rewrite). Facts only from the code and the privacy policy
 * (src/data/legalContent.ts, AI_TRY_ON_ORDER_IMAGE_PRIVACY_COPY): the photo is
 * never stored by us (aiTryOnPreviewStore), previews expire after 30 days
 * (AI_TRY_ON_PREVIEW_RETENTION_MS), the order copy is deleted 60 days after
 * payment (AI_TRY_ON_ORDER_IMAGE_RETENTION_DAYS), and Google keeps requests
 * for up to 55 days to detect misuse (privacy policy). Uploaded-design mode
 * shows this same notice (deep check M2).
 */
export const AI_TRY_ON_CONSENT_NOTICE =
  "By uploading a photo, you agree that we can send it to Google's Gemini AI, which uses it only to make your try-on preview. The photo must be of you, or of someone aged 18 or over who has agreed. We don't keep your photo once the preview is made. We keep the preview privately for up to 30 days and, if you order, with your order until 60 days after payment, then delete it. You can ask us to delete it sooner. Google keeps the photo and preview for up to 55 days to check for misuse, then deletes them.";

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
    text: AI_TRY_ON_ORDER_IMAGE_PRIVACY_COPY.panelNotice,
  },
  {
    label: "Fair use:",
    text: "each order gets 5 previews, shared by everyone on the order, and a signed-in account gets up to 15 previews in any 30 days. We also limit how many requests one connection can make in an hour. To count these, we store scrambled codes made from your order, your account and your IP address, never the photo itself.",
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

/**
 * Model mode ("No photo? Try it on a model"). Wording approved by Xavier.
 * No consent notice: no personal photo is involved.
 */
export const AI_TRY_ON_MODEL_COPY = {
  option: "Choose a model",
  heading: "Choose a model",
  intro: "See the design on one of our AI-generated models instead of a photo of you.",
  filterAll: "All",
  shownOnModel: "Shown on one of our AI-generated models, not on you, so the fit won't match your measurements.",
  usePhotoInstead: "Use a photo instead",
} as const;

export const AI_TRY_ON_MESSAGES = {
  outOfPreviews:
    "You've used all 5 AI Try-on previews for this order. They're shared by everyone on the order. You can still continue without one.",
  // Pending Xavier's approval (account cap, follow-up to Step 7).
  accountOutOfPreviews:
    "You've used all 15 AI Try-on previews on your account in the last 30 days. You can still continue without one.",
  tooManyTries: "That's a lot of tries in a short time. Please wait a while and try again.",
  failed: (left: number, tryRefunded = false) =>
    tryRefunded
      ? `${AI_TRY_ON_BACKGROUND_COPY.refundedBody} You have ${left} left.`
      : AI_TRY_ON_BACKGROUND_COPY.failedBody,
  photoBlocked: "We couldn't use this photo. Please try a different photo.",
  previewDeleted: "Your preview was deleted.",
  deleteFailed: "We couldn't delete your preview. Please try again.",
} as const;


type PanelMessage =
  | { kind: "preview_deleted" }
  | { kind: "delete_failed" }
  | { kind: "out_of_previews" }
  | { kind: "account_out_of_previews" }
  | { kind: "too_many_tries" }
  | { kind: "in_progress" }
  | { kind: "failed"; left: number; tryRefunded?: boolean }
  /** Still busy after the retries. */
  | { kind: "busy_failed"; tryRefunded?: boolean }
  | { kind: "photo_blocked"; tryRefunded?: boolean };

const messageText = (message: PanelMessage): string => {
  switch (message.kind) {
    case "out_of_previews":
      return AI_TRY_ON_MESSAGES.outOfPreviews;
    case "account_out_of_previews":
      return AI_TRY_ON_MESSAGES.accountOutOfPreviews;
    case "too_many_tries":
      return AI_TRY_ON_MESSAGES.tooManyTries;
    case "in_progress":
      return AI_TRY_ON_BACKGROUND_COPY.inProgressBody;
    case "failed":
      return AI_TRY_ON_MESSAGES.failed(message.left, message.tryRefunded);
    case "busy_failed":
      return message.tryRefunded ? AI_TRY_ON_BACKGROUND_COPY.refundedBody : AI_TRY_ON_BACKGROUND_COPY.busyFailedBody;
    case "photo_blocked":
      return `${AI_TRY_ON_MESSAGES.photoBlocked} ${message.tryRefunded ? AI_TRY_ON_BACKGROUND_COPY.refundedBody : AI_TRY_ON_BACKGROUND_COPY.failedBody}`;
    case "preview_deleted":
      return AI_TRY_ON_MESSAGES.previewDeleted;
    case "delete_failed":
      return AI_TRY_ON_MESSAGES.deleteFailed;
  }
};

/**
 * One wearer's generated preview, held in Design Studio memory for this tab.
 * The bytes are not written to the draft or browser storage. After a reload
 * the panel loads the server copy when `inputFingerprint` still matches.
 */
export interface AiTryOnSessionPreview {
  inputFingerprint: string;
  mimeType: string;
  data: string;
  /** Server-side id when the preview is stored privately. */
  storedPreviewId: string | null;
  /** Model mode: the default model shown. */
  modelId: string | null;
}

type WearerPreview = AiTryOnSessionPreview;

const EMPTY_SESSION_PREVIEWS: Readonly<Record<string, AiTryOnSessionPreview>> = {};
const loadNoStoredPreview = async (): Promise<{ mimeType: string; data: string } | null> => null;
const deleteNoStoredPreview = async (): Promise<boolean> => false;

interface SelectedPhoto {
  wearerId: string;
  image: AiTryOnInlineImage;
  thumbnailUrl: string | null;
}

const loadUploadedDesignImage = async (url: string): Promise<AiTryOnInlineImage> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The uploaded design photo could not be read.");
  const blob = await response.blob();
  return prepareAiTryOnPersonPhoto(new File([blob], "uploaded-design", { type: blob.type }));
};

export interface AiTryOnPhotoPanelProps {
  onUploadAnotherDesign?: (garmentKey: string) => void;
  loadUploadedDesign?: (url: string) => Promise<AiTryOnInlineImage>;
  targets: readonly AiTryOnWearerTarget[];
  /** Step 7: who is calling, for the server-issued session. */
  credentials?: AiTryOnCredentials;
  triesPerOrder: number;
  /** From GET; null when the server did not report it. */
  initialTriesRemaining: number | null;
  /**
   * Signed-in customers: tries left in the account's rolling 30 days
   * (15 across all orders). Null for guests. The panel shows the smaller
   * of this and the order's tries.
   */
  initialAccountTriesRemaining?: number | null;
  onPreviewCreated: (event: {
    wearerId: string;
    resultReference: AiTryOnVerifiedPrivateResultReference;
    /** The wearer's design the preview was made for. */
    inputFingerprint: string;
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
  /** Background requests (one per wearer); outlive this panel. */
  jobStore?: AiTryOnBackgroundJobs;
  /** Busy retries given up: refunds the held try on the server. */
  releaseBusyJob?: (jobId: string, wearerKey: string) => Promise<unknown>;
  /** Order/identity scope of the jobs this panel shows. */
  jobScope?: string;
  /**
   * Session memory owned by Design Studio. When the change callbacks are
   * set, the photo, model choice, selected wearer and measurement wearer
   * survive this panel unmounting. Omit them to keep that state inside the
   * panel (tests).
   */
  sessionPhoto?: AiTryOnSessionPhoto | null;
  onSessionPhotoChange?: (photo: AiTryOnSessionPhoto | null) => void;
  sessionModelIdByWearer?: Readonly<Record<string, string>>;
  onSessionModelIdByWearerChange?: (
    update: (current: Record<string, string>) => Record<string, string>,
  ) => void;
  sessionWearerId?: string | null;
  onSessionWearerIdChange?: (wearerId: string) => void;
  /**
   * Whose measurements Generate sends. Independent of the photo wearer.
   * Null follows the photo wearer until the customer chooses someone else.
   */
  sessionMeasurementWearerId?: string | null;
  onSessionMeasurementWearerIdChange?: (wearerId: string) => void;
  /**
   * Last preview per wearer for this tab. When the change callback is set,
   * the image survives this panel unmounting. Omit both to keep previews
   * inside the panel (tests). Never persisted.
   */
  sessionPreviews?: Readonly<Record<string, AiTryOnSessionPreview>>;
  onSessionPreviewsChange?: (
    update: (current: Record<string, AiTryOnSessionPreview>) => Record<string, AiTryOnSessionPreview>,
  ) => void;
}

const tryOnChoiceChipClass = (selected: boolean) =>
  `inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold disabled:cursor-not-allowed disabled:opacity-60 ${
    selected
      ? "border-heritage-green bg-heritage-green text-white"
      : "border-heritage-green/25 bg-white text-heritage-green hover:border-heritage-green/50"
  }`;

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
  onUploadAnotherDesign,
  loadUploadedDesign = loadUploadedDesignImage,
  targets,
  credentials,
  triesPerOrder,
  initialTriesRemaining,
  initialAccountTriesRemaining = null,
  onPreviewCreated,
  onUnavailable,
  onGeneratingChange,
  requestPreview = (request) => requestAiTryOnPreview({ request, credentials }),
  storedPreviews = [],
  loadStoredPreview = loadNoStoredPreview,
  deleteStoredPreview = deleteNoStoredPreview,
  preparePhoto = (file) => prepareAiTryOnPersonPhoto(file),
  createThumbnailUrl = defaultThumbnail,
  revokeThumbnailUrl = defaultRevoke,
  jobStore = aiTryOnBackgroundJobs,
  releaseBusyJob = (jobId, wearerKey) => releaseAiTryOnBusyJob({ credentials, jobId, wearerKey }),
  jobScope = "default",
  sessionPhoto = null,
  onSessionPhotoChange,
  sessionModelIdByWearer,
  onSessionModelIdByWearerChange,
  sessionWearerId = null,
  onSessionWearerIdChange,
  sessionMeasurementWearerId = null,
  onSessionMeasurementWearerIdChange,
  sessionPreviews,
  onSessionPreviewsChange,
}: AiTryOnPhotoPanelProps) => {
  const idPrefix = useId();
  const howWeUseId = `${idPrefix}-how-we-use`;
  const photoInputId = `${idPrefix}-photo`;
  const tipsId = `${idPrefix}-tips`;
  const photoControlled = onSessionPhotoChange !== undefined;
  const modelControlled = onSessionModelIdByWearerChange !== undefined;
  const wearerControlled = onSessionWearerIdChange !== undefined;
  const initialWearerId =
    sessionWearerId && targets.some((target) => target.wearerId === sessionWearerId)
      ? sessionWearerId
      : targets[0]?.wearerId || "";
  const [uncontrolledWearerId, setUncontrolledWearerId] = useState<string>(initialWearerId);
  const selectedWearerId = wearerControlled
    ? sessionWearerId && targets.some((target) => target.wearerId === sessionWearerId)
      ? sessionWearerId
      : targets[0]?.wearerId || ""
    : uncontrolledWearerId;
  const [howWeUseOpen, setHowWeUseOpen] = useState(false);
  const [uncontrolledPhoto, setUncontrolledPhoto] = useState<SelectedPhoto | null>(null);
  const photo = photoControlled ? sessionPhoto : uncontrolledPhoto;
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [triesRemaining, setTriesRemaining] = useState<number | null>(initialTriesRemaining);
  const [accountTriesRemaining, setAccountTriesRemaining] = useState<number | null>(
    initialAccountTriesRemaining,
  );
  const [uncontrolledPreviews, setUncontrolledPreviews] = useState<Record<string, WearerPreview>>({});
  const previewsControlled = onSessionPreviewsChange !== undefined;
  const previews = previewsControlled ? sessionPreviews ?? EMPTY_SESSION_PREVIEWS : uncontrolledPreviews;
  const onSessionPreviewsChangeRef = useRef(onSessionPreviewsChange);
  onSessionPreviewsChangeRef.current = onSessionPreviewsChange;
  const commitPreviews = useCallback(
    (update: (current: Record<string, WearerPreview>) => Record<string, WearerPreview>) => {
      const publish = onSessionPreviewsChangeRef.current;
      if (publish) publish(update);
      else setUncontrolledPreviews(update);
    },
    [],
  );
  /** Stored previews by wearer, minus any deleted in this session. */
  const [stored, setStored] = useState<Record<string, AiTryOnStoredPreviewSummary>>(() =>
    Object.fromEntries(storedPreviews.map((entry) => [entry.wearerKey, entry])),
  );
  /** Preview ids the customer deleted; a later session list must not bring them back. */
  const dismissedPreviewIdsRef = useRef(new Set<string>());
  const storedPreviewKey = storedPreviews
    .map(
      (entry) =>
        `${entry.wearerKey}\u0000${entry.previewId}\u0000${entry.inputFingerprint}\u0000${entry.modelId ?? ""}`,
    )
    .join("\n");
  const [deleting, setDeleting] = useState(false);
  const restoringRef = useRef(new Set<string>());
  /** Model mode: the default model chosen for each wearer. */
  const [uncontrolledModelByWearer, setUncontrolledModelByWearer] = useState<Record<string, string>>({});
  const modelByWearer = modelControlled ? sessionModelIdByWearer || {} : uncontrolledModelByWearer;
  const updateModelByWearer = (
    update: (current: Record<string, string>) => Record<string, string>,
  ) => {
    if (onSessionModelIdByWearerChange) onSessionModelIdByWearerChange(update);
    else setUncontrolledModelByWearer(update);
  };
  const [modelPickerOpen, setModelPickerOpen] = useState(
    () => Boolean((sessionModelIdByWearer || {})[initialWearerId]),
  );
  /** Which catalogue garment this Generate sends, per wearer. Default is the first pictured. */
  const [selectedGarmentKeyByWearer, setSelectedGarmentKeyByWearer] = useState<Record<string, string>>({});
  const [outfitModeByWearer, setOutfitModeByWearer] = useState<Record<string, boolean>>({});
  const [outfitChoicesByWearer, setOutfitChoicesByWearer] = useState<Record<string, { top?: string; bottom?: string }>>({});
  const [modelFilter, setModelFilter] = useState<AiTryOnModelGroup | "all">("all");
  const [message, setMessage] = useState<PanelMessage | null>(() =>
    initialAccountTriesRemaining === 0
      ? { kind: "account_out_of_previews" }
      : initialTriesRemaining === 0
        ? { kind: "out_of_previews" }
        : null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jobs = useAiTryOnBackgroundJobs(jobStore);
  const jobFor = (wearerId: string | undefined): AiTryOnBackgroundJob | null => {
    const job = wearerId ? jobs[wearerId] : undefined;
    return job && job.scope === jobScope ? job : null;
  };
  const previewTargets = aiTryOnOrderPreviewTargets(targets);
  const anyGenerating = previewTargets.some((entry) => jobFor(entry.wearerId)?.status === "running");
  const onGeneratingChangeRef = useRef(onGeneratingChange);
  onGeneratingChangeRef.current = onGeneratingChange;
  const onPreviewCreatedRef = useRef(onPreviewCreated);
  onPreviewCreatedRef.current = onPreviewCreated;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  const mountedAtRef = useRef(Date.now());
  const resultRef = useRef<HTMLElement | null>(null);
  const [highlightResult, setHighlightResult] = useState(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    onGeneratingChangeRef.current?.(anyGenerating);
  }, [anyGenerating]);
  // Never leave the skip button hidden if the panel goes away mid-request.
  useEffect(() => () => onGeneratingChangeRef.current?.(false), []);
  const photoRef = useRef<SelectedPhoto | null>(null);
  photoRef.current = photo;

  useEffect(() => {
    setTriesRemaining(initialTriesRemaining);
    setAccountTriesRemaining(initialAccountTriesRemaining);
    if (initialAccountTriesRemaining === 0) setMessage({ kind: "account_out_of_previews" });
    else if (initialTriesRemaining === 0) setMessage({ kind: "out_of_previews" });
  }, [initialTriesRemaining, initialAccountTriesRemaining]);

  const commitWearerId = (wearerId: string) => {
    if (onSessionWearerIdChange) onSessionWearerIdChange(wearerId);
    else setUncontrolledWearerId(wearerId);
  };

  const measurementControlled = onSessionMeasurementWearerIdChange !== undefined;
  const [uncontrolledMeasurementWearerId, setUncontrolledMeasurementWearerId] =
    useState<string>(initialWearerId);
  const storedMeasurementWearerId = measurementControlled
    ? sessionMeasurementWearerId
    : uncontrolledMeasurementWearerId;
  const measurementWearerId =
    storedMeasurementWearerId &&
    targets.some((entry) => entry.wearerId === storedMeasurementWearerId)
      ? storedMeasurementWearerId
      : selectedWearerId;
  const commitMeasurementWearerId = (wearerId: string) => {
    if (!wearerId || wearerId === storedMeasurementWearerId) return;
    if (onSessionMeasurementWearerIdChange) onSessionMeasurementWearerIdChange(wearerId);
    else setUncontrolledMeasurementWearerId(wearerId);
  };

  // Keep the selection valid when wearers change.
  useEffect(() => {
    if (!targets.some((target) => target.wearerId === selectedWearerId)) {
      commitWearerId(targets[0]?.wearerId || "");
    }
    // commitWearerId is recreated each render and only writes the fallback id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, selectedWearerId]);

  // Changing "Who's this for?" puts measurements back on that person.
  // A choice made for the current photo wearer is left alone, including
  // across unmount, so leaving Try-on does not reset it.
  const tryOnWearerIdRef = useRef(selectedWearerId);
  useEffect(() => {
    const previous = tryOnWearerIdRef.current;
    tryOnWearerIdRef.current = selectedWearerId;
    if (!selectedWearerId || previous === selectedWearerId) return;
    commitMeasurementWearerId(selectedWearerId);
    // commitMeasurementWearerId only writes the matching wearer id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWearerId]);

  useEffect(() => {
    if (!storedMeasurementWearerId || !selectedWearerId) return;
    if (targets.some((entry) => entry.wearerId === storedMeasurementWearerId)) return;
    commitMeasurementWearerId(selectedWearerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, storedMeasurementWearerId, selectedWearerId]);

  // Uncontrolled photos are dropped on unmount. A lifted session photo stays
  // with Design Studio until a new order, sign-out or a wearer switch.
  useEffect(
    () => () => {
      if (photoControlled) return;
      const current = photoRef.current;
      if (current?.thumbnailUrl) revokeThumbnailUrl(current.thumbnailUrl);
    },
    [photoControlled, revokeThumbnailUrl],
  );

  const target =
    targets.find((entry) => entry.wearerId === selectedWearerId) || targets[0] || null;
  const previewableGarments = target?.previewableGarments ?? [];
  const selectedPreview: AiTryOnPreviewableGarment | null =
    previewableGarments.find(
      (garment) => garment.garmentKey === selectedGarmentKeyByWearer[target?.wearerId || ""],
    ) ||
    previewableGarments[0] ||
    null;
  const singlePreviewTarget = target ? aiTryOnPreviewTargets([target]).find((entry) =>
    target.previewableGarments && target.previewableGarments.length > 1
      ? entry.previewableGarments?.[0]?.garmentKey === selectedPreview?.garmentKey
      : entry.wearerId === target.wearerId,
  ) ?? target : null;
  const outfitSlot = target ? aiTryOnOutfitTarget(target) : null;
  const outfitChoices = target ? aiTryOnOutfitChoices(target) : { tops: [], bottoms: [] };
  const outfitMode = Boolean(outfitSlot && outfitModeByWearer[target?.wearerId || ""]);
  // Until the customer picks, the pair is the one the current outfit
  // preview was made from (if any), so that preview is shown as current.
  const outfitShownPair = outfitSlot
    ? aiTryOnOutfitPairFor(outfitSlot, previews[outfitSlot.wearerId]?.inputFingerprint) ??
      aiTryOnOutfitPairFor(outfitSlot, stored[outfitSlot.wearerId]?.inputFingerprint)
    : null;
  const outfitSelection = outfitChoicesByWearer[target?.wearerId || ""] ??
    (outfitShownPair ? { top: outfitShownPair.top, bottom: outfitShownPair.bottom } : {});
  const selectedTop = outfitChoices.tops.find((entry) => entry.garmentKey === outfitSelection.top);
  const selectedBottom = outfitChoices.bottoms.find((entry) => entry.garmentKey === outfitSelection.bottom);
  // Deep check M1: the outfit's fingerprint is the chosen pair's.
  const outfitTarget = target && outfitSlot
    ? aiTryOnOutfitTarget(target, selectedTop && selectedBottom ? { top: selectedTop, bottom: selectedBottom } : null)
    : null;
  const previewTarget = outfitMode ? outfitTarget : singlePreviewTarget;
  // Deep check L3: a preview stored under the wearer's own key before it had
  // 2+ garments. It can't be tied to a garment: out of date for the wearer.
  const legacyWearerPreview = Boolean(
    target && (target.previewableGarments?.length ?? 0) > 1 &&
      (stored[target.wearerId] || previews[target.wearerId]),
  );
  const garmentPickerRef = useRef<HTMLFieldSetElement | null>(null);
  const previewKey = previewTarget?.wearerId ?? "";
  const measurementTarget =
    targets.find((entry) => entry.wearerId === measurementWearerId) || target;
  /** This wearer's request is running (other wearers may still be chosen). */
  const generating = jobFor(previewKey)?.status === "running";
  const wearerGenerating = target && aiTryOnOrderPreviewTargets([target]).some((entry) => jobFor(entry.wearerId)?.status === "running");
  const busy = generating && Boolean(jobFor(previewKey)?.busy);

  // Tell the job store who is on screen: a request that ends while its
  // wearer is shown here reports inline, otherwise with a toast.
  useEffect(() => {
    jobStore.setVisibleWearer(previewKey || null);
  }, [jobStore, previewKey]);
  useEffect(() => () => jobStore.setVisibleWearer(null), [jobStore]);
  const showPicker = targets.length > 1;
  // Tries shown = the smaller of the order's and (signed in) the account's.
  const left = Math.min(triesRemaining ?? triesPerOrder, accountTriesRemaining ?? Infinity);
  const outOfPreviews: PanelMessage =
    accountTriesRemaining === 0 ? { kind: "account_out_of_previews" } : { kind: "out_of_previews" };
  const currentPhoto = photo && target && photo.wearerId === target.wearerId ? photo : null;
  const currentModel = target ? findAiTryOnDefaultModel(modelByWearer[target.wearerId]) : null;
  const preview =
    previewTarget && previewTarget.inputFingerprint
      ? previews[previewKey]?.inputFingerprint === previewTarget.inputFingerprint
        ? previews[previewKey]
        : null
      : null;
  const hasPreview = (entry: AiTryOnWearerTarget) =>
    aiTryOnOrderPreviewTargets([entry]).some((item) =>
      aiTryOnPreviewFingerprintIsCurrent(item, previews[item.wearerId]?.inputFingerprint) ||
      aiTryOnPreviewFingerprintIsCurrent(item, stored[item.wearerId]?.inputFingerprint));

  // A session list can arrive after mount (or a later refetch). Adopt it
  // without bringing back a preview the customer deleted here.
  useEffect(() => {
    setStored((current) => {
      let changed = false;
      const next = { ...current };
      for (const entry of storedPreviews) {
        if (dismissedPreviewIdsRef.current.has(entry.previewId)) continue;
        const existing = next[entry.wearerKey];
        if (
          existing &&
          existing.previewId === entry.previewId &&
          existing.inputFingerprint === entry.inputFingerprint &&
          existing.modelId === entry.modelId &&
          existing.expiresAt === entry.expiresAt
        ) {
          continue;
        }
        next[entry.wearerKey] = entry;
        changed = true;
      }
      return changed ? next : current;
    });
    // storedPreviewKey already describes storedPreviews, so a new array with
    // the same summaries does not re-apply them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedPreviewKey]);

  // The design moved on: this wearer's kept image is no longer the one to show.
  useEffect(() => {
    commitPreviews((current) => {
      let changed = false;
      const next = { ...current };
      for (const [wearerId, entry] of Object.entries(current)) {
        const match = previewTargets.find((item) => item.wearerId === wearerId);
        if (!match || !aiTryOnTargetHasDesign(match) || aiTryOnPreviewFingerprintIsCurrent(match, entry.inputFingerprint)) continue;
        delete next[wearerId];
        changed = true;
      }
      return changed ? next : current;
    });
  }, [targets, commitPreviews]);

  // Reload: restore the selected wearer's stored preview while it is valid
  // for that wearer's current design. This reads the private server copy.
  // It does not generate and does not use another try.
  useEffect(() => {
    if (!previewTarget?.inputFingerprint) return;
    const summary = stored[previewKey];
    if (!summary || summary.inputFingerprint !== previewTarget.inputFingerprint) return;
    if (previews[previewKey]?.inputFingerprint === previewTarget.inputFingerprint) return;
    if (restoringRef.current.has(summary.previewId)) return;
    restoringRef.current.add(summary.previewId);
    const wearerId = previewKey;
    const fingerprint = summary.inputFingerprint;
    void loadStoredPreview(summary.previewId).then((image) => {
      restoringRef.current.delete(summary.previewId);
      if (dismissedPreviewIdsRef.current.has(summary.previewId)) return;
      if (!image) {
        setStored((current) => {
          const next = { ...current };
          if (next[wearerId]?.previewId === summary.previewId) delete next[wearerId];
          return next;
        });
        return;
      }
      commitPreviews((current) =>
        current[wearerId]?.inputFingerprint === fingerprint
          ? current
          : {
              ...current,
              [wearerId]: {
                inputFingerprint: fingerprint,
                mimeType: image.mimeType,
                data: image.data,
                storedPreviewId: summary.previewId,
                modelId: summary.modelId ?? null,
              },
            },
      );
      // A restored model preview brings back that wearer's model choice.
      const restoredModelId = summary.modelId;
      if (restoredModelId && findAiTryOnDefaultModel(restoredModelId)) {
        updateModelByWearer((current) =>
          current[target.wearerId] ? current : { ...current, [target.wearerId]: restoredModelId },
        );
        setModelPickerOpen(true);
      }
    });
  }, [previewKey, previewTarget?.inputFingerprint, stored, previews, loadStoredPreview, commitPreviews]);

  const handleDeletePreview = async () => {
    if (!target || !preview?.storedPreviewId || deleting) return;
    const wearerId = previewKey;
    const previewId = preview.storedPreviewId;
    setDeleting(true);
    try {
      const ok = await deleteStoredPreview(previewId);
      if (!ok) {
        setMessage({ kind: "delete_failed" });
        return;
      }
      dismissedPreviewIdsRef.current.add(previewId);
      jobStore.forget(wearerId);
      commitPreviews((current) => {
        const next = { ...current };
        delete next[wearerId];
        return next;
      });
      setStored((current) => {
        const next = { ...current };
        delete next[wearerId];
        return next;
      });
      if (previewableGarments.length <= 1) {
        updateModelByWearer((current) => {
          const next = { ...current };
          delete next[target.wearerId];
          return next;
        });
      }
      setMessage({ kind: "preview_deleted" });
    } finally {
      setDeleting(false);
    }
  };
  const showGarmentPicker = !outfitMode && previewableGarments.length > 1;
  // One Generate sends exactly one catalogue picture and that garment's swatch.
  const garmentImageUrl = outfitMode ? selectedTop?.garmentImageUrl ?? null : selectedPreview ? selectedPreview.garmentImageUrl : target?.garmentImageUrl ?? null;
  const uploadedDesign = outfitMode ? undefined : selectedPreview ? selectedPreview.uploadedDesign : target?.uploadedDesign;
  const fabricSwatchImageUrl = selectedPreview
    ? selectedPreview.fabricSwatchImageUrl
    : target?.fabricSwatchImageUrl ?? null;
  const requestOrderDetails = selectedPreview ? selectedPreview.orderDetails : target?.orderDetails ?? null;
  const missingGarmentImage = Boolean(target && !garmentImageUrl);
  const canGenerate =
    Boolean(previewTarget?.inputFingerprint) &&
    (!outfitMode || Boolean(selectedTop && selectedBottom)) &&
    !missingGarmentImage &&
    Boolean(uploadedDesign ? uploadedDesign.previewUrl && fabricSwatchImageUrl : currentPhoto || currentModel) &&
    !wearerGenerating &&
    !preparingPhoto &&
    left > 0;

  const commitPhoto = (next: SelectedPhoto | null) => {
    if (onSessionPhotoChange) {
      onSessionPhotoChange(next);
      return;
    }
    setUncontrolledPhoto((current) => {
      if (current?.thumbnailUrl && current.thumbnailUrl !== next?.thumbnailUrl) {
        revokeThumbnailUrl(current.thumbnailUrl);
      }
      return next;
    });
  };

  const clearPhoto = () => {
    commitPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectWearer = (wearerId: string) => {
    if (wearerId === selectedWearerId) return;
    // A photo belongs to one person; never carry it to another wearer.
    clearPhoto();
    setPhotoError(null);
    setMessage(left === 0 ? outOfPreviews : null);
    commitWearerId(wearerId);
    // Measurements follow the photo person again. They do not travel with
    // the previous person, and this click does not touch the garment choice.
    commitMeasurementWearerId(wearerId);
    setModelPickerOpen(Boolean(modelByWearer[wearerId]));
  };

  const chooseModel = (modelId: string) => {
    if (!target || generating) return;
    // A wearer uses either a photo or a model, never both.
    clearPhoto();
    setPhotoError(null);
    updateModelByWearer((current) => ({ ...current, [target.wearerId]: modelId }));
  };

  const closeModelPicker = () => {
    if (!target || generating) return;
    setModelPickerOpen(false);
    updateModelByWearer((current) => {
      const next = { ...current };
      delete next[target.wearerId];
      return next;
    });
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file || !target) return;
    setMessage(left === 0 ? outOfPreviews : null);
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
      // A photo replaces this wearer's model choice.
      setModelPickerOpen(false);
      updateModelByWearer((current) => {
        const next = { ...current };
        delete next[target.wearerId];
        return next;
      });
      commitPhoto({ wearerId: target.wearerId, image, thumbnailUrl: createThumbnailUrl(file) });
    } catch (error) {
      clearPhoto();
      setPhotoError(
        error instanceof AiTryOnPhotoError ? error.message : AI_TRY_ON_PHOTO_PROCESSING_ERROR,
      );
    } finally {
      setPreparingPhoto(false);
    }
  };

  /** Applies a settled background job to this panel (once per job). */
  const applyJob = (job: AiTryOnBackgroundJob) => {
    const wearerId = job.wearerId;
    // Tries left come from the response only when it ended while this panel
    // was open; otherwise the step's fresh availability read has them.
    const live = (job.settledAt ?? 0) >= mountedAtRef.current && Boolean(job.outcome);
    const outcome = job.outcome;
    if (job.status === "completed" && job.preview) {
      const preview = job.preview;
      commitPreviews((current) => ({
        ...current,
        [wearerId]: {
          inputFingerprint: job.inputFingerprint,
          mimeType: preview.mimeType,
          data: preview.data,
          storedPreviewId: job.storedPreviewId,
          modelId: job.modelId,
        },
      }));
      // The new preview replaces this wearer's stored one on the server.
      setStored((current) => {
        const next = { ...current };
        delete next[wearerId];
        return next;
      });
      // The photo has done its job; drop it from memory.
      const owner = targets.find((entry) =>
        aiTryOnOrderPreviewTargets([entry]).some((item) => item.wearerId === wearerId),
      );
      const generatedTarget = aiTryOnPreviewTargets(targets).find((entry) => entry.wearerId === wearerId);
      if (!generatedTarget?.uploadedDesign && owner && photoRef.current?.wearerId === owner.wearerId) clearPhoto();
      if (live && outcome?.kind === "completed") {
        setTriesRemaining(
          (current) => outcome.orderTriesRemaining ?? Math.max(0, (current ?? triesPerOrder) - 1),
        );
        if (typeof outcome.accountTriesRemaining === "number") {
          setAccountTriesRemaining(outcome.accountTriesRemaining);
        }
      }
      return;
    }
    if (!live || !outcome) return;
    // Messages show only for the wearer on screen when the request ended.
    const show = (next: PanelMessage) => {
      if (job.seenInline) setMessage(next);
    };
    switch (outcome.kind) {
      case "order_limit_reached":
        setTriesRemaining(0);
        show({ kind: "out_of_previews" });
        break;
      case "account_limit_reached":
        setAccountTriesRemaining(0);
        show({ kind: "account_out_of_previews" });
        break;
      case "rate_limited":
        show({ kind: "too_many_tries" });
        break;
      case "in_progress":
        // Blocked before any charge: tries left are unchanged.
        show({ kind: "in_progress" });
        break;
      case "photo_blocked":
        if (outcome.orderTriesRemaining !== null) setTriesRemaining(outcome.orderTriesRemaining);
        if (typeof outcome.accountTriesRemaining === "number") {
          setAccountTriesRemaining(outcome.accountTriesRemaining);
        }
        show({ kind: "photo_blocked", tryRefunded: outcome.tryRefunded });
        break;
      case "failed": {
        const remaining = outcome.orderTriesRemaining ?? triesRemaining ?? triesPerOrder;
        const accountRemaining =
          typeof outcome.accountTriesRemaining === "number"
            ? outcome.accountTriesRemaining
            : accountTriesRemaining;
        setTriesRemaining(remaining);
        setAccountTriesRemaining(accountRemaining);
        show({ kind: "failed", left: Math.min(remaining, accountRemaining ?? Infinity), tryRefunded: outcome.tryRefunded });
        break;
      }
      case "busy_failed":
        if (outcome.orderTriesRemaining !== null) setTriesRemaining(outcome.orderTriesRemaining);
        if (typeof outcome.accountTriesRemaining === "number") {
          setAccountTriesRemaining(outcome.accountTriesRemaining);
        }
        show({ kind: "busy_failed", tryRefunded: outcome.tryRefunded });
        break;
      case "busy":
        // Never settles a job (the store keeps retrying).
        break;
      case "unavailable":
        onUnavailableRef.current();
        break;
    }
  };

  useEffect(() => {
    for (const job of Object.values(jobs)) {
      if (job.scope !== jobScope || job.status === "running" || job.appliedByPanel) continue;
      if (!previewTargets.some((entry) => entry.wearerId === job.wearerId)) continue;
      jobStore.markAppliedByPanel(job.wearerId);
      applyJob(job);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, jobScope, targets]);

  // Leaving Try-on marks the job applied, which drops the panel's copy of
  // the image. The job still holds it. Put that image back when the wearer
  // design still matches, without clearing the photo or charging a try.
  useEffect(() => {
    for (const job of Object.values(jobs)) {
      if (job.scope !== jobScope || job.status !== "completed" || !job.preview) continue;
      if (job.storedPreviewId && dismissedPreviewIdsRef.current.has(job.storedPreviewId)) continue;
      const match = previewTargets.find((entry) => entry.wearerId === job.wearerId);
      if (!match || !aiTryOnPreviewFingerprintIsCurrent(match, job.inputFingerprint)) continue;
      const image = job.preview;
      commitPreviews((current) =>
        current[job.wearerId]?.inputFingerprint === job.inputFingerprint && current[job.wearerId]?.data
          ? current
          : {
              ...current,
              [job.wearerId]: {
                inputFingerprint: job.inputFingerprint,
                mimeType: image.mimeType,
                data: image.data,
                storedPreviewId: job.storedPreviewId,
                modelId: job.modelId,
              },
            },
      );
    }
  }, [jobs, jobScope, targets, commitPreviews]);

  // "View preview" from a toast: show that wearer, then scroll to and
  // briefly highlight the preview.
  const focusJob = Object.values(jobs).find(
    (job) => job.scope === jobScope && job.focusRequested && previewTargets.some((entry) => entry.wearerId === job.wearerId),
  );
  useEffect(() => {
    if (!focusJob) return;
    if (focusJob.wearerId !== previewKey) {
      const owner = targets.find((entry) => aiTryOnOrderPreviewTargets([entry]).some((item) => item.wearerId === focusJob.wearerId));
      if (!owner) return;
      if (owner.wearerId !== target?.wearerId) selectWearer(owner.wearerId);
      const garment = previewTargets.find((entry) => entry.wearerId === focusJob.wearerId)?.previewableGarments?.[0];
      setOutfitModeByWearer((current) => ({ ...current, [owner.wearerId]: previewTargets.find((entry) => entry.wearerId === focusJob.wearerId)?.previewKind === "outfit" }));
      if (garment) setSelectedGarmentKeyByWearer((current) => ({ ...current, [owner.wearerId]: garment.garmentKey }));
      return;
    }
    // "Try again" (or a preview that no longer matches): show the wearer only.
    if (focusJob.status !== "completed" || !preview) {
      if (focusJob.status === "completed" && focusJob.inputFingerprint === previewTarget?.inputFingerprint) return;
      jobStore.clearFocus(focusJob.wearerId);
      return;
    }
    jobStore.clearFocus(focusJob.wearerId);
    // After the step's own scroll to its top has run. Not tied to this
    // effect's cleanup: clearing the request above re-runs it.
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = null;
      resultRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      setHighlightResult(true);
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusJob?.wearerId, focusJob?.focusRequested, previewKey, preview]);
  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!highlightResult) return;
    const timer = setTimeout(() => setHighlightResult(false), 2400);
    return () => clearTimeout(timer);
  }, [highlightResult]);

  const handleGenerate = () => {
    if (!target || !previewTarget?.inputFingerprint || !garmentImageUrl) return;
    if (outfitMode && (!selectedTop || !selectedBottom)) return;
    const model = uploadedDesign || currentPhoto ? null : currentModel;
    if (uploadedDesign ? !uploadedDesign.previewUrl || !fabricSwatchImageUrl : !currentPhoto && !model) return;
    if (left <= 0) { setMessage(outOfPreviews); return; }
    if (aiTryOnOrderPreviewTargets([target]).some((entry) => jobStore.isRunning(entry.wearerId))) return;
    const wearerId = previewKey;
    const inputFingerprint = previewTarget.inputFingerprint;
    setMessage(null);
    if (!uploadedDesign && currentPhoto && !fitsAiTryOnTotalLimit([currentPhoto.image])) {
      setMessage({ kind: "failed", left }); return;
    }
    const photoFitHints = measurementTarget?.fitHints ?? [];
    const outfitGarments: AiTryOnGenerationRequest["outfitGarments"] = selectedTop && selectedBottom
      ? [buildAiTryOnOutfitRequestGarment(selectedTop), buildAiTryOnOutfitRequestGarment(selectedBottom)] : undefined;
    const photoRequest = (): AiTryOnGenerationRequest => {
      const common = {
        inputFingerprint, wearerKey: wearerId,
        ...(model ? { defaultModelId: model.id } : currentPhoto ? { personImage: currentPhoto.image } : {}),
        ...(!model && photoFitHints.length ? { fitHints: photoFitHints } : {}),
      };
      return outfitMode && outfitGarments ? { ...common, mode: "garment", outfitGarments } : {
        ...common, mode: fabricSwatchImageUrl ? "fabric" : "garment", garmentImageUrl,
        ...(fabricSwatchImageUrl ? { fabricSwatchImageUrl } : {}),
        ...(requestOrderDetails ? { orderDetails: requestOrderDetails } : {}),
      };
    };
    const request: Promise<AiTryOnGenerationRequest> = uploadedDesign
      ? loadUploadedDesign(uploadedDesign.previewUrl).then((image) => ({
          mode: "fabric", inputFingerprint, wearerKey: wearerId,
          uploadedDesignImage: image, uploadedGarmentType: uploadedDesign.garmentType, fabricSwatchImageUrl,
        })) : Promise.resolve(photoRequest());
    // The request belongs to the job store, not this panel: it keeps going
    // when the customer moves to another step.
    jobStore.start({
      wearerId,
      wearerName: previewTargets.length > 1 ? previewTarget?.label ?? target.label : null,
      inputFingerprint,
      scope: jobScope,
      modelId: model ? model.id : null,
      run: async (busyJobId) => {
        const prepared = await request;
        const outcome = await requestPreview(busyJobId ? { ...prepared, busyJobId } : prepared);
        if (outcome.kind === "completed") {
          onPreviewCreatedRef.current({
            wearerId,
            resultReference: outcome.resultReference,
            inputFingerprint,
          });
        }
        return outcome;
      },
      giveUpBusy: (jobId) => releaseBusyJob(jobId, wearerId),
    });
  };

  if (!target) return null;

  const triesLabel = `${left} ${left === 1 ? "try" : "tries"} left`;

  const consentNotice = (
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
  );
  return (
    <div className="space-y-5" data-ai-try-on-panel="live">
      {showPicker && (
        <fieldset className="min-w-0">
          <legend className="font-serif text-lg font-bold text-heritage-green">
            Who's this for?
          </legend>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
            {uploadedDesign ? "Choose whose garment this preview belongs to. The photo uses the person in the uploaded picture." : "Choose the person in the photo. We'll use only their garments, fabric and details."}
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
                  onClick={() => selectWearer(entry.wearerId)}
                  data-wearer-chip={entry.wearerId}
                  className={tryOnChoiceChipClass(selected)}
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

      {showPicker && !uploadedDesign && (
        <fieldset className="min-w-0" data-ai-try-on-measurement-picker>
          <legend className="font-serif text-lg font-bold text-heritage-green">
            Whose measurements?
          </legend>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
            Choose whose fit measurements to send with a photo preview. This does not change the
            photo or the garment.
          </p>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Whose measurements?"
          >
            {targets.map((entry) => {
              const selected = entry.wearerId === measurementWearerId;
              return (
                <button
                  key={entry.wearerId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => commitMeasurementWearerId(entry.wearerId)}
                  data-ai-try-on-measurement-wearer={entry.wearerId}
                  className={tryOnChoiceChipClass(selected)}
                >
                  <span className="min-w-0 truncate">{entry.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {outfitSlot && <fieldset className="space-y-3 rounded-xl border border-heritage-gold/30 p-4" data-ai-try-on-outfit-controls>
        <legend className="px-1 font-serif text-lg font-bold text-heritage-green">What would you like to preview?</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!outfitMode} onClick={() => setOutfitModeByWearer((current) => ({ ...current, [target.wearerId]: false }))} className={tryOnChoiceChipClass(!outfitMode)} data-ai-try-on-single-mode>One garment</button>
          <button type="button" aria-pressed={outfitMode} onClick={() => setOutfitModeByWearer((current) => ({ ...current, [target.wearerId]: true }))} className={tryOnChoiceChipClass(outfitMode)} data-ai-try-on-outfit-mode>Combined outfit · 1 try</button>
        </div>
        {outfitMode && <>
          <p className="text-sm leading-relaxed text-heritage-ink/75">Choose exactly one top and one bottom for this wearer, using the same photo or studio model. Only your chosen garments are included. One combined picture uses 1 try from this order’s shared tries. Your individual previews stay saved separately.</p>
          {(["top", "bottom"] as const).map((part) => <label key={part} className="block text-sm font-semibold text-heritage-green">
            Choose a {part}
            <select value={outfitSelection[part] ?? ""} data-ai-try-on-outfit-choice={part} onChange={(event) => { const key = event.target.value; setOutfitChoicesByWearer((current) => ({ ...current, [target.wearerId]: { ...outfitSelection, [part]: key } })); }} className="mt-1 block min-h-11 w-full rounded-xl border border-heritage-green/25 bg-white px-3 text-sm">
              <option value="">Select a {part}</option>
              {(part === "top" ? outfitChoices.tops : outfitChoices.bottoms).map((garment) => <option key={garment.garmentKey} value={garment.garmentKey}>{garment.label}</option>)}
            </select>
          </label>)}
        </>}
      </fieldset>}

      {legacyWearerPreview && target && (
        <div className="rounded-xl border border-heritage-gold/35 bg-heritage-gold/8 p-3" data-ai-try-on-legacy-preview-stale={target.wearerId}>
          <p className="text-xs font-bold text-heritage-green">{AI_TRY_ON_ORDER_IMAGE_COPY.staleTitle(target.label)}</p>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/70">{AI_TRY_ON_ORDER_IMAGE_COPY.staleBodyInPanel}</p>
          <button
            type="button"
            data-ai-try-on-legacy-make-new
            onClick={() => {
              const picker = garmentPickerRef.current;
              picker?.scrollIntoView?.({ behavior: "smooth", block: "center" });
              (picker?.querySelector?.("button") as HTMLButtonElement | null)?.focus?.();
            }}
            className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/30 px-3 text-xs font-bold uppercase tracking-wide text-heritage-green hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            {AI_TRY_ON_ORDER_IMAGE_COPY.staleAction}
          </button>
        </div>
      )}
      {showGarmentPicker && (
        <fieldset ref={garmentPickerRef} className="min-w-0" data-ai-try-on-garment-picker>
          <legend className="font-serif text-lg font-bold text-heritage-green">
            Which garment?
          </legend>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
            This preview uses one garment and its fabric. Each preview uses one try from this order’s {triesPerOrder} tries, shared across all garments and wearers.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Which garment?">
            {previewableGarments.map((garment) => {
              const selected = garment.garmentKey === selectedPreview?.garmentKey;
              const swatchClass = "h-7 w-7 shrink-0 rounded-full border border-heritage-gold/40 object-cover";
              return (
                <button
                  key={garment.garmentKey}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() =>
                    setSelectedGarmentKeyByWearer((current) =>
                      current[target.wearerId] === garment.garmentKey
                        ? current
                        : { ...current, [target.wearerId]: garment.garmentKey },
                    )
                  }
                  data-ai-try-on-garment={garment.garmentKey}
                  className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold ${
                    selected
                      ? "border-heritage-green bg-heritage-green text-white"
                      : "border-heritage-green/25 bg-white text-heritage-green hover:border-heritage-green/50"
                  }`}
                >
                  {garment.fabricSwatchImageUrl ? (
                    <img src={garment.fabricSwatchImageUrl} alt="" className={swatchClass} />
                  ) : garment.fabricColorHex ? (
                    <span
                      aria-hidden="true"
                      data-ai-try-on-garment-swatch="color"
                      className={`${swatchClass} inline-block`}
                      style={{ backgroundColor: garment.fabricColorHex }}
                    />
                  ) : (
                    <img src={garment.garmentImageUrl} alt="" className={swatchClass} />
                  )}
                  <span className="min-w-0 truncate">{garment.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {uploadedDesign && (
        <section className="space-y-3 rounded-xl border border-heritage-gold/30 bg-heritage-cream/30 p-4" data-ai-try-on-uploaded-design>
          <h3 className="font-serif text-lg font-bold text-heritage-green">Your uploaded design</h3>
          {uploadedDesign.previewUrl ? <img src={uploadedDesign.previewUrl} alt="Your uploaded design photograph" className="max-h-80 w-full rounded-xl object-contain" /> : <p role="status">Your uploaded design photo is not available. Return to Step 3 to upload it again.</p>}
          <p className="text-sm leading-relaxed text-heritage-ink/80">This shows the person in your uploaded picture, not you. Only the garment’s fabric will change to your chosen swatch.</p>
          {/* Deep check M2: the uploaded picture also goes to Gemini, so the
              same consent notice as photo mode shows before generating. */}
          {consentNotice}
          <button type="button" data-ai-try-on-upload-another-design disabled={Boolean(wearerGenerating) || !onUploadAnotherDesign} onClick={() => onUploadAnotherDesign?.(uploadedDesign.garmentKey)} className="inline-flex min-h-11 items-center rounded-xl border border-heritage-green/30 bg-white px-4 text-sm font-semibold text-heritage-green disabled:opacity-50">Upload another design</button>
          {!fabricSwatchImageUrl && <p role="status" className="text-sm text-heritage-ink/80">Choose a fabric with a swatch image in Step 2 to use this design.</p>}
        </section>
      )}
      {!uploadedDesign && !currentModel && (
        <>
        {consentNotice}

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
        </>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {!uploadedDesign && <>
          <input
            ref={fileInputRef}
            id={photoInputId}
            type="file"
            accept={AI_TRY_ON_PHOTO_ACCEPT}
            className="sr-only"
            disabled={generating || preparingPhoto || missingGarmentImage}
            onChange={handlePhotoChange}
          />
          <div className="grid min-w-0 gap-3 sm:grid-cols-2" data-ai-try-on-source-cards>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={generating || preparingPhoto || missingGarmentImage}
              aria-pressed={Boolean(currentPhoto) && !currentModel}
              data-ai-try-on-photo-option
              className={`flex min-h-28 min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                currentPhoto && !currentModel
                  ? "border-heritage-gold bg-heritage-gold/10 shadow-sm ring-1 ring-heritage-gold/40"
                  : "border-heritage-green/15 bg-white hover:border-heritage-gold/45"
              }`}
            >
              {preparingPhoto ? <Loader2 aria-hidden="true" size={22} className="shrink-0 animate-spin text-heritage-green" /> : <ImagePlus aria-hidden="true" size={22} className="shrink-0 text-heritage-green" />}
              <span className="min-w-0">
                <span className="block font-serif text-lg font-bold text-heritage-green">Upload a photo</span>
                <span className="mt-1 block text-sm leading-relaxed text-heritage-ink/70">{currentPhoto ? "Change your photo to try another." : "See the design on a photo of you."}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              disabled={generating || missingGarmentImage}
              aria-pressed={Boolean(currentModel)}
              aria-expanded={modelPickerOpen}
              data-ai-try-on-model-option
              className={`flex min-h-28 min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                currentModel || modelPickerOpen
                  ? "border-heritage-gold bg-heritage-gold/10 shadow-sm ring-1 ring-heritage-gold/40"
                  : "border-heritage-green/15 bg-white hover:border-heritage-gold/45"
              }`}
            >
              <UserRound aria-hidden="true" size={22} className="shrink-0 text-heritage-green" />
              <span className="min-w-0">
                <span className="block font-serif text-lg font-bold text-heritage-green">{AI_TRY_ON_MODEL_COPY.option}</span>
                <span className="mt-1 block text-sm leading-relaxed text-heritage-ink/70">See the design on one of our studio models.</span>
              </span>
            </button>
          </div>
          {modelPickerOpen && (
            <fieldset className="min-w-0 rounded-xl border border-heritage-green/15 bg-white p-4" data-ai-try-on-model-picker>
              <legend className="px-1 font-serif text-lg font-bold text-heritage-green">
                {AI_TRY_ON_MODEL_COPY.heading}
              </legend>
              <p className="text-sm leading-relaxed text-heritage-ink/70">{AI_TRY_ON_MODEL_COPY.intro}</p>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`${AI_TRY_ON_MODEL_COPY.heading}: filter`}>
                {(["all", "men", "women"] as const).map((group) => (
                  <button
                    key={group}
                    type="button"
                    role="radio"
                    aria-checked={modelFilter === group}
                    onClick={() => setModelFilter(group)}
                    data-ai-try-on-model-filter={group}
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-bold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold ${
                      modelFilter === group
                        ? "border-heritage-green bg-heritage-green text-white"
                        : "border-heritage-green/25 bg-white text-heritage-green hover:border-heritage-green/50"
                    }`}
                  >
                    {group === "all" ? AI_TRY_ON_MODEL_COPY.filterAll : AI_TRY_ON_MODEL_GROUP_LABELS[group]}
                  </button>
                ))}
              </div>
              {(["men", "women"] as const)
                .filter((group) => modelFilter === "all" || modelFilter === group)
                .map((group) => (
                  <div key={group} className="mt-4" data-ai-try-on-model-group={group}>
                    <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-heritage-gold">
                      {AI_TRY_ON_MODEL_GROUP_LABELS[group]}
                    </h4>
                    <div
                      className="mt-2 flex gap-3 overflow-x-auto pb-2"
                      role="radiogroup"
                      aria-label={`${AI_TRY_ON_MODEL_COPY.heading}: ${AI_TRY_ON_MODEL_GROUP_LABELS[group]}`}
                    >
                      {AI_TRY_ON_DEFAULT_MODELS.filter((entry) => entry.group === group).map((entry) => {
                        const selected = currentModel?.id === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={generating}
                            onClick={() => chooseModel(entry.id)}
                            data-ai-try-on-model={entry.id}
                            className={`relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-xl border-2 p-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected ? "border-heritage-green bg-heritage-cream/50" : "border-transparent hover:border-heritage-green/30"
                            }`}
                          >
                            <img
                              src={aiTryOnDefaultModelImageUrl(entry)}
                              alt=""
                              loading="lazy"
                              width={88}
                              height={120}
                              className="h-[7.5rem] w-[5.5rem] rounded-lg bg-heritage-cream/40 object-cover"
                            />
                            <span className="text-[11px] leading-tight text-heritage-ink/80">{entry.label}</span>
                            {selected && <span className="sr-only">(selected)</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              <button
                type="button"
                onClick={closeModelPicker}
                disabled={generating}
                data-ai-try-on-model-close
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-heritage-green underline underline-offset-2 hover:text-heritage-gold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {AI_TRY_ON_MODEL_COPY.usePhotoInstead}
              </button>
            </fieldset>
          )}
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
          </>}
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
            <span>{uploadedDesign ? "Use this design" : outfitMode ? "Generate combined outfit" : preview ? "Make a new preview" : "Generate preview"}</span>
            <span className="font-medium normal-case tracking-normal text-white/80">· {triesLabel}</span>
          </button>
          <p className="text-xs leading-relaxed text-heritage-ink/70" data-ai-try-on-order-tries-note>
            {triesPerOrder} tries per order, shared across all garments and wearers—not {triesPerOrder} per garment. Account limits also apply.
          </p>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {generating && (
          <div
            className="flex items-center gap-3 rounded-xl border border-heritage-gold/30 bg-heritage-cream/40 p-4"
            data-ai-try-on-loading={busy ? "busy" : ""}
          >
            <Loader2 aria-hidden="true" size={20} className="shrink-0 animate-spin text-heritage-green" />
            <p className="text-sm text-heritage-ink/80">
              {busy
                ? AI_TRY_ON_BACKGROUND_COPY.panelBusy
                : AI_TRY_ON_BACKGROUND_COPY.panelGenerating(targets.length > 1 ? target.label : null)}
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
        <figure
          ref={resultRef}
          className={`space-y-3 rounded-2xl transition-shadow duration-500 ${
            highlightResult ? "ring-4 ring-heritage-gold/70 ring-offset-4" : ""
          }`}
          data-ai-try-on-result
          data-ai-try-on-highlight={highlightResult ? "true" : undefined}
        >
          <img
            src={`data:${preview.mimeType};base64,${preview.data}`}
            alt={`AI try-on preview for ${target.label}`}
            className="mx-auto max-h-[32rem] w-auto max-w-full rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 object-contain"
          />
          <figcaption className="space-y-1 text-xs leading-relaxed text-heritage-ink/65">
            {uploadedDesign && <span className="block font-semibold text-heritage-green" data-ai-try-on-shown-on-uploaded-design>on your uploaded design — this shows the person in your uploaded picture, not you.</span>}
            {outfitMode && <span className="block font-semibold text-heritage-green" data-ai-try-on-outfit-preview>Latest combined outfit preview. Individual garment previews are kept separately.</span>}
            {preview.modelId && (
              <span className="block font-semibold text-heritage-green" data-ai-try-on-shown-on-model>
                {AI_TRY_ON_MODEL_COPY.shownOnModel}
              </span>
            )}
            <span className="block">{AI_TRY_ON_PREVIEW_DISCLAIMER}</span>
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
