import type { CustomerOrderContextPresentation } from "../utils/customerOrderContextPresentation";

export const StudioOrderContextIndicator = ({
  context,
}: {
  context: CustomerOrderContextPresentation;
}) => (
  <aside
    aria-label="Current order context"
    data-order-context-indicator={context.kind}
    className="inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-heritage-gold/25 bg-white px-3 py-2 text-sm shadow-sm"
  >
    <span className="font-bold text-heritage-green">{context.studioLabel}</span>
    {context.batchName ? (
      <>
        <span aria-hidden="true" className="text-heritage-gold">
          •
        </span>
        <strong className="min-w-0 break-words text-heritage-ink">
          {context.batchName}
        </strong>
      </>
    ) : null}
  </aside>
);

export const OrderContextDetails = ({
  context,
}: {
  context: CustomerOrderContextPresentation;
}) => (
  <section
    aria-labelledby="customer-order-details-title"
    data-order-context-details={context.kind}
    className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5"
  >
    <h3
      id="customer-order-details-title"
      className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold"
    >
      Order details
    </h3>
    <dl className="mt-3 space-y-2 text-sm">
      <div className="grid min-w-0 gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
        <dt className="font-medium text-heritage-ink/65">Order type</dt>
        <dd className="min-w-0 break-words font-semibold text-heritage-green">
          {context.detailsOrderType}
        </dd>
      </div>
      {context.kind === "community" && context.batchName ? (
        <div className="grid min-w-0 gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
          <dt className="font-medium text-heritage-ink/65">Batch</dt>
          <dd className="min-w-0 break-words font-semibold text-heritage-green">
            {context.batchName}
          </dd>
        </div>
      ) : null}
      {context.kind === "private" && context.batchName ? (
        <div className="grid min-w-0 gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
          <dt className="font-medium text-heritage-ink/65">Batch</dt>
          <dd className="min-w-0 break-words font-semibold text-heritage-green">
            {context.batchName}
          </dd>
        </div>
      ) : null}
      {context.kind === "private" && context.role ? (
        <div className="grid min-w-0 gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
          <dt className="font-medium text-heritage-ink/65">Role</dt>
          <dd className="min-w-0 break-words font-semibold text-heritage-green">
            {context.role}
          </dd>
        </div>
      ) : null}
    </dl>
  </section>
);
