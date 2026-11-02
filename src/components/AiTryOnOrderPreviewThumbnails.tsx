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

type LoadImage = (previewId: string) => Promise<{ mimeType: string; data: string } | null>;

const Thumbnail = ({
  entry,
  loadImage,
}: {
  entry: Extract<AiTryOnOrderPreviewEntry, { kind: "fresh" }>;
  loadImage: LoadImage;
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
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <img
            src={src}
            alt={COPY.thumbnailAlt(entry.label)}
            className="h-32 w-auto max-w-full rounded-xl border border-heritage-gold/25 bg-heritage-cream/30 object-contain"
          />
        </button>
      ) : (
        <div aria-hidden="true" className="h-32 w-24 animate-pulse rounded-xl bg-heritage-cream/60" />
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
}: {
  entries: readonly AiTryOnOrderPreviewEntry[];
  loadImage: LoadImage;
  onMakeNew: (wearerId: string) => void;
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
          <div className="flex min-w-0 flex-wrap gap-4">
            {fresh.map((entry) => (
              <Thumbnail key={entry.previewId} entry={entry} loadImage={loadImage} />
            ))}
          </div>
          <p className="text-xs leading-relaxed text-heritage-ink/60">{AI_TRY_ON_PREVIEW_DISCLAIMER}</p>
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
