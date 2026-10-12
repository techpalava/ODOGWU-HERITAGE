import {
  FABRIC_CATALOGUE_EMPTY_DETAIL,
  FABRIC_CATALOGUE_EMPTY_TITLE,
  FABRIC_CATALOGUE_ERROR_DETAIL,
  FABRIC_CATALOGUE_ERROR_TITLE,
  FABRIC_CATALOGUE_LOADING_MESSAGE,
  type FabricCatalogueNoticeKind,
} from "../utils/fabricCatalogueNotice";

export const FabricCatalogueNotice = ({
  kind,
  onRetry,
}: {
  kind: FabricCatalogueNoticeKind;
  onRetry?: () => void;
}) => {
  if (kind === "loading") {
    return (
      <p
        role="status"
        data-fabric-catalogue-notice="loading"
        className="col-span-full rounded-2xl border border-heritage-gold/25 bg-white px-5 py-4 text-sm font-semibold text-heritage-green"
      >
        {FABRIC_CATALOGUE_LOADING_MESSAGE}
      </p>
    );
  }

  if (kind === "empty") {
    return (
      <div
        role="status"
        data-fabric-catalogue-notice="empty"
        className="col-span-full rounded-2xl border border-dashed border-heritage-gold/40 bg-heritage-cream/40 p-5"
      >
        <p className="font-serif text-lg font-bold text-heritage-green">
          {FABRIC_CATALOGUE_EMPTY_TITLE}
        </p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-heritage-ink/70">
          {FABRIC_CATALOGUE_EMPTY_DETAIL}
        </p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-fabric-catalogue-notice="error"
      className="col-span-full rounded-2xl border border-red-300/70 bg-red-50 p-5"
    >
      <p className="font-serif text-lg font-bold text-red-900">
        {FABRIC_CATALOGUE_ERROR_TITLE}
      </p>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-red-900/80">
        {FABRIC_CATALOGUE_ERROR_DETAIL}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid="future-fabric-catalogue-retry"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
};
