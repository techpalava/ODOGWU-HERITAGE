import { useEffect, useRef } from "react";
import { UsersRound, Pencil, Trash2 } from "lucide-react";
import type { DesignStudioStageId } from "../types";
import type {
  LiveOrderSummaryLine,
  LiveOrderSummarySection,
  LiveOrderSummarySubsection,
  LiveOrderSummaryView,
} from "../utils/designStudioLiveOrderSummary";
import { LIVE_ORDER_SUMMARY_HEADING } from "../utils/designStudioLiveOrderSummary";
import { formatCustomDetailsGarmentLabel } from "../utils/optionalShortsPresentation";
import type { FutureGarmentRemovalTarget } from "./FutureGarmentRemovalConfirmationDialog";

const RemoveGarmentButton = ({
  target,
  originStage,
  onRequestGarmentRemoval,
}: {
  target: FutureGarmentRemovalTarget;
  originStage: DesignStudioStageId;
  onRequestGarmentRemoval: (
    target: FutureGarmentRemovalTarget,
    trigger: HTMLButtonElement,
  ) => void;
}) => {
  const reasonId = `live-order-summary-removal-reason-${target.garmentKey}`;
  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={!target.canRequestRemoval}
        aria-label={target.accessibleName}
        aria-describedby={target.disabledReason ? reasonId : undefined}
        data-garment-removal-button={target.garmentKey}
        data-garment-removal-origin-stage={originStage}
        data-testid={`live-order-summary-remove-${target.garmentKey}`}
        onClick={(event) => {
          event.stopPropagation();
          onRequestGarmentRemoval(target, event.currentTarget);
        }}
        className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Trash2 aria-hidden="true" size={11} />
        Remove
      </button>
      {target.disabledReason ? (
        <p
          id={reasonId}
          className="max-w-[10rem] break-words text-right text-[9px] leading-snug text-heritage-ink/55"
        >
          {target.disabledReason}
        </p>
      ) : null}
    </div>
  );
};

const SummarySection = ({
  section,
  canEdit,
  canEditAdditionalGarments,
  onEdit,
  onEditAdditionalGarments,
  removalTargets,
  onRequestGarmentRemoval,
  removalOriginStage,
}: {
  section: LiveOrderSummarySection;
  canEdit: boolean;
  canEditAdditionalGarments: boolean;
  onEdit?: () => void;
  onEditAdditionalGarments?: (focusGarmentKey?: string | null) => void;
  removalTargets: readonly FutureGarmentRemovalTarget[];
  onRequestGarmentRemoval?: (
    target: FutureGarmentRemovalTarget,
    trigger: HTMLButtonElement,
  ) => void;
  removalOriginStage: DesignStudioStageId;
}) => {
  const removalForLine = (line: LiveOrderSummaryLine) =>
    line.focusGarmentKey
      ? removalTargets.find(
          (target) => target.garmentKey === line.focusGarmentKey,
        )
      : undefined;

  return (
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
        {section.lines.map((line) => {
          const removalTarget = removalForLine(line);
          return (
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
            <div className="flex shrink-0 flex-col items-end gap-1">
              {removalTarget && onRequestGarmentRemoval ? (
                <RemoveGarmentButton
                  target={removalTarget}
                  originStage={removalOriginStage}
                  onRequestGarmentRemoval={onRequestGarmentRemoval}
                />
              ) : null}
              {line.amountLabel ? (
                <span className="text-right font-mono text-[13px] font-semibold text-heritage-green">
                  {line.amountLabel}
                </span>
              ) : null}
            </div>
          </li>
          );
        })}
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
        removalTargets={removalTargets}
        onRequestGarmentRemoval={onRequestGarmentRemoval}
        removalOriginStage={removalOriginStage}
      />
    ))}
    {(section.footers ?? (section.footer ? [section.footer] : [])).map(
      (footer, footerIndex) => (
        <div
          key={footer.id}
          className={
            footerIndex === 0
              ? "mt-1.5 border-t border-heritage-gold/20 pt-1.5"
              : "mt-1.5 pt-0.5"
          }
          data-testid={
            footerIndex === 0
              ? `live-order-summary-${section.id}-subtotal`
              : `live-order-summary-${section.id}-footer-${footer.id}`
          }
          data-subtotal-cents={footer.amountCents}
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 break-words text-[13px] font-semibold leading-snug text-heritage-ink">
              {footer.label}
            </p>
            <span className="shrink-0 text-right font-mono text-[13px] font-semibold text-heritage-green">
              {footer.amountLabel}
            </span>
          </div>
          {footer.note ? (
            <p
              className="mt-1 break-words text-[10px] font-normal leading-snug text-heritage-ink/60"
              data-testid={`live-order-summary-${section.id}-inclusion`}
            >
              {footer.note}
            </p>
          ) : null}
        </div>
      ),
    )}
  </section>
  );
};

