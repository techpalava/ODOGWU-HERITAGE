import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { AI_TRY_ON_ORDER_IMAGE_COPY as COPY } from "../utils/aiTryOnOrderImageCopy";
import { AI_TRY_ON_PREVIEW_DISCLAIMER } from "./AiTryOnPhotoPanel";
import { AiTryOnOrderPreviewImage } from "./AiTryOnOrderPreviewThumbnails";
import {
  createAiTryOnOrderImageService,
  type AiTryOnOrderImageService,
  type AiTryOnOrderImagesSummary,
} from "../services/aiTryOnOrderImages";

/**
 * The AI preview saved with a paid order, after payment: the confirmation
 * panel and My Orders (customer, with "Delete AI preview" in My Orders) and
 * the admin / tailor order view (with "Delete AI preview", used when an
 * order is cancelled or refunded; the server allows only the owner or an
 * admin, and nothing deletes automatically). Same large image as Summary and Review
 * (AI_TRY_ON_ORDER_IMAGE_CLASS); several wearers side by side, wrapping.
 */
export type AiTryOnOrderImagePanelVariant = "confirmation" | "customer" | "admin";

export const CONFIRMATION_RETRY_MS = 4000;

const formatExpiry = (iso: string | null): string => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";
};

export const AiTryOnOrderImagePanel = ({
  orderId,
  variant,
  service: providedService,
}: {
  orderId: string;
  variant: AiTryOnOrderImagePanelVariant;
  service?: AiTryOnOrderImageService;
}) => {
  const service = useMemo(() => providedService ?? createAiTryOnOrderImageService(), [providedService]);
  const [summary, setSummary] = useState<AiTryOnOrderImagesSummary | null | "loading">("loading");
  const [imageFailed, setImageFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<"deleted" | "failed" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary("loading");
    setImageFailed(false);
    let retry: ReturnType<typeof setTimeout> | undefined;
    void service.list(orderId).then((loaded) => {
      if (cancelled) return;
      setSummary(loaded);
      // Right after payment the copy may still be running: look once more.
      if (variant === "confirmation" && loaded?.status === "none") {
        retry = setTimeout(() => {
          void service.list(orderId).then((again) => {
            if (!cancelled && again) setSummary(again);
          });
        }, CONFIRMATION_RETRY_MS);
      }
    });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [orderId, service, variant]);

  const loadImage = useCallback(
    async (wearerKey: string) => {
      const image = await service.image(orderId, wearerKey);
      if (!image) setImageFailed(true);
      return image;
    },
    [orderId, service],
  );

  const confirmDelete = async () => {
    setDeleting(true);
    const ok = await service.remove(orderId);
    setDeleting(false);
    setConfirming(false);
    if (ok) {
      setSummary({ status: "deleted", expiresAt: null, images: [] });
      setMessage("deleted");
    } else {
      setMessage("failed");
    }
  };

  if (summary === "loading") return null;
  const isAdmin = variant === "admin";
  const status = summary?.status ?? null;
  // Customers see nothing for an order that never had a preview.
  if (!isAdmin && status === "none") return null;

  const title = isAdmin ? COPY.adminSectionTitle : COPY.orderImageSectionTitle;
  const body = (() => {
    if (summary === null) return <p className="text-xs text-heritage-ink/70">{COPY.orderImageUnavailable}</p>;
    if (status === "saved" && summary.images.length > 0) {
      return (
        <>
          <div
            className={`grid min-w-0 gap-4 ${summary.images.length > 1 ? "sm:grid-cols-2" : ""}`}
            data-ai-try-on-order-image-count={summary.images.length}
          >
            {summary.images.map((image) => (
              <AiTryOnOrderPreviewImage
                key={image.wearerKey}
                entry={{ kind: "fresh", wearerId: image.wearerKey, previewId: image.wearerKey, label: image.label, onModel: image.onModel }}
                loadImage={loadImage}
              />
            ))}
          </div>
          {imageFailed ? <p className="text-xs text-heritage-ink/70">{COPY.orderImageUnavailable}</p> : null}
          {isAdmin ? null : (
            <>
              <p className="text-xs leading-relaxed text-heritage-ink/60">{AI_TRY_ON_PREVIEW_DISCLAIMER}</p>
              <p className="text-xs leading-relaxed text-heritage-ink/75" data-ai-try-on-order-image-saved-note>
                {COPY.orderImageSavedNote(formatExpiry(summary.expiresAt))}
              </p>
            </>
          )}
          {variant === "customer" || variant === "admin" ? (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setConfirming(true);
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-700/30 px-3 text-xs font-bold uppercase tracking-wide text-red-800 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
              data-ai-try-on-order-image-delete
            >
              <Trash2 aria-hidden="true" size={14} />
              {COPY.deleteButton}
            </button>
          ) : null}
        </>
      );
    }
    if (isAdmin) return <p className="text-xs text-heritage-ink/70">{COPY.adminNoImage}</p>;
    if (status === "deleted") return <p className="text-xs text-heritage-ink/70">{COPY.orderImageDeletedNote}</p>;
    if (status === "expired") return <p className="text-xs text-heritage-ink/70">{COPY.orderImageExpiredNote}</p>;
    return <p className="text-xs text-heritage-ink/70">{COPY.orderImageUnavailable}</p>;
  })();

  return (
    <section
      className="min-w-0 space-y-3 rounded-2xl border border-heritage-gold/25 bg-white p-4"
      aria-label={title}
      data-ai-try-on-order-image-panel={variant}
      data-ai-try-on-order-image-status={status ?? "unavailable"}
    >
      <h3 className="text-sm font-bold text-heritage-green">{title}</h3>
      {isAdmin ? <p className="text-xs leading-relaxed text-heritage-ink/70">{COPY.adminSectionNote}</p> : null}
      {body}
      {message ? (
        <p role="status" className="text-xs font-semibold text-heritage-green" data-ai-try-on-order-image-message={message}>
          {message === "deleted" ? COPY.deleteSuccess : COPY.deleteFailed}
        </p>
      ) : null}
      {confirming ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`ai-try-on-order-image-delete-${orderId}`}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
          data-ai-try-on-order-image-delete-dialog
        >
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h4 id={`ai-try-on-order-image-delete-${orderId}`} className="text-base font-bold text-heritage-green">
              {COPY.deleteDialogTitle}
            </h4>
            <p className="text-sm leading-relaxed text-heritage-ink/80">
              {isAdmin ? COPY.adminDeleteDialogBody : COPY.deleteDialogBody}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-sm font-bold text-heritage-green"
              >
                {COPY.deleteDialogCancel}
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="min-h-11 rounded-xl bg-red-800 px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {COPY.deleteDialogConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

/**
 * Admin / tailor orders table: the saved AI preview, loaded only when the
 * row's preview is opened (one table can list many paid orders).
 */
export const AdminAiTryOnOrderImage = ({
  orderId,
  service,
}: {
  orderId: string;
  service?: AiTryOnOrderImageService;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-2 min-w-[16rem] max-w-md text-heritage-ink"
      data-admin-ai-try-on-order-image={orderId}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-heritage-green">
        {COPY.adminSectionTitle}
      </summary>
      {open ? (
        <div className="mt-2">
          <AiTryOnOrderImagePanel orderId={orderId} variant="admin" service={service} />
        </div>
      ) : null}
    </details>
  );
};
