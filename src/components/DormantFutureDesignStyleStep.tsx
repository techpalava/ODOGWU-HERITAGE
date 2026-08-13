import { ArrowLeft, Check, LockKeyhole } from "lucide-react";
import type { GarmentTypeStepSelection, StyleCategory } from "../types";
import {
  reconcileFutureDesignStyleSelection,
  resolveFutureDesignStyleCompatibility,
} from "../utils/designStudioFutureDesignStyle";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";

interface DormantFutureDesignStyleStepProps {
  styles: StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
  selectedStyleId: string | null;
  stagePrice: number | null;
  onSelectStyle: (styleId: string) => void;
  onBack: () => void;
}

export const DormantFutureDesignStyleStep = ({
  styles,
  garmentTypeSelection,
  selectedStyleId,
  stagePrice,
  onSelectStyle,
  onBack,
}: DormantFutureDesignStyleStepProps) => {
  const selection = reconcileFutureDesignStyleSelection({
    selectedStyleId,
    styles,
    garmentTypeSelection,
  });

  return (
    <section
      aria-labelledby="future-design-style-title"
      data-stage-id="design_style"
      data-stage-complete={selection.status === "selected"}
      className="space-y-6 font-sans"
    >
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-heritage-green/20 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Fabric
        </button>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 3 of 9
        </p>
        <h2
          id="future-design-style-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Design Style
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Choose a visual design that matches the garments and demographic set
          in Step 1. Your garment and fabric assignments will not change.
        </p>

        {selection.status === "reselection_required" && (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p className="font-bold">Select another design</p>
            <p className="mt-1 text-xs leading-relaxed">
              {selection.compatibility?.customerReason}
            </p>
          </div>
        )}

        <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {styles.length === 0 && (
            <div className="rounded-2xl border border-dashed border-heritage-gold/30 bg-heritage-cream/25 p-6 text-center sm:col-span-2 lg:col-span-3">
              <p className="font-serif text-base font-bold text-heritage-green">
                No catalogue designs are available
              </p>
              <p className="mt-2 text-xs leading-relaxed text-heritage-ink/65">
                A current catalog design is required before this step can be
                completed.
              </p>
            </div>
          )}
          {styles.map((style) => {
            const compatibility = resolveFutureDesignStyleCompatibility({
              garmentTypeSelection,
              style,
            });
            const isCompatible = compatibility.status === "compatible";
            const isSelected =
              isCompatible && selection.selectedStyleId === style.id;
            return (
              <article
                key={style.id}
                data-compatibility-status={compatibility.status}
                className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm ${
                  isSelected
                    ? "border-heritage-gold"
                    : isCompatible
                      ? "border-gray-200"
                      : "border-gray-200 opacity-70"
                }`}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-heritage-cream/35">
                  {style.image ? (
                    <img
                      src={style.image}
                      alt={style.name}
                      loading="lazy"
                      className="h-full w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-heritage-ink/45">
                      Image unavailable
                    </div>
                  )}
                  {isSelected && (
                    <span className="absolute right-3 top-3 rounded-full bg-heritage-gold p-2 text-white shadow-sm">
                      <Check aria-hidden="true" size={15} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <h3 className="break-words font-serif text-base font-bold text-heritage-green">
                    {style.name}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded border border-heritage-green/15 bg-heritage-green/5 px-2 py-1 text-[9px] font-bold uppercase text-heritage-green">
                      {style.gender}
                    </span>
                    {style.outfitType && (
                      <span className="rounded border border-heritage-gold/20 bg-heritage-gold/5 px-2 py-1 text-[9px] font-bold uppercase text-heritage-gold">
                        {style.outfitType}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 break-words text-xs leading-relaxed text-heritage-ink/65">
                    {style.description}
                  </p>
                  {!isCompatible && (
                    <p className="mt-3 rounded-lg bg-heritage-cream/50 p-2 text-[11px] leading-relaxed text-heritage-ink/70">
                      {compatibility.customerReason}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={!isCompatible}
                    onClick={() => onSelectStyle(style.id)}
                    aria-label={`Select ${style.name} design style`}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-heritage-ink/45"
                  >
                    {isSelected ? "Selected" : "Select Design"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm">
        <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
          <span className="min-w-0 text-heritage-ink/70">
            Authoritative garment and fabric total
          </span>
          <span className="shrink-0 font-mono font-bold text-heritage-green">
            {stagePrice === null
              ? "Pending"
              : `${PRICING_CURRENCY_SYMBOL}${stagePrice.toFixed(2)}`}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-heritage-ink/55">
          Design Style does not add garment construction or fabric charges.
        </p>
      </aside>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Fabric
        </button>
        <button
          type="button"
          disabled
          aria-label="Continue to Custom Details is locked"
          className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-heritage-green/35 px-5 text-xs font-bold uppercase tracking-wider text-white"
        >
          <LockKeyhole aria-hidden="true" size={14} />
          Continue to Custom Details
        </button>
      </div>
    </section>
  );
};
