import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { AI_TRY_ON_ORDER_IMAGE_COPY as COPY } from "../utils/aiTryOnOrderImageCopy";
import { AI_TRY_ON_PREVIEW_DISCLAIMER } from "./AiTryOnPhotoPanel";

/** A wearer of the order as it is now (from the AI Try-on targets). */
export interface AiTryOnOrderPreviewTarget {
  readonly wearerId: string;
  readonly label: string;
  /** The wearer's current design; a preview of another design is out of date. */
  readonly inputFingerprint: string;
}

/** A stored preview summary, as `POST /api/ai-try-on?action=session` lists it. */
export interface AiTryOnOrderPreviewSummary {
  readonly previewId: string;
  readonly wearerKey: string;
  readonly inputFingerprint: string;
  readonly modelId?: string;
}

export type AiTryOnOrderPreviewEntry =
  | {
      kind: "fresh";
      wearerId: string;
      label: string;
      previewId: string;
      onModel: boolean;
    }
  | { kind: "stale"; wearerId: string; label: string };

/**
 * One entry per wearer that has a stored preview, in the order's wearer
 * order. A preview made for an earlier version of the wearer's design is
 * "stale": it is never shown as the design, only as a suggestion to make a
 * new one. Wearers without a preview get no entry.
 */
export const selectAiTryOnOrderPreviews = (
  targets: readonly AiTryOnOrderPreviewTarget[],
  previews: readonly AiTryOnOrderPreviewSummary[],
): AiTryOnOrderPreviewEntry[] =>
  targets.flatMap((target): AiTryOnOrderPreviewEntry[] => {
    const preview = previews.find((entry) => entry.wearerKey === target.wearerId);
    if (!preview) return [];
    return preview.inputFingerprint === target.inputFingerprint
      ? [
          {
            kind: "fresh",
            wearerId: target.wearerId,
            label: target.label,
            previewId: preview.previewId,
            onModel: Boolean(preview.modelId),
          },
        ]
      : [{ kind: "stale", wearerId: target.wearerId, label: target.label }];
  });

/**
 * Large preview, shared by Summary, Review & Payment and the order views
 * after payment: the full width of its column, 2:3 (the try-on output
 * shape), never cropped, at most 560px tall.
 */
export const AI_TRY_ON_ORDER_IMAGE_CLASS =
  "mx-auto block aspect-[2/3] h-auto max-h-[560px] w-full max-w-full rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 object-contain";

/**
 * Summary only. The shared class caps height at 560px, which letterboxes a
 * portrait try-on photo inside a wide card. Summary uses the photo's own
 * shape, full card width, and does not crop it.
 */
export const AI_TRY_ON_SUMMARY_IMAGE_CLASS =
  "mx-auto block h-auto w-full max-w-full rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 object-contain";

export type AiTryOnOrderLoadImage = (previewId: string) => Promise<{ mimeType: string; data: string } | null>;

export const AiTryOnOrderPreviewImage = ({
  entry,
  loadImage,
  imageClassName = AI_TRY_ON_ORDER_IMAGE_CLASS,
}: {
  entry: Extract<AiTryOnOrderPreviewEntry, { kind: "fresh" }>;
  loadImage: AiTryOnOrderLoadImage;
  imageClassName?: string;
}) => {
  const [image, setImage] = useState<{ mimeType: string; data: string } | null | "loading">("loading");
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setImage("loading");
    void loadImage(entry.previewId).then((loaded) => {
      if (!cancelled) setImage(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.previewId, loadImage]);
  const caption = entry.onModel ? COPY.thumbnailLabelOnModel(entry.label) : COPY.thumbnailLabel(entry.label);
  if (image === null) return null;
  const src = image === "loading" ? null : `data:${image.mimeType};base64,${image.data}`;
  return (
    <figure
      className="min-w-0 space-y-2"
      data-ai-try-on-order-preview={entry.wearerId}
      data-ai-try-on-order-preview-on-model={entry.onModel ? "true" : undefined}
    >
      <figcaption className="text-xs font-bold text-heritage-green">{caption}</figcaption>
      {src ? (
        <button
          type="button"
          onClick={() => setEnlarged(true)}
          aria-label={COPY.enlarge(entry.label)}
          className="block w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <img
            src={src}
            alt={COPY.thumbnailAlt(entry.label)}
            className={imageClassName}
          />
        </button>
      ) : (
        <div aria-hidden="true" className={`${imageClassName} animate-pulse bg-heritage-cream/60`} />
      )}
      {enlarged && src ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={caption}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEnlarged(false)}
          data-ai-try-on-order-preview-enlarged
        >
          <div className="relative max-h-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setEnlarged(false)}
              className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/90 text-heritage-green"
              aria-label={COPY.closeEnlarged}
            >
              <X aria-hidden="true" size={18} />
            </button>
            <img
              src={src}
              alt={COPY.thumbnailAlt(entry.label)}
              className="max-h-[80vh] w-auto max-w-full rounded-2xl bg-white object-contain"
            />
          </div>
        </div>
      ) : null}
    </figure>
  );
};

