import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import PrivateBatchSetupView from "./src/components/PrivateBatchSetupView";
import { HomepageDraftReplacementDialog } from "./src/components/HomepageDraftReplacementDialog";
import type { BusinessSettings } from "./src/types";
import { OrderContextDetails, StudioOrderContextIndicator } from "./src/components/CustomerOrderContext";
import { resolveCustomerOrderContextPresentation } from "./src/utils/customerOrderContextPresentation";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const businessSettings = {
  batchSettings: {
    minParticipantsRequired: 10,
    maxGarmentsPerBatch: 300,
  },
  applicationSettings: { defaultCountry: "Netherlands" },
} as BusinessSettings;

const setupMarkup = renderToStaticMarkup(
  createElement(PrivateBatchSetupView, {
    businessSettings,
    onBack: () => undefined,
    onSubmit: async () => ({ status: "created" as const }),
  }),
);
assert.match(setupMarkup, /Create a Private Batch/);
assert.match(setupMarkup, /Private Batch Name/);
assert.match(setupMarkup, /Occasion \/ Purpose/);
assert.match(setupMarkup, /Description/);
assert.doesNotMatch(setupMarkup, /Public \/ Private|Save as Draft|ownerUid|organizer ID/i);

const createMarkup = renderToStaticMarkup(
  createElement(HomepageDraftReplacementDialog, {
    existingOrderLabel: "Saved order",
    clickedBatchName: "this new Private Batch",
    isIndividualDraft: false,
    canContinueExisting: false,
    busy: false,
    targetAction: "create",
    unavailableMessage: "This saved order cannot be reopened from this screen.",
    onContinueExisting: () => undefined,
    onDiscardAndJoin: () => undefined,
    onCancel: () => undefined,
  }),
);
assert.match(createMarkup, /To create this new Private Batch/);
assert.match(createMarkup, /Discard &amp; Create Private Batch/);

let submissions = 0;
let resolveSubmission!: () => void;
const pendingSubmission = new Promise<void>((resolve) => {
  resolveSubmission = resolve;
});
let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(
    createElement(PrivateBatchSetupView, {
      businessSettings,
      onBack: () => undefined,
      onSubmit: async (values) => {
        submissions += 1;
        assert.equal(values.batchName, "Family Wedding 2026");
        assert.equal(values.occasion, "Wedding");
        await pendingSubmission;
        return { status: "created" as const };
      },
    }),
  );
});

const root = renderer.root;
const form = root.findByType("form");
await act(async () => {
  form.props.onSubmit({ preventDefault: () => undefined });
});
assert.match(root.findByProps({ role: "alert" }).children.join(""), /name for your Private Batch/);

const change = async (testId: string, value: string) => {
  await act(async () => {
    root.findByProps({ "data-testid": testId }).props.onChange({ target: { value } });
  });
};
await change("private-batch-name", "Family Wedding 2026");
await change("private-batch-occasion", "Wedding");
await change("private-batch-country", "Netherlands");
await change("private-batch-city", "Eindhoven");
await change("private-batch-delivery-target", "2027-06");
await change("private-batch-participants", "12");
await change("private-batch-closing-date", "2027-04-01");

await act(async () => {
  void form.props.onSubmit({ preventDefault: () => undefined });
  void form.props.onSubmit({ preventDefault: () => undefined });
  await Promise.resolve();
});
assert.equal(submissions, 1, "Rapid submit must invoke durable creation only once.");
assert.equal(
  root.findByProps({ "data-testid": "create-private-batch-submit" }).props.disabled,
  true,
);
await act(async () => {
  resolveSubmission();
  await pendingSubmission;
});
await act(async () => renderer.unmount());

const privatePresentation = resolveCustomerOrderContextPresentation(
  {
    orderType: "Group Organizer",
    batchId: "private_batch_123456",
    batchName: "Family Wedding 2026",
    batchVisibility: "PRIVATE",
  },
  [],
);
assert.deepEqual(privatePresentation, {
  kind: "private",
  studioLabel: "Private Batch",
  detailsOrderType: "Private Batch",
  batchName: "Family Wedding 2026",
  role: "Organizer",
});

const privateContextMarkup = renderToStaticMarkup(
  createElement("div", null,
    createElement(StudioOrderContextIndicator, { context: privatePresentation }),
    createElement(OrderContextDetails, { context: privatePresentation }),
  ),
);
assert.match(privateContextMarkup, /Private Batch.*Family Wedding 2026/);
assert.match(privateContextMarkup, /Order type.*Private Batch/);
assert.match(privateContextMarkup, /Role.*Organizer/);

const publicPresentation = resolveCustomerOrderContextPresentation(
  {
    orderType: "Group Organizer",
    batchId: "public_group_123456",
    batchName: "Public family group",
    batchVisibility: "PUBLIC",
  },
  [],
);
assert.equal(publicPresentation.kind, "community");

console.log("PASS: Private Batch customer setup validation, single-flight creation, conflict copy, and organizer presentation");
