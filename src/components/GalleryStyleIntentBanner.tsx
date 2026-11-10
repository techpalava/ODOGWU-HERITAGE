import type { GalleryStyleIntent } from "../utils/galleryStyleIntent";
import type { StyleCategory } from "../types";

interface GalleryStyleIntentBannerProps {
  intent: Exclude<GalleryStyleIntent, { kind: "none" }>;
  style: StyleCategory | null;
  onBackToStyles: () => void;
  onClear: () => void;
  onUseSavedStyle: () => void;
  onKeepSavedDesigns: () => void;
}

const shellClass = (warning: boolean) =>
  `mt-3 grid min-w-0 grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-2xl border px-3 py-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:px-4 ${
    warning
      ? "border-amber-300 bg-amber-50"
      : "border-heritage-gold/45 bg-white"
  }`;

export function GalleryStyleIntentBanner({
  intent,
  style,
  onBackToStyles,
  onClear,
  onUseSavedStyle,
  onKeepSavedDesigns,
}: GalleryStyleIntentBannerProps) {
  const warning =
    intent.kind === "conflict" ||
    intent.kind === "unknown" ||
    intent.kind === "catalogue_unavailable";
  const name =
    "styleName" in intent ? intent.styleName : style?.name || "Gallery style";
  const image = style?.image || null;

  let kicker = "Designing";
  let body = "Choose the garment and fabric first. This design is applied on Step 3 when it fits your order.";
  if (intent.kind === "pending_catalogue") {
    body = "Your gallery style is saved.";
  } else if (intent.kind === "catalogue_unavailable") {
    kicker = "Catalogue unavailable";
    body = "The design catalogue could not be loaded. Your gallery style is saved. Refresh to try again.";
  } else if (intent.kind === "unknown") {
    kicker = "Not in the catalogue";
    body = "This design is no longer in the catalogue. You can still start an order and choose a style on Step 3.";
  } else if (intent.kind === "applied") {
    kicker = "Selected from gallery";
    body = `Applied to ${intent.appliedLabels.join(", ")}. You can change or clear it.`;
  } else if (intent.kind === "conflict") {
    kicker = "Not applied";
    body = intent.customerReason;
  } else if (intent.kind === "needs_confirmation") {
    kicker = "Saved designs";
    body = `${name} is from the gallery. This order already has designs. Use this style on its garment, or keep the designs you saved.`;
  } else if (intent.kind === "choose_on_step_3") {
    body = `${name} is saved. On Step 3, choose the garments you want to use it on.`;
  } else if (intent.kind === "ready_to_assign") {
    body = "Applying this design to the garment from the gallery.";
  }

  return (
    <aside
      className={shellClass(warning)}
      aria-label="Gallery style"
      data-gallery-style-intent={intent.kind}
      data-gallery-style-id={intent.styleId}
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="h-14 w-14 rounded-xl object-cover sm:h-[72px] sm:w-[72px]"
        />
      ) : (
        <div
          aria-hidden="true"
          className="h-14 w-14 rounded-xl bg-heritage-cream sm:h-[72px] sm:w-[72px]"
        />
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-heritage-gold">
          {kicker}
        </p>
        <p className="mt-0.5 break-words font-serif text-base font-bold text-heritage-green sm:text-lg">
          {intent.kind === "unknown" ? "Gallery style" : name}
        </p>
        <p className="mt-1 break-words text-xs leading-relaxed text-heritage-ink/75">
          {body}
        </p>
      </div>
      <div className="col-span-2 flex min-w-0 flex-wrap gap-2 sm:col-span-1 sm:justify-end">
        {intent.kind === "needs_confirmation" ? (
          <>
            <button
              type="button"
              onClick={onUseSavedStyle}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-heritage-green px-3 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Use this style
            </button>
            <button
              type="button"
              onClick={onKeepSavedDesigns}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-heritage-green/25 bg-white px-3 text-xs font-bold text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Keep my designs
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onBackToStyles}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-heritage-green/25 bg-white px-3 text-xs font-bold text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Back to styles
            </button>
            {intent.kind !== "unknown" ? (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                Clear
              </button>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
