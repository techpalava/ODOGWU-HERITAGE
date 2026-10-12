export type FabricCatalogueLoadState = "loading" | "ready" | "error";

export const FABRIC_CATALOGUE_LOADING_MESSAGE =
  "Loading the fabric catalogue…";

export const FABRIC_CATALOGUE_EMPTY_TITLE = "No fabrics to choose yet";

export const FABRIC_CATALOGUE_EMPTY_DETAIL =
  "The fabric catalogue is empty right now. Please check back soon.";

export const FABRIC_CATALOGUE_ERROR_TITLE =
  "The fabric catalogue could not be loaded";

export const FABRIC_CATALOGUE_ERROR_DETAIL =
  "Check your connection, then try again. Your garment choices are still saved.";

export type FabricCatalogueNoticeKind = "loading" | "empty" | "error";

/**
 * What the Fabric step should say about the catalogue.
 * A successful snapshot with only HIDDEN fabrics is empty: the HIDDEN filter
 * stays in the caller, and this helper only sees the already-visible count.
 * An error is shown even when older cards are still on screen.
 */
/** Logs the listener failure and notifies the caller. console.error stays. */
export const reportFabricSubscriptionFailure = (
  error: unknown,
  onError?: (error: unknown) => void,
): void => {
  console.error("Error subscribing to fabrics:", error);
  onError?.(error);
};

export const resolveFabricCatalogueNotice = ({
  loadState,
  visibleCount,
}: {
  loadState: FabricCatalogueLoadState;
  visibleCount: number;
}): FabricCatalogueNoticeKind | null => {
  if (loadState === "error") return "error";
  if (visibleCount > 0) return null;
  if (loadState === "loading") return "loading";
  return "empty";
};
