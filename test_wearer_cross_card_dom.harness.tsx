/**
 * Browser harness for test_wearer_cross_card_dom.ts (bundled by esbuild, run in
 * headless Chrome/Edge). Real WearerAssignmentPanel + the production garment
 * toggle handlers, wired like Design Studio: a stored order, the selected
 * person, and the live form overlaid onto that person.
 */
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { WearerAssignmentPanel } from "./src/components/WearerAssignmentPanel";
import type { FutureMeasurementStateV1, WearerOrderStateV2 } from "./src/types";
import { createWearerGarmentToggleHandlers } from "./src/utils/wearerGarmentToggle";
import { updateWearerMeasurement } from "./src/utils/wearerOrder";
import {
  buildCrossCardFixture,
  crossCardGarmentLabels,
  crossCardGarments,
  crossCardSelection,
  enteredFingerprint,
  reconcileCrossCard,
} from "./test_wearer_cross_card_fixture";

type Snapshot = {
  activeWearerId: string | null;
  selectCalls: number;
  fred: string;
  nol: string;
  assignment: Record<string, string>;
};

const Studio = ({
  initialOrder,
  fredId,
  initialForm,
  report,
}: {
  initialOrder: WearerOrderStateV2;
  fredId: string;
  initialForm: FutureMeasurementStateV1;
  report: (snapshot: Omit<Snapshot, "selectCalls">) => void;
}) => {
  const [wearerOrder, setWearerOrder] = useState(initialOrder);
  const [activeWearerId, setActiveWearerId] = useState<string | null>(fredId);
  const [liveForm, setLiveForm] = useState(initialForm);
  const reconciled = reconcileCrossCard(wearerOrder);
  const activeWearer =
    reconciled.wearers.find((wearer) => wearer.wearerId === activeWearerId) ||
    reconciled.wearers[0];
  const forPlan = updateWearerMeasurement(reconciled, activeWearer.wearerId, liveForm);
  const orderRef = useRef(forPlan);
  orderRef.current = forPlan;
  const activeRef = useRef<string | null>(activeWearer.wearerId);
  activeRef.current = activeWearer.wearerId;
  report({
    activeWearerId: activeWearer.wearerId,
    fred: enteredFingerprint(forPlan.wearers.find((wearer) => wearer.wearerId === fredId)?.measurement),
    nol: enteredFingerprint(forPlan.wearers.find((wearer) => wearer.wearerId !== fredId)?.measurement),
    assignment: forPlan.assignmentByGarmentKey,
  });
  // Same select path as DesignStudioView.handleSelectMeasurementWearer.
  const select = (wearerId: string) => {
    (window as unknown as { __selectCalls: number }).__selectCalls += 1;
    const next = forPlan.wearers.find((wearer) => wearer.wearerId === wearerId);
    if (!next) return;
    setWearerOrder(forPlan);
    activeRef.current = wearerId;
    setActiveWearerId(wearerId);
    setLiveForm(next.measurement);
  };
  const toggles = createWearerGarmentToggleHandlers({
    getOrder: () => orderRef.current,
    getActiveWearerId: () => activeRef.current,
    garments: crossCardGarments,
    garmentTypeSelection: crossCardSelection,
    commitOrder: (order) => {
      orderRef.current = order;
      setWearerOrder(order);
    },
    setLiveForm: (measurement) => {
      if (measurement) setLiveForm(measurement);
    },
  });
  return (
    <WearerAssignmentPanel
      order={forPlan}
      presentation="people"
      activeWearerId={activeWearer.wearerId}
      garments={crossCardGarments}
      garmentLabels={crossCardGarmentLabels}
      garmentTypeSelection={crossCardSelection}
      onSelectWearer={select}
      onAddWearer={() => undefined}
      onRenameWearer={() => undefined}
      onReorderWearers={() => undefined}
      onSetFitContext={() => undefined}
      onDeleteWearer={() => ({ status: "blocked", code: "UNUSED", order: forPlan })}
      onAssignGarment={toggles.assign}
      onUnassignGarment={toggles.unassign}
    />
  );
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runScenario = async (
  name: string,
  nolOwnsTrouser: boolean,
  act: (root: HTMLElement) => void,
) => {
  const fixture = buildCrossCardFixture({ nolOwnsTrouser });
  const host = document.createElement("div");
  document.body.appendChild(host);
  let latest: Omit<Snapshot, "selectCalls"> | null = null;
  const win = window as unknown as { __selectCalls: number };
  win.__selectCalls = 0;
  const root = createRoot(host);
  root.render(
    <Studio
      initialOrder={fixture.order}
      fredId={fixture.fredId}
      initialForm={fixture.fred}
      report={(snapshot) => {
        latest = snapshot;
      }}
    />,
  );
  await wait(50);
  const before = latest!;
  act(host);
  await wait(50);
  const after = latest!;
  root.unmount();
  host.remove();
  return {
    name,
    fredId: fixture.fredId,
    nolId: fixture.nolId,
    before,
    after: { ...after, selectCalls: win.__selectCalls },
  };
};

const nolCheckbox = (root: HTMLElement, garment: string) => {
  const box = root.querySelector<HTMLInputElement>(
    `input[type="checkbox"][aria-label="${garment} for Nol"]`,
  );
  if (!box) throw new Error(`no ${garment} checkbox for Nol`);
  return box;
};

const main = async () => {
  const results = [
    // Real bubbling click on the box itself (the B1 path).
    await runScenario("tick", false, (root) => nolCheckbox(root, "Trouser").click()),
    await runScenario("untick", true, (root) => nolCheckbox(root, "Trouser").click()),
    // Clicking the pill text: label activation dispatches a second click on the box.
    await runScenario("tick-label", false, (root) =>
      nolCheckbox(root, "Trouser").closest("label")!.click(),
    ),
    // Empty card chrome (the Fit legend) still selects the card.
    await runScenario("chrome", false, (root) => {
      const legend = [...nolCheckbox(root, "Trouser").closest("article")!.querySelectorAll("legend")]
        .find((node) => node.textContent?.includes("Fit for measurements"));
      legend!.click();
    }),
  ];
  document.title = JSON.stringify(results);
};

main().catch((error: unknown) => {
  document.title = JSON.stringify({ error: String((error as Error)?.stack || error) });
});
