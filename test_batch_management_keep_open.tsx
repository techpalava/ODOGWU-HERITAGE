/**
 * Admin Edit Timeline: "Keep open after end date (ongoing)" toggle, optional
 * "Open until" date, the effective customer state next to the stored status,
 * and the save message. StorageService.saveBatches is stubbed: nothing is
 * written. Requires the Vite production Firebase harness.
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
};

type TextNode = { children: ReadonlyArray<TextNode | string> };
const textOf = (node: TextNode): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");

const mount = async (batches: Batch[]) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(createElement(BatchManagementPanel, { batches }));
  });
  return renderer;
};

const byTestId = (renderer: ReturnType<typeof create>, id: string) =>
  renderer.root.findAll((node) => node.props?.["data-testid"] === id && typeof node.type === "string");

// The Edit Timeline panel has a Save at the top and the bottom (same handler):
// use the first button with the label.
const button = (renderer: ReturnType<typeof create>, label: string): ReactTestInstance => {
  const [found] = renderer.root.findAll(
    (node) => node.type === "button" && textOf(node as unknown as TextNode).trim() === label,
  );
  assert.ok(found, `button "${label}"`);
  return found;
};

try {
  // Stored OPEN past its end date: the admin sees what customers see.
  const list = await mount([avatars]);
  const [state] = byTestId(list, "batch-effective-order-state");
  assert.ok(state, "effective state is shown next to the stored status");
  assert.match(textOf(state as unknown as TextNode), /OPEN \(expired 30 Sept? 2026 \u2014 customers see closed\)/);
  assert.equal(state.props["data-customers-can-order"], "false");

  // Edit Timeline -> toggle on -> Open until -> Save.
  await act(async () => button(list, "Edit Timeline").props.onClick());
  const [toggle] = byTestId(list, "batch-keep-open-after-end-date");
  assert.equal(toggle.props.checked, false, "the toggle defaults off");
  await act(async () => toggle.props.onChange({ target: { checked: true } }));
  const untilInput = list.root
    .find((node) => typeof node.type !== "string" && node.props?.label === "Open until (optional)")
    .find((node) => node.type === "input");
  // Earlier than the end date is rejected.
  await act(async () => untilInput.props.onChange({ target: { value: "2026-09-01" } }));
  await act(async () => button(list, "Save").props.onClick());
  assert.equal(saved.length, 0);
  assert.match(textOf(list.root as unknown as TextNode), /The "Open until" date must be on or after the end date\./);

  await act(async () => untilInput.props.onChange({ target: { value: "2099-11-30" } }));
  await act(async () => {
    await button(list, "Save").props.onClick();
  });
  assert.equal(saved.length, 1);
  const savedAvatars = saved[0].find((batch) => batch.id === "batch-6")!;
  assert.equal(savedAvatars.keepOpenAfterEndDate, true);
  assert.equal(savedAvatars.ongoingUntil, "2099-11-30");
  assert.equal(savedAvatars.status, "OPEN");
  assert.equal(savedAvatars.endDate, "2026-09-30", "dates are unchanged");
  assert.match(
    textOf(list.root as unknown as TextNode),
    /Saved\. The homepage button is now "Join the Avatars"\. Avatars: OPEN \u00b7 ongoing until 30 Nov 2099\./,
  );
  await act(async () => list.unmount());

  // Turning the toggle off drops the Open until date and explains the result.
  const ongoing = await mount([{ ...avatars, keepOpenAfterEndDate: true, ongoingUntil: "2099-11-30" }]);
  const [ongoingState] = byTestId(ongoing, "batch-effective-order-state");
  assert.equal(ongoingState.props["data-customers-can-order"], "true");
  await act(async () => button(ongoing, "Edit Timeline").props.onClick());
  const [ongoingToggle] = byTestId(ongoing, "batch-keep-open-after-end-date");
  assert.equal(ongoingToggle.props.checked, true);
  await act(async () => ongoingToggle.props.onChange({ target: { checked: false } }));
  await act(async () => {
    await button(ongoing, "Save").props.onClick();
  });
  const savedOff = saved[1].find((batch) => batch.id === "batch-6")!;
  assert.equal(savedOff.keepOpenAfterEndDate, false);
  assert.equal("ongoingUntil" in savedOff, false, "Open until is removed with the toggle");
  assert.match(
    textOf(ongoing.root as unknown as TextNode),
    /Saved\. No Type B homepage button is currently eligible\. Avatars: OPEN \(expired 30 Sept? 2026 \u2014 customers see closed\)\. Turn on "Keep open after end date \(ongoing\)" to keep taking orders\./,
  );
  await act(async () => ongoing.unmount());
} finally {
  StorageService.saveBatches = originalSave;
}

console.log("PASS: admin keep-open toggle, Open until date and effective state");
