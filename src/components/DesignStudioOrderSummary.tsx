import { UsersRound, Pencil } from "lucide-react";
import type { DesignStudioStageId } from "../types";
import type {
  LiveOrderSummarySection,
  LiveOrderSummaryView,
} from "../utils/designStudioLiveOrderSummary";
import { LIVE_ORDER_SUMMARY_HEADING } from "../utils/designStudioLiveOrderSummary";

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
      <h3 className="min-w-0 break-words text-[15px] font-bold leading-snug text-heritage-green">
        {section.title}
      </h3>
      {canEdit && onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${section.title}`}
          data-testid={`live-order-summary-edit-${section.id}`}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <Pencil aria-hidden="true" size={11} />
          Edit
        </button>
      ) : null}
    </div>
    {section.lines.length > 0 ? (
      <ul className="mt-1.5 space-y-1">
        {section.lines.map((line) => (
          <li
            key={line.id}
            data-line-id={line.id}
            className="flex min-w-0 flex-wrap items-start justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="break-words text-[13px] font-semibold leading-snug text-heritage-ink">
                {line.label}
              </p>
              {line.detail ? (
                <p className="mt-0.5 break-words text-[11px] font-normal leading-snug text-heritage-ink/65">
                  {line.detail}
                </p>
              ) : null}
            </div>
            {line.amountLabel ? (
              <span className="shrink-0 text-right font-mono text-[13px] font-semibold text-heritage-green">
                {line.amountLabel}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    ) : null}
    {section.footer ? (
      <div
        className="mt-1.5 border-t border-heritage-gold/20 pt-1.5"
        data-testid={`live-order-summary-${section.id}-subtotal`}
        data-subtotal-cents={section.footer.amountCents}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words text-[13px] font-semibold leading-snug text-heritage-ink">
            {section.footer.label}
          </p>
          <span className="shrink-0 text-right font-mono text-[13px] font-semibold text-heritage-green">
            {section.footer.amountLabel}
          </span>
        </div>
        <p
          className="mt-1 break-words text-[10px] font-normal leading-snug text-heritage-ink/60"
          data-testid={`live-order-summary-${section.id}-inclusion`}
        >
          {section.footer.note}
        </p>
      </div>
    ) : null}
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

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="live-order-summary-sidebar"
      className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-3 shadow-sm [overflow-wrap:anywhere] sm:p-3.5 lg:sticky lg:top-24 lg:self-start"
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-gray-100 pb-2">
        <UsersRound
          aria-hidden="true"
          size={16}
          className="shrink-0 text-heritage-gold"
        />
        <h2
          id={headingId}
          className="min-w-0 break-words font-serif text-base font-bold uppercase tracking-wide text-heritage-green"
        >
          {LIVE_ORDER_SUMMARY_HEADING}
        </h2>
      </div>
      {view.sections.length > 0 ? (
        <div className="mt-2.5 divide-y divide-heritage-gold/15">
          {view.sections.map((section) => (
            <div key={section.id} className="py-2.5 first:pt-0 last:pb-0">
              {renderSection(section)}
            </div>
          ))}
        </div>
      ) : null}
      {view.totalStatus === "hidden" ? null : (
        <div
          className="mt-2.5 border-t border-heritage-gold/30 pt-2.5"
          data-testid="live-order-summary-total"
          data-total-status={view.totalStatus}
        >
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <p className="min-w-0 break-words text-[13px] font-semibold text-heritage-ink">
              {view.totalLabel}
            </p>
            <p
              className="shrink-0 text-right font-serif text-base font-bold leading-tight text-heritage-green"
              data-testid="live-order-summary-total-value"
            >
              {view.totalValueLabel}
            </p>
          </div>
          {view.quoteRequired ? (
            <p className="mt-1.5 text-[10px] leading-snug text-heritage-ink/65">
              A custom shipping quote is required before the final payable total
              can be confirmed.
            </p>
          ) : null}
        </div>
      )}
    </aside>
  );
};