/**
 * Summary (Step 8) and Order Review & Payment (Step 10), before payment:
 * the wearers' current AI previews as small thumbnails, read through the
 * owner-only preview route. Renders nothing when no wearer has a preview.
 */
export const AiTryOnOrderPreviewThumbnails = ({
  entries,
  loadImage,
  onMakeNew,
  notice,
  fullCardWidth = false,
}: {
  entries: readonly AiTryOnOrderPreviewEntry[];
  loadImage: AiTryOnOrderLoadImage;
  onMakeNew: (wearerId: string) => void;
  /** Shown under the fresh previews (Review & Payment: what happens at payment). */
  notice?: string;
  /**
   * Summary stacks every saved photo at the full width of the AI Try-on card.
   * Review keeps the two-column wrap.
   */
  fullCardWidth?: boolean;
}) => {
  if (entries.length === 0) return null;
  const fresh = entries.filter(
    (entry): entry is Extract<AiTryOnOrderPreviewEntry, { kind: "fresh" }> => entry.kind === "fresh",
  );
  const stale = entries.filter((entry) => entry.kind === "stale");
  return (
    <div className="mt-3 min-w-0 space-y-3" data-ai-try-on-order-previews>
      {fresh.length > 0 ? (
        <>
          <div
            className={`grid min-w-0 gap-4 ${!fullCardWidth && fresh.length > 1 ? "sm:grid-cols-2" : ""}`}
            data-ai-try-on-order-preview-count={fresh.length}
          >
            {fresh.map((entry) => (
              <AiTryOnOrderPreviewImage
                key={entry.previewId}
                entry={entry}
                loadImage={loadImage}
                imageClassName={fullCardWidth ? AI_TRY_ON_SUMMARY_IMAGE_CLASS : AI_TRY_ON_ORDER_IMAGE_CLASS}
              />
            ))}
          </div>
          <p className="text-xs leading-relaxed text-heritage-ink/60">{AI_TRY_ON_PREVIEW_DISCLAIMER}</p>
          {notice ? (
            <p
              className="rounded-xl border border-heritage-green/20 bg-heritage-green/5 p-3 text-xs leading-relaxed text-heritage-ink/75"
              data-ai-try-on-order-saved-notice
            >
              {notice}
            </p>
          ) : null}
        </>
      ) : null}
      {stale.map((entry) => (
        <div
          key={entry.wearerId}
          className="min-w-0 rounded-xl border border-heritage-gold/35 bg-heritage-gold/8 p-3"
          data-ai-try-on-order-preview-stale={entry.wearerId}
        >
          <p className="text-xs font-bold text-heritage-green">{COPY.staleTitle(entry.label)}</p>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/70">{COPY.staleBody}</p>
          <button
            type="button"
            onClick={() => onMakeNew(entry.wearerId)}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-heritage-green/30 px-3 text-xs font-bold uppercase tracking-wide text-heritage-green hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            <RefreshCw aria-hidden="true" size={14} />
            {COPY.staleAction}
          </button>
        </div>
      ))}
    </div>
  );
};
