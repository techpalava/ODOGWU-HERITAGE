export const APP_VERSION_ENDPOINT = "/api/version" as const;
export const APP_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const APP_OUTDATED_MESSAGE = "A newer version is live. Reload to continue.";

const DEV_BUILD_ID = "dev";

export const readClientBuildId = (): string =>
  typeof __APP_BUILD_ID__ === "string" && __APP_BUILD_ID__.trim()
    ? __APP_BUILD_ID__.trim()
    : DEV_BUILD_ID;

export const isOutdatedBuild = (
  clientBuildId: string,
  serverBuildId: string | null,
): boolean =>
  clientBuildId !== DEV_BUILD_ID &&
  Boolean(serverBuildId) &&
  serverBuildId !== DEV_BUILD_ID &&
  serverBuildId !== clientBuildId;

export interface AppVersionChecker {
  /** Resolves true once the server reports a different build than this tab. */
  check(): Promise<boolean>;
  isOutdated(): boolean;
  subscribe(listener: () => void): () => void;
}

export const createAppVersionChecker = ({
  clientBuildId,
  fetchServerBuildId,
}: {
  clientBuildId: string;
  fetchServerBuildId(): Promise<string | null>;
}): AppVersionChecker => {
  let outdated = false;
  const listeners = new Set<() => void>();
  return {
    async check() {
      if (outdated) return true;
      if (clientBuildId === DEV_BUILD_ID) return false;
      let serverBuildId: string | null = null;
      try {
        serverBuildId = await fetchServerBuildId();
      } catch {
        serverBuildId = null;
      }
      if (!outdated && isOutdatedBuild(clientBuildId, serverBuildId)) {
        outdated = true;
        listeners.forEach((listener) => listener());
      }
      return outdated;
    },
    isOutdated: () => outdated,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const fetchServerBuildId = async (): Promise<string | null> => {
  const response = await fetch(APP_VERSION_ENDPOINT, { cache: "no-store" });
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  return payload &&
    typeof payload === "object" &&
    "buildId" in payload &&
    typeof payload.buildId === "string"
    ? payload.buildId
    : null;
};

export const appVersionChecker = createAppVersionChecker({
  clientBuildId: readClientBuildId(),
  fetchServerBuildId,
});

/** Resolves false when this tab is outdated and must reload before continuing. */
export const ensureCurrentAppVersion = async (): Promise<boolean> =>
  !(await appVersionChecker.check());

export const startAppVersionMonitoring = (
  checker: AppVersionChecker = appVersionChecker,
): (() => void) => {
  const runCheck = () => {
    void checker.check();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") runCheck();
  };
  window.addEventListener("focus", runCheck);
  document.addEventListener("visibilitychange", onVisibilityChange);
  const interval = window.setInterval(runCheck, APP_VERSION_CHECK_INTERVAL_MS);
  runCheck();
  return () => {
    window.removeEventListener("focus", runCheck);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.clearInterval(interval);
  };
};

const PRELOAD_RELOAD_STORAGE_KEY = "odogwu:preload-error-reload-at";
const PRELOAD_RELOAD_WINDOW_MS = 30 * 1000;

/**
 * A lazy chunk from a replaced deployment fails to load. Reload once to pick
 * up the new build; a second failure inside the window is left to the error
 * boundary so a genuinely broken build cannot loop.
 */
export const shouldReloadAfterPreloadError = ({
  lastReloadAt,
  now,
}: {
  lastReloadAt: number | null;
  now: number;
}): boolean =>
  lastReloadAt === null || now - lastReloadAt > PRELOAD_RELOAD_WINDOW_MS;

export const installPreloadErrorReload = (): (() => void) => {
  const onPreloadError = (event: Event) => {
    let lastReloadAt: number | null = null;
    try {
      const stored = Number(sessionStorage.getItem(PRELOAD_RELOAD_STORAGE_KEY));
      lastReloadAt = Number.isFinite(stored) && stored > 0 ? stored : null;
    } catch {
      lastReloadAt = null;
    }
    const now = Date.now();
    if (!shouldReloadAfterPreloadError({ lastReloadAt, now })) return;
    try {
      sessionStorage.setItem(PRELOAD_RELOAD_STORAGE_KEY, String(now));
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
};
