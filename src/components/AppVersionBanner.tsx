import { useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import {
  APP_OUTDATED_MESSAGE,
  appVersionChecker,
  type AppVersionChecker,
} from "../utils/appVersionCheck";

export const AppVersionBanner = ({
  checker = appVersionChecker,
  reload = () => window.location.reload(),
}: {
  checker?: AppVersionChecker;
  reload?: () => void;
}) => {
  const outdated = useSyncExternalStore(
    checker.subscribe,
    checker.isOutdated,
    checker.isOutdated,
  );
  if (!outdated) return null;
  return (
    <div
      role="alert"
      data-app-version-banner
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-heritage-gold px-4 py-3 text-sm font-semibold text-heritage-ink shadow-lg"
    >
      <span>{APP_OUTDATED_MESSAGE}</span>
      <button
        type="button"
        onClick={reload}
        className="inline-flex items-center gap-2 rounded-full bg-heritage-ink px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-heritage-ink/90"
      >
        <RefreshCw size={14} aria-hidden="true" />
        Reload
      </button>
    </div>
  );
};
