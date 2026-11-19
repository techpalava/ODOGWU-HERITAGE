import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  if (typeof container.querySelectorAll !== "function") return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
  );
};

/**
 * One enlarged photo over a dimmed backdrop. Generic on purpose: the Fabric
 * cards use it now, and the AI Try-on garment cards can use the same dialog
 * later. It shows one image and its name. It does not browse between items.
 */
export function CataloguePhotoPreviewDialog({
  src,
  srcSet,
  sizes,
  name,
  alt,
  onClose,
  returnFocusRef,
  onImageError,
  unavailable = false,
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  /** Visible caption and the dialog's accessible name. */
  name: string;
  alt: string;
  onClose: () => void;
  /** The control that opened the dialog. Focus returns here on close. */
  returnFocusRef: RefObject<HTMLElement | null>;
  onImageError?: () => void;
  /** The photo could not be loaded. The name and close button stay. */
  unavailable?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const returnTarget = returnFocusRef.current;
    closeRef.current?.focus?.();
    if (typeof document === "undefined") {
      return () => {
        returnTarget?.focus?.();
      };
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const focusable = dialog ? getFocusableElements(dialog) : [];
      if (!dialog || focusable.length === 0) {
        event.preventDefault();
        closeRef.current?.focus?.();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      const outside = typeof dialog.contains === "function" ? !dialog.contains(active) : false;
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const body = document.body;
    const previousOverflow = body?.style?.overflow;
    if (body?.style) body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (body?.style && previousOverflow !== undefined) {
        body.style.overflow = previousOverflow;
      }
      returnTarget?.focus?.();
    };
  }, [returnFocusRef]);

  const dialog = (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/75 p-4"
      data-catalogue-photo-preview-backdrop="true"
      onClick={() => onCloseRef.current()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-catalogue-photo-preview="true"
        className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={() => onCloseRef.current()}
          aria-label={`Close larger photo of ${name}`}
          data-catalogue-photo-preview-close="true"
          className="fixed right-4 top-4 inline-flex size-11 items-center justify-center rounded-full bg-white text-heritage-green shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <X aria-hidden="true" size={18} />
        </button>
        {unavailable || !src ? (
          <p role="status" className="px-6 text-center text-sm font-semibold text-white" data-catalogue-photo-preview-unavailable="true">
            Photo unavailable
          </p>
        ) : (
          <img
            src={src}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            onError={onImageError}
            data-catalogue-photo-preview-image="true"
            className="max-h-[calc(90vh-3.5rem)] max-w-[90vw] object-contain"
          />
        )}
        <p id={titleId} className="mt-3 max-w-[90vw] text-center font-serif text-lg font-bold text-white">
          {name}
        </p>
      </div>
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(dialog, document.body);
  }
  return dialog;
}
