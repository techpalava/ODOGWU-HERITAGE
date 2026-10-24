import { AlertTriangle } from "lucide-react";
import type { SavedStudioOrderChangeWarning } from "../utils/savedStudioOrderModel";

export const SavedOrderChangeWarningBanner = ({
  warnings,
}: {
  warnings: readonly SavedStudioOrderChangeWarning[];
}) => {
  if (warnings.length === 0) return null;
  return (
    <aside
      data-testid="saved-order-change-warnings"
      className="rounded-2xl border border-heritage-gold/40 bg-heritage-cream/80 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-heritage-gold"
          size={18}
        />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-heritage-green">
            This saved order needs a review
          </p>
          <ul className="list-disc space-y-1 pl-4 text-sm text-heritage-ink/85">
            {warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
};
