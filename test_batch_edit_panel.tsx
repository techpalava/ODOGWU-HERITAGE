/**
 * Admin Edit Timeline full-width panel: every field the old edit row had is
 * present once and editable, both Save buttons run the same save, and both
 * Cancel buttons close the panel without saving. StorageService.saveBatches
 * is stubbed: nothing is written. Requires the Vite production Firebase harness.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { BatchManagementPanel } from "./src/components/BatchManagementPanel";
import { StorageService } from "./src/services/storageService";
import type { Batch } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const saved: Batch[][] = [];
const originalSave = StorageService.saveBatches;
StorageService.saveBatches = async (batches: Batch[]) => {
  saved.push(batches.map((batch) => ({ ...batch })));
};

const avatars: Batch = {
  id: "batch-6",
  batchNumber: 6,
  name: "Avatars",
  startDate: "2026-07-06",
  endDate: "2026-09-30",
  duration: "Jul 06 - Sep 30, 2026",
  targetGarments: 72,
  currentGarments: 26,
  currentOrders: 18,
  currentCustomers: 12,
  status: "OPEN",
  allowOrders: true,
  isAutoScheduled: false,
  isActive: true,
  visibility: "PUBLIC",
  newParticipants: 5,
  previousParticipants: 3,
  dressesMade: 12,
};
const musketeers: Batch = {
  ...avatars,
  id: "batch-8",
  batchNumber: 8,
  name: "Musketeers",
  startDate: "2026-10-12",
  endDate: "2026-11-16",
  status: "YET_TO_START",
  isActive: false,
};

type TextNode = { children: ReadonlyArray<TextNode | string> };
const textOf = (node: TextNode): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");

let renderer!: ReturnType<typeof create>;
const root = () => renderer.root;
const byTestId = (id: string) =>
  root().findAll((node) => node.props?.["data-testid"] === id && typeof node.type === "string");
const buttons = (label: string) =>
  root().findAll(
    (node) => node.type === "button" && textOf(node as unknown as TextNode).trim() === label,
  );
const panel = () => {
  const [found] = byTestId("batch-edit-panel");
  return found;
};
// Labelled InputField / SelectField controls inside the panel.
const control = (label: string): ReactTestInstance => {
  const matches = panel().findAll(
    (node) => typeof node.type !== "string" && node.props?.label === label,
  );
  assert.equal(matches.length, 1, `exactly one "${label}" field in the panel`);
  return matches[0].find((node) => node.type === "input" || node.type === "select");
};
// Checkboxes are identified by the text next to them.
const checkbox = (label: string): ReactTestInstance => {
  const matches = panel().findAll(
    (node) =>
      node.type === "input" &&
      node.props.type === "checkbox" &&
      node.parent !== null &&
      textOf(node.parent as unknown as TextNode).trim() === label,
  );
  assert.equal(matches.length, 1, `exactly one "${label}" checkbox in the panel`);
  return matches[0];
};
const openEditor = async () => {
  await act(async () => buttons("Edit Timeline")[0].props.onClick());
  assert.ok(panel(), "Edit Timeline opens the full-width panel");
};

const LABELLED_FIELDS = [
  "Batch Name",
  "Display Order",
  "Homepage Visibility",
  "Override Status",
  "Start Date",
  "End Date",
  "Target Garments",
  "Current Garments",
  "New",
  "Returning",
  "Dresses",
];
const CHECKBOXES = [
  "Auto-Pilot",
  "Is Active Batch",
  "Allow Orders",
  "Keep open after end date (ongoing)",
];

try {
  await act(async () => {
    renderer = create(createElement(BatchManagementPanel, { batches: [avatars, musketeers] }));
  });
  assert.equal(byTestId("batch-edit-panel").length, 0, "no panel until Edit Timeline");
  assert.equal(buttons("Edit Timeline").length, 2);

  // --- Field list: every old edit-row field is in the panel, once ----------
  await openEditor();
  const cell = panel();
  assert.equal(cell.type, "td");
  assert.equal(cell.props.colSpan, 8, "the panel spans every table column");
  for (const label of LABELLED_FIELDS) control(label);
  for (const label of CHECKBOXES) checkbox(label);
  assert.equal(control("Override Status").props.disabled, false, "manual batch: status override enabled");
  await act(async () => checkbox("Keep open after end date (ongoing)").props.onChange({ target: { checked: true } }));
  control("Open until (optional)");
  // The batch row itself stays, marked as being edited; the other row keeps its button.
  assert.match(textOf(root() as unknown as TextNode), /Editing…/);
  assert.equal(buttons("Edit Timeline").length, 1);
  // Save and Cancel at the top and the bottom.
  assert.equal(byTestId("batch-edit-save-top").length, 1);
  assert.equal(byTestId("batch-edit-save-bottom").length, 1);
  assert.equal(byTestId("batch-edit-cancel-top").length, 1);
  assert.equal(byTestId("batch-edit-cancel-bottom").length, 1);

  // --- Both Save buttons run the same save with the same values -----------
  const edit = async () => {
    const change = (label: string, value: string) =>
      act(async () => control(label).props.onChange({ target: { value } }));
    await change("Batch Name", "Avatars II");
    await change("Display Order", "4");
    await change("Homepage Visibility", "PRIVATE");
    await change("Start Date", "2026-07-07");
    await change("End Date", "2026-10-01");
    await change("Target Garments", "80");
    await change("Current Garments", "30");
    await change("New", "7");
    await change("Returning", "4");
    await change("Dresses", "15");
    await change("Override Status", "RECRUITING");
    await act(async () => checkbox("Allow Orders").props.onChange({ target: { checked: false } }));
    await act(async () => checkbox("Keep open after end date (ongoing)").props.onChange({ target: { checked: true } }));
    await change("Open until (optional)", "2099-11-30");
  };
  const expected = {
    name: "Avatars II",
    displayOrder: 4,
    visibility: "PRIVATE",
    startDate: "2026-07-07",
    endDate: "2026-10-01",
    targetGarments: 80,
    currentGarments: 30,
    newParticipants: 7,
    previousParticipants: 4,
    dressesMade: 15,
    status: "RECRUITING",
    allowOrders: false,
    isActive: true,
    isAutoScheduled: false,
    keepOpenAfterEndDate: true,
    ongoingUntil: "2099-11-30",
  };
  const savedAvatars = (index: number) => {
    const batch = saved[index].find((entry) => entry.id === "batch-6")!;
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(expected)) picked[key] = (batch as any)[key];
    return picked;
  };

  await edit();
  await act(async () => {
    await byTestId("batch-edit-save-top")[0].props.onClick();
  });
  assert.equal(saved.length, 1, "top Save saves");
  assert.deepEqual(savedAvatars(0), expected);
  assert.equal(byTestId("batch-edit-panel").length, 0, "the panel closes after saving");
  assert.match(textOf(root() as unknown as TextNode), /^[\s\S]*Saved\./);

  await openEditor();
  await edit();
  await act(async () => {
    await byTestId("batch-edit-save-bottom")[0].props.onClick();
  });
  assert.equal(saved.length, 2, "bottom Save saves");
  assert.deepEqual(savedAvatars(1), expected, "both Save buttons save the same values");
  assert.equal(byTestId("batch-edit-panel").length, 0, "the panel closes after saving");

  // Validation runs for either button.
  await openEditor();
  await act(async () => control("End Date").props.onChange({ target: { value: "2026-01-01" } }));
  await act(async () => {
    await byTestId("batch-edit-save-top")[0].props.onClick();
  });
  assert.equal(saved.length, 2);
  assert.match(textOf(root() as unknown as TextNode), /The registration closing date must follow the opening date\./);
  await act(async () => {
    await byTestId("batch-edit-save-bottom")[0].props.onClick();
  });
  assert.equal(saved.length, 2);
  assert.ok(panel(), "panel stays open on a validation error");
  assert.equal(
    byTestId("batch-edit-save-top")[0].props.onClick,
    byTestId("batch-edit-save-bottom")[0].props.onClick,
    "both Save buttons use the same save handler",
  );

  // --- Cancel (top and bottom) closes without saving -----------------------
  await act(async () => byTestId("batch-edit-cancel-top")[0].props.onClick());
  assert.equal(byTestId("batch-edit-panel").length, 0, "top Cancel closes the panel");
  await openEditor();
  await act(async () => control("Batch Name").props.onChange({ target: { value: "Changed" } }));
  await act(async () => byTestId("batch-edit-cancel-bottom")[0].props.onClick());
  assert.equal(byTestId("batch-edit-panel").length, 0, "bottom Cancel closes the panel");
  assert.equal(saved.length, 2, "Cancel never saves");
  assert.equal(buttons("Edit Timeline").length, 2);
} finally {
  StorageService.saveBatches = originalSave;
  await act(async () => renderer?.unmount());
}

console.log("PASS: admin Edit Timeline full-width panel keeps every field, two Save and two Cancel buttons");