const SummarySubsection = ({
  subsection,
  canEdit,
  onEdit,
  removalTargets,
  onRequestGarmentRemoval,
  removalOriginStage,
}: {
  subsection: LiveOrderSummarySubsection;
  canEdit: boolean;
  onEdit?: (focusGarmentKey?: string | null) => void;
  removalTargets: readonly FutureGarmentRemovalTarget[];
  onRequestGarmentRemoval?: (
    target: FutureGarmentRemovalTarget,
    trigger: HTMLButtonElement,
  ) => void;
  removalOriginStage: DesignStudioStageId;
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
      {subsection.lines.map((line) => {
        const removalTarget = line.focusGarmentKey
          ? removalTargets.find(
              (target) => target.garmentKey === line.focusGarmentKey,
            )
          : undefined;
        return (
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
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
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
              {removalTarget &&
              onRequestGarmentRemoval &&
              subsection.id === "additional_garments" ? (
                <RemoveGarmentButton
                  target={removalTarget}
                  originStage={removalOriginStage}
                  onRequestGarmentRemoval={onRequestGarmentRemoval}
                />
              ) : null}
            </div>
            {line.amountLabel ? (
              <span className="text-right font-mono text-[13px] font-semibold text-heritage-green">
                {line.amountLabel}
              </span>
            ) : null}
          </div>
        </li>
        );
      })}
    </ul>
  </section>
);

export const DesignStudioOrderSummary = ({
  view,
  unlockedStages,
  currentStageId = null,
  onEditStage,
  removalTargets = [],
  onRequestGarmentRemoval,
  onRequestCancelOrder,
}: {
  view: LiveOrderSummaryView;
  unlockedStages: ReadonlySet<DesignStudioStageId>;
  currentStageId?: DesignStudioStageId | null;
  onEditStage?: (
    stage: DesignStudioStageId,
    options?: { focusAdditionalGarmentKey?: string | null },
  ) => void;
  removalTargets?: readonly FutureGarmentRemovalTarget[];
  onRequestGarmentRemoval?: (
    target: FutureGarmentRemovalTarget,
    trigger: HTMLButtonElement,
  ) => void;
  onRequestCancelOrder?: () => void;
}) => {
  const headingId = "live-order-summary-heading";
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, []);
  const removalOriginStage: DesignStudioStageId = currentStageId || "fabric";
  const hasCommittedGarments = view.sections.some(
    (section) =>
      section.id === "construction" &&
      (section.lines.length > 0 ||
        Boolean(
          section.subsections?.some((subsection) => subsection.lines.length > 0),
        )),
  );
  const stickySlotClassName =
    "min-w-0 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:flex-col";
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
      removalTargets={
        section.id === "construction" ? removalTargets : []
      }
      onRequestGarmentRemoval={
        section.id === "construction" ? onRequestGarmentRemoval : undefined
      }
      removalOriginStage={removalOriginStage}
    />
  );

  if (!hasCommittedGarments) {
    return (
      <div
        data-testid="live-order-summary-slot"
        data-empty="true"
        aria-hidden="true"
        className={`${stickySlotClassName} invisible pointer-events-none`}
      >
        <div className="min-h-[12rem] w-full" />
      </div>
    );
  }

  return (
    <div
      data-testid="live-order-summary-slot"
      data-empty="false"
      className={stickySlotClassName}
    >
      <aside
        aria-labelledby={headingId}
        data-testid="live-order-summary-sidebar"
        className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-3 shadow-sm [overflow-wrap:anywhere] motion-safe:animate-live-order-summary-enter motion-reduce:animate-none sm:p-3.5 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:flex-col"
      >
        <div className="flex min-w-0 items-start justify-between gap-2 border-b border-gray-100 pb-2">
          <div className="flex min-w-0 items-center gap-2">
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
          {onRequestCancelOrder ? (
            <button
              type="button"
              onClick={onRequestCancelOrder}
              data-live-order-summary-cancel-order="true"
              data-testid="live-order-summary-cancel-order"
              className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md border border-red-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              Cancel Order
            </button>
          ) : null}
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
                <dt className="min-w-0 break-words text-base font-bold uppercase tracking-wide text-heritage-green">
                  {view.totalLabel}
                </dt>
                <dd
                  className="shrink-0 text-right font-serif text-2xl font-bold leading-tight text-heritage-green"
                  data-testid="live-order-summary-total-value"
                >
                  {view.totalValueLabel}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 break-words text-base font-bold text-heritage-ink">
                {view.totalLabel}
              </p>
              <p
                className="shrink-0 text-right font-serif text-2xl font-bold leading-tight text-heritage-green"
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
    </div>
  );
};
