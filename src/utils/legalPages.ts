/**
 * Terms and Privacy are ordinary tabs, but they also get real paths
 * (/terms, /privacy) so they can be opened in a new tab or shared.
 * vercel.json rewrites both paths to index.html.
 */
export type LegalPageTab = "privacy" | "terms";

export const LEGAL_PAGE_PATHS: Record<LegalPageTab, string> = {
  privacy: "/privacy",
  terms: "/terms",
};

const normalizePath = (pathname: string): string =>
  pathname.replace(/\/+$/, "").toLowerCase() || "/";

export const legalPageTabFromPath = (pathname: string): LegalPageTab | null => {
  const path = normalizePath(pathname);
  if (path === LEGAL_PAGE_PATHS.privacy) return "privacy";
  if (path === LEGAL_PAGE_PATHS.terms) return "terms";
  return null;
};

export const isLegalPageTab = (tab: string): tab is LegalPageTab =>
  tab === "privacy" || tab === "terms";

/**
 * The path that should be in the address bar for this tab, or null when the
 * current path is already right. Only legal paths are ever added or removed;
 * the query string and hash are kept.
 */
export const legalPagePathFor = (
  activeTab: string,
  location: { pathname: string; search: string; hash: string },
): string | null => {
  const currentLegal = legalPageTabFromPath(location.pathname);
  if (isLegalPageTab(activeTab)) {
    if (currentLegal === activeTab) return null;
    return `${LEGAL_PAGE_PATHS[activeTab]}${location.search}${location.hash}`;
  }
  if (!currentLegal) return null;
  return `/${location.search}${location.hash}`;
};
