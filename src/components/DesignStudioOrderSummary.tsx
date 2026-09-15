import { useEffect, useRef } from "react";
import { UsersRound, Pencil } from "lucide-react";
import type { DesignStudioStageId } from "../types";
import type {
  LiveOrderSummarySection,
  LiveOrderSummarySubsection,
  LiveOrderSummaryView,
} from "../utils/designStudioLiveOrderSummary";
import { LIVE_ORDER_SUMMARY_HEADING } from "../utils/designStudioLiveOrderSummary";
import { formatCustomDetailsGarmentLabel } from "../utils/optionalShortsPresentation";

const SummarySection = ({
  section,
  canEdit,
  canEditAdditionalGarments,
  onEdit,
  onEditAdditionalGarments,
}: {
  section: LiveOrderSummarySection;
  canEdit: boolean;
  canEditAdditionalGarments: boolean;
  onEdit?: () => void;
  onEditAdditionalGarments?: (focusGarmentKey?: string | null) => void;
}) => (
  <section
    data-testid={`live-order-summary-section-${section.id}`}
    className="min-w-0"
  >
    <div
      data-testid={`live-order-summary-section-header-${section.id}`}
      className="flex min-w-0 items-center justify-between gap-2"
    >
      <h3 className="min-w-0 flex-1 break-words text-[15px] font-bold leading-snug text-heritage-green">
        {section.title}
      </h3>
      {canEdit && onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={section.editLabel || `Edit ${section.title}`}
          data-testid={`live-order-summary-edit-${section.id}`}
          className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
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
            data-testid={
              line.constructionOptions
                ? `live-order-summary-garment-group-${line.id}`
                : undefined
            }
            className={`flex min-w-0 flex-wrap items-start justify-between gap-2${
              line.constructionOptions
                ? " border-t border-heritage-gold/15 pt-2 first:border-t-0 first:pt-0"
                : ""
            }`}
          >
            <div className="flex min-w-0 flex-1 gap-2">
              {line.imageUrl ? (
                <img
                  src={line.imageUrl}
                  alt={`Selected design for ${formatCustomDetailsGarmentLabel(line.label)}`}
                  data-testid={`live-order-summary-design-image-${line.id}`}
                  className="h-9 w-9 shrink-0 rounded-md border border-heritage-gold/20 bg-heritage-cream/35 object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="break-words text-[13px] font-semibold leading-snug text-heritage-ink">
                  {formatCustomDetailsGarmentLabel(line.label)}
                </p>
                {line.detail ? (
                  <p className="mt-0.5 break-words text-[11px] font-normal leading-snug text-heritage-ink/65">
                    {line.detail}
                  </p>
                ) : null}
                {line.supportingDetail ? (
                  <p className="mt-0.5 break-words text-[11px] font-semibold leading-snug text-heritage-ink/65">
                    {line.supportingDetail}
                  </p>
                ) : null}
                {line.constructionOptions?.length ? (
                  <section
                    data-testid={`live-order-summary-construction-options-${line.id}`}
                    className="mt-1.5 border-l-2 border-heritage-gold/25 pl-2"
                  >
                    <ul className="space-y-1">
                      {line.constructionOptions.map((option) => (
                        <li
                          key={option.id}
                          data-testid={`live-order-summary-construction-option-${line.id}-${option.id}`}
                          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 text-[11px] leading-snug text-heritage-ink/75"
                        >
                          <span className="min-w-0 break-words">{option.label}</span>
                          <span className="self-start whitespace-nowrap text-right font-mono font-semibold text-heritage-green">
                            {option.amountLabel}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
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
    {section.subsections?.map((subsection) => (
      <SummarySubsection
        key={subsection.id}
        subsection={subsection}
        canEdit={
          subsection.id === "additional_garments" &&
          canEditAdditionalGarments &&
          Boolean(onEditAdditionalGarments)
        }
        onEdit={onEditAdditionalGarments}
      />
    ))}
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

const SummarySubsection = ({
  subsection,
  canEdit,
  onEdit,
}: {
  subsection: LiveOrderSummarySubsection;
  canEdit: boolean;
  onEdit?: (focusGarmentKey?: string | null) => void;
}) => (
  <section
    data-testid={`live-order-summary-subsection-${subsection.id}`}
    className="mt-3 border-t border-heritage-gold/15 pt-3"
  >
    <div
      data-testid={`live-order-summary-subsection-header-${subsection.id}`}
      className="flex min-w-0 items-center justify-between gap-2"
    >
      <h4 className="min-w-0 flex-1 break-words text-[13px] font-bold tracking-wide text-heritage-green">
        {subsection.title}
      </h4>
      {canEdit && onEdit && !subsection.lines.some((line) => line.focusGarmentKey) ? (
        <button
          type="button"
          onClick={() => onEdit(subsection.focusGarmentKey)}
          aria-label="Edit additional garments"
          data-testid={`live-order-summary-edit-${subsection.id}`}
          className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <Pencil aria-hidden="true" size={11} />
          Edit
        </button>
      ) : null}
    </div>
    <ul className="mt-1.5 space-y-1">
      {subsection.lines.map((line) => (
        <li
          key={line.id}
          data-line-id={line.id}
          className="flex min-w-0 flex-wrap items-start justify-between gap-2"
        >
          <div className="min-w-0">
            <p className="break-words text-[13px] font-semibold leading-snug text-heritage-ink">
              {formatCustomDetailsGarmentLabel(line.label)}
            </p>
            {line.detail ? (
              <p className="mt-0.5 break-words text-[11px] font-normal leading-snug text-heritage-ink/65">
                {line.detail}
              </p>
            ) : null}
            {line.supportingDetail ? (
              <p className="mt-0.5 break-words text-[11px] font-semibold leading-snug text-heritage-ink/65">
                {line.supportingDetail}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canEdit && onEdit && line.focusGarmentKey ? (
              <button
                type="button"
                onClick={() => onEdit(line.focusGarmentKey)}
                aria-label={`Edit ${line.label}`}
                data-testid={`live-order-summary-edit-${subsection.id}-${line.focusGarmentKey}`}
                className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                <Pencil aria-hidden="true" size={11} />
                Edit
              </button>
            ) : null}
            {line.amountLabel ? (
              <span className="text-right font-mono text-[13px] font-semibold text-heritage-green">
                {line.amountLabel}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  </section>
);

export const DesignStudioOrderSummary = ({
  view,
  unlockedStages,
  onEditStage,
}: {
  view: LiveOrderSummaryView;
  unlockedStages: ReadonlySet<DesignStudioStageId>;
  currentStageId?: DesignStudioStageId | null;
  onEditStage?: (
    stage: DesignStudioStageId,
    options?: { focusAdditionalGarmentKey?: string | null },
  ) => void;
}) => {
  const headingId = "live-order-summary-heading";
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, []);
  const canEditStage = (stage: DesignStudioStageId | null): boolean =>
    Boolean(
      stage &&
        unlockedStages.has(stage) &&
        onEditStage,
    );
  const renderSection = (section: LiveOrderSummarySection) => (
    <SummarySection
      key={section.id}
      section={section}
      canEdit={canEditStage(section.editStage)}
      canEditAdditionalGarments={Boolean(
        canEditStage("personalized_additions") &&
          section.subsections?.some(
            (subsection) => subsection.id === "additional_garments",
          ),
      )}
      onEdit={
        section.editStage && onEditStage
          ? () => onEditStage(section.editStage as DesignStudioStageId)
          : undefined
      }
      onEditAdditionalGarments={
        onEditStage
          ? (focusAdditionalGarmentKey) =>
              onEditStage("personalized_additions", { focusAdditionalGarmentKey })
          : undefined
      }
    />
  );

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="live-order-summary-sidebar"
      className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-3 shadow-sm [overflow-wrap:anywhere] sm:p-3.5 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:flex-col"
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
        <div
          ref={contentRef}
          data-testid="live-order-summary-content"
          className="mt-2.5 divide-y divide-heritage-gold/15 lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
        >
          {view.sections.map((section) => (
            <div key={section.id} className="py-2.5 first:pt-0 last:pb-0">
              {renderSection(section)}
            </div>
          ))}
        </div>
      ) : null}
      {view.totalStatus === "hidden" ? null : (
        <div
          className="mt-2.5 shrink-0 border-t border-heritage-gold/30 pt-2.5"
          data-testid="live-order-summary-total"
          data-total-status={view.totalStatus}
        >
          {view.costBreakdown ? (
            <dl data-testid="live-order-summary-cost-breakdown" className="space-y-2 text-xs">
              <div
                data-testid="live-order-summary-order-subtotal"
                data-subtotal-cents={view.costBreakdown.subtotal.amountCents ?? undefined}
                className="flex min-w-0 flex-wrap justify-between gap-2 text-heritage-ink/75"
              >
                <dt className="min-w-0 break-words">{view.costBreakdown.subtotal.label}</dt>
                <dd className="shrink-0 text-right font-mono font-medium text-heritage-ink">
                  {view.costBreakdown.subtotal.valueLabel}
                </dd>
              </div>
              {view.costBreakdown.shipping ? (
                <div
                  data-testid="live-order-summary-shipping"
                  data-shipping-cents={view.costBreakdown.shipping.amountCents ?? undefined}
                  className="flex min-w-0 flex-wrap justify-between gap-2 text-heritage-ink/75"
                >
                  <dt className="min-w-0 break-words">{view.costBreakdown.shipping.label}</dt>
                  <dd className="min-w-0 max-w-full break-words text-right font-mono font-medium text-heritage-ink">
                    {view.costBreakdown.shipping.valueLabel}
                  </dd>
                </div>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-t-2 border-heritage-green/25 pt-2.5">
                <dt className="min-w-0 break-words text-sm font-bold uppercase tracking-wide text-heritage-green">
                  {view.totalLabel}
                </dt>
                <dd
                  className="shrink-0 text-right font-serif text-xl font-bold leading-tight text-heritage-green"
                  data-testid="live-order-summary-total-value"
                >
                  {view.totalValueLabel}
                </dd>
              </div>
            </dl>
          ) : (
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
          )}
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
