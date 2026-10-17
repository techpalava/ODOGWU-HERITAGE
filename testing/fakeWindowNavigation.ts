/**
 * Minimal window.location and window.history for tests that mount
 * DesignStudioView without a DOM. The Stage 10 iDEAL/Klarna return check reads
 * window.location.search on mount, so a stub window without these throws.
 */
export const createFakeWindowNavigation = () => ({
  location: {
    href: "http://localhost/",
    origin: "http://localhost",
    pathname: "/",
    search: "",
    hash: "",
  },
  history: {
    state: null,
    replaceState: () => undefined,
    pushState: () => undefined,
  },
});
