import { UsersRound, Pencil } from "lucide-react";
import type { DesignStudioStageId } from "../types";
import type {
  LiveOrderSummarySection,
  LiveOrderSummaryView,
} from "../utils/designStudioLiveOrderSummary";
import { LIVE_ORDER_SUMMARY_HEADING } from "../utils/designStudioLiveOrderSummary";

const PRICE_SECTION_IDS = new Set([
  "construction",
  "optional_extras",
  "additional_clothes",
]);

const SummarySection = ({
  section,
  canEdit,
  onEdit,
}: {
  section: LiveOrderSummarySection;
  canEdit: boolean;
  onEdit?: () => void;
}) => (
  <section
    data-testid={`live-order-summary-section-${section.id}`}
    className="min-w-0"
  >
    <div className="flex min-w-0 items-start justify-between gap-2">
      <h3 className="min-w-0 break-words text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
        {section.title}
      </h3>
      {canEdit && onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${section.title}`}
          data-testid={`live-order-summary-edit-${section.id}`}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <Pencil aria-hidden="true" size={11} />
          Edit
        </button>
      ) : null}
    </div>
    <ul className="mt-2 space-y-1.5">
      {section.lines.map((line) => (
        <li
          key={line.id}
          data-line-id={line.id}
          className="flex min-w-0 items-start justify-between gap-2 text-sm"
        >
          <div className="min-w-0">
            <p className="break-words font-semibold text-heritage-ink">
              {line.label}
            </p>
            {line.detail ? (
              <p className="mt-0.5 break-words text-xs text-heritage-ink/65">
                {line.detail}
              </p>
            ) : null}
          </div>
          {line.amountLabel ? (
            <span className="shrink-0 font-mono text-xs font-bold text-heritage-green">
              {line.amountLabel}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  </section>
);

export const DesignStudioOrderSummary = ({
  view,
  unlockedStages,
  currentStageId = null,
  onEditStage,
}: {
  view: LiveOrderSummaryView;
  unlockedStages: ReadonlySet<DesignStudioStageId>;
  currentStageId?: DesignStudioStageId | null;
  onEditStage?: (stage: DesignStudioStageId) => void;
}) => {
  const headingId = "live-order-summary-heading";
  const renderSection = (section: LiveOrderSummarySection) => (
    <SummarySection
      key={section.id}
      section={section}
      canEdit={Boolean(
        section.editStage &&
          unlockedStages.has(section.editStage) &&
          section.editStage !== currentStageId &&
          onEditStage,
      )}
      onEdit={
        section.editStage && onEditStage
          ? () => onEditStage(section.editStage as DesignStudioStageId)
          : undefined
      }
    />
  );
  const priceSections = view.sections.filter((section) =>
    PRICE_SECTION_IDS.has(section.id),
  );
  const detailSections = view.sections.filter(
    (section) => !PRICE_SECTION_IDS.has(section.id),
  );

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="live-order-summary-sidebar"
      className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-gray-100 pb-3">
        <UsersRound
          aria-hidden="true"
          size={18}
          className="shrink-0 text-heritage-gold"
        />
        <h2
          id={headingId}
          className="min-w-0 break-words font-serif text-lg font-bold uppercase tracking-wide text-heritage-green"
        >
          {LIVE_ORDER_SUMMARY_HEADING}
        </h2>
      </div>
      <div className="mt-4 space-y-4">
        {priceSections.map(renderSection)}
      </div>
      <div
        className="mt-5 border-t border-heritage-gold/30 pt-4"
        data-testid="live-order-summary-total"
        data-total-status={view.totalStatus}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
          {view.totalLabel}
        </p>
        <p
          className="mt-1 break-words font-serif text-base font-bold text-heritage-green"
          data-testid="live-order-summary-total-value"
        >
          {view.totalValueLabel}
        </p>
        {view.quoteRequired ? (
          <p className="mt-2 text-xs leading-relaxed text-heritage-ink/65">
            A custom shipping quote is required before the final payable total
            can be confirmed.
          </p>
        ) : null}
      </div>
      {detailSections.length > 0 ? (
        <div className="mt-5 space-y-4 border-t border-heritage-gold/20 pt-4">
          {detailSections.map(renderSection)}
        </div>
      ) : null}
    </aside>
  );
};
