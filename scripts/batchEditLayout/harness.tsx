/**
 * Layout check page for test_batch_edit_panel_layout.mjs. Renders the real
 * BatchManagementPanel inside the admin page layout (App <main>, DatabaseView
 * sidebar and card), opens Edit Timeline, measures the panel and clicks both
 * Save and Cancel buttons. The test server replaces StorageService with a stub
 * that only counts calls, so nothing is written.
 */
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import { BatchManagementPanel } from "../../src/components/BatchManagementPanel";
import type { Batch } from "../../src/types";

const batch = (n: number, name: string, startDate: string, endDate: string, status: string, extra: Partial<Batch> = {}): Batch => ({
  id: `batch-${n}`,
  batchNumber: n,
  name,
  startDate,
  endDate,
  duration: "",
  targetGarments: 40 + n * 10,
  currentGarments: 0,
  currentOrders: 0,
  currentCustomers: 0,
  status: status as Batch["status"],
  allowOrders: true,
  visibility: "PUBLIC",
  newParticipants: 5,
  previousParticipants: 3,
  dressesMade: 12,
  ...extra,
});
const batches: Batch[] = [
  batch(5, "Gladiators", "2026-05-18", "2026-07-06", "COMPLETED", { isAutoScheduled: false, isActive: false }),
  batch(6, "Avatars", "2026-07-06", "2026-09-30", "OPEN", { isAutoScheduled: false, isActive: true, keepOpenAfterEndDate: true, targetGarments: 72, currentGarments: 26 }),
  batch(7, "Power Rangers", "2026-09-07", "2026-10-12", "YET_TO_START", { isAutoScheduled: false, isActive: false }),
  batch(8, "Musketeers", "2026-10-12", "2026-11-16", "YET_TO_START", { isAutoScheduled: false, isActive: false }),
  batch(9, "Governors", "2026-11-16", "2026-12-21", "YET_TO_START"),
];

createRoot(document.getElementById("root")!).render(
  <main className="flex-grow mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 w-full">
    <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
      <div className="w-full md:w-56 lg:w-64 shrink-0 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
        <div className="bg-[#12422C] p-1 md:p-2 rounded-2xl h-96" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-white border border-heritage-gold/15 rounded-3xl p-6 sm:p-8 shadow-sm h-full">
          <div className="space-y-6 text-left">
            <BatchManagementPanel batches={batches} />
          </div>
        </div>
      </div>
    </div>
  </main>,
);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async <T,>(read: () => T | null | undefined, label: string): Promise<T> => {
  for (let i = 0; i < 200; i += 1) {
    const value = read();
    if (value) return value;
    await wait(25);
  }
  throw new Error(`timed out waiting for ${label}`);
};
const q = (testId: string) => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const saveCalls = () => (window as unknown as { __batchSaveCalls?: number }).__batchSaveCalls || 0;
const tableScroller = () => document.querySelector("table")!.parentElement as HTMLElement;
const overflow = () => tableScroller().scrollWidth - tableScroller().clientWidth;
const openEditor = async () => {
  const editButtons = await until(
    () => {
      const found = [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Edit Timeline");
      return found.length ? found : null;
    },
    "Edit Timeline",
  );
  editButtons[1].click(); // Batch 6: Avatars
  return until(() => q("batch-edit-panel"), "edit panel");
};
const describeButton = (testId: string) => {
  const button = q(testId) as HTMLButtonElement;
  button.scrollIntoView({ block: "center", inline: "nearest" });
  const rect = button.getBoundingClientRect();
  const box = tableScroller().getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return {
    text: button.textContent?.trim(),
    insideTable: rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5,
    insideViewport: rect.left >= 0 && rect.right <= window.innerWidth,
    enabled: !button.disabled,
    clickable: Boolean(hit && button.contains(hit)),
  };
};

const run = async () => {
  const result: Record<string, unknown> = { viewport: window.innerWidth };
  await until(() => document.querySelector("table"), "table");
  result.nonEditOverflow = overflow();
  const panel = await openEditor();
  await wait(50);
  result.editOverflow = overflow();
  const panelRect = panel.getBoundingClientRect();
  const box = tableScroller().getBoundingClientRect();
  result.panelInsideTable = panelRect.left >= box.left - 0.5 && panelRect.right <= box.right + 0.5;
  result.panelOverflow = panel.scrollWidth - panel.clientWidth;
  result.buttons = Object.fromEntries(
    ["batch-edit-save-top", "batch-edit-save-bottom", "batch-edit-cancel-top", "batch-edit-cancel-bottom"].map((id) => [id, describeButton(id)]),
  );
  // Each Save saves once and closes the panel; each Cancel closes without saving.
  const clicks: Record<string, unknown> = {};
  for (const id of ["batch-edit-save-top", "batch-edit-save-bottom", "batch-edit-cancel-top", "batch-edit-cancel-bottom"]) {
    if (!q("batch-edit-panel")) await openEditor();
    const before = saveCalls();
    q(id)!.click();
    await until(() => (q("batch-edit-panel") ? null : true), `${id} closes the panel`);
    clicks[id] = { saveCalls: saveCalls() - before, closed: true };
  }
  result.clicks = clicks;
  return result;
};

run()
  .then((result) => ({ ok: true, result }))
  .catch((error) => ({ ok: false, error: String(error) }))
  .then((payload) => {
    const out = document.createElement("pre");
    out.id = "layout-result";
    out.textContent = JSON.stringify(payload);
    document.body.appendChild(out);
  });
