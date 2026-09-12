import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { HomepageDraftReplacementDialog } from "./src/components/HomepageDraftReplacementDialog";

const noop = () => undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const communityMarkup = renderToStaticMarkup(
  createElement(HomepageDraftReplacementDialog, {
    existingOrderLabel: "Avatars",
    clickedBatchName: "Pioneers",
    isIndividualDraft: false,
    canContinueExisting: true,
    busy: false,
    onContinueExisting: noop,
    onDiscardAndJoin: noop,
    onCancel: noop,
  }),
);
assert.match(communityMarkup, /role="alertdialog"/);
assert.match(communityMarkup, /aria-modal="true"/);
assert.match(communityMarkup, /You already have an unfinished order/);
assert.match(
  communityMarkup,
  /Your current draft is for Avatars\. To join Pioneers, you&#x27;ll need to discard the unfinished Avatars order\./,
);
assert.match(communityMarkup, /Continue Avatars Order/);
assert.match(communityMarkup, /Discard &amp; Join Pioneers/);
assert.match(communityMarkup, /Cancel/);

const individualMarkup = renderToStaticMarkup(
  createElement(HomepageDraftReplacementDialog, {
    existingOrderLabel: "unused",
    clickedBatchName: "Pioneers",
    isIndividualDraft: true,
    canContinueExisting: true,
    busy: false,
    onContinueExisting: noop,
    onDiscardAndJoin: noop,
    onCancel: noop,
  }),
);
assert.match(individualMarkup, /You already have an unfinished Individual Order/);
assert.match(
  individualMarkup,
  /To join Pioneers, you&#x27;ll need to discard your unfinished Individual Order\./,
);
assert.match(individualMarkup, /Continue Individual Order/);

const closedMarkup = renderToStaticMarkup(
  createElement(HomepageDraftReplacementDialog, {
    existingOrderLabel: "Avatars",
    clickedBatchName: "Pioneers",
    isIndividualDraft: false,
    canContinueExisting: false,
    busy: false,
    onContinueExisting: noop,
    onDiscardAndJoin: noop,
    onCancel: noop,
  }),
);
assert.doesNotMatch(closedMarkup, /Continue Avatars Order/);
assert.match(closedMarkup, /This saved Community batch is no longer accepting orders/);
assert.match(closedMarkup, /Discard &amp; Join Pioneers/);

const source = readFileSync(
  "src/components/HomepageDraftReplacementDialog.tsx",
  "utf8",
);
assert.match(source, /event\.key === "Escape"/);
assert.match(source, /if \(!busy\) onCancel\(\)/);
assert.match(source, /data-homepage-draft-replacement-backdrop/);
assert.match(source, /if \(!busy\) onDiscardAndJoin\(\)/);
assert.match(source, /createPortal\(dialog, document\.body\)/);

// Mount the production dialog and invoke its real interaction callbacks. The
// browser pass below covers actual layout/focus; this fixture verifies the
// component's Escape, backdrop, action, and busy-state behavior without a DOM
// implementation dependency.
const keyListeners = new Set<(event: KeyboardEvent) => void>();
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
      if (type === "keydown") keyListeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
      if (type === "keydown") keyListeners.delete(listener);
    },
  },
});

let cancelled = 0;
let continued = 0;
let discarded = 0;
const renderInteractiveDialog = (busy: boolean) =>
  create(
    createElement(HomepageDraftReplacementDialog, {
      existingOrderLabel: "A very long saved Community batch name that must wrap safely",
      clickedBatchName: "A very long current Community batch name that must wrap safely",
      isIndividualDraft: false,
      canContinueExisting: true,
      busy,
      onContinueExisting: () => {
        continued += 1;
      },
      onDiscardAndJoin: () => {
        discarded += 1;
      },
      onCancel: () => {
        cancelled += 1;
      },
    }),
  );

let interactiveRenderer;
try {
  await act(async () => {
    interactiveRenderer = renderInteractiveDialog(false);
  });
  const root = interactiveRenderer!.root;
  const continueButton = root.findByProps({
    "data-homepage-draft-continue": "true",
  });
  const discardButton = root.findByProps({
    "data-homepage-draft-discard-and-join": "true",
  });
  const cancelButton = root.findByProps({
    "data-homepage-draft-cancel": "true",
  });
  const backdrop = root.findAllByType("button").find(
    (button) => button.props.tabIndex === -1,
  );
  assert.ok(backdrop, "Dialog must expose an interactive backdrop while idle.");

  await act(async () => continueButton.props.onClick());
  await act(async () => discardButton.props.onClick());
  await act(async () => cancelButton.props.onClick());
  await act(async () => backdrop!.props.onClick());
  assert.deepEqual({ continued, discarded, cancelled }, { continued: 1, discarded: 1, cancelled: 2 });

  await act(async () => {
    for (const listener of keyListeners) {
      listener({ key: "Escape", preventDefault: () => undefined } as KeyboardEvent);
    }
  });
  assert.equal(cancelled, 3, "Idle Escape must invoke the real cancellation callback.");

  await act(async () => {
    interactiveRenderer!.update(
      createElement(HomepageDraftReplacementDialog, {
        existingOrderLabel: "Avatars",
        clickedBatchName: "Pioneers",
        isIndividualDraft: false,
        canContinueExisting: true,
        busy: true,
        onContinueExisting: () => {
          continued += 1;
        },
        onDiscardAndJoin: () => {
          discarded += 1;
        },
        onCancel: () => {
          cancelled += 1;
        },
      }),
    );
  });
  const busyRoot = interactiveRenderer!.root;
  assert.equal(
    busyRoot.findByProps({ "data-homepage-draft-cancel": "true" }).props.disabled,
    true,
  );
  const busyBackdrop = busyRoot.findAllByType("button").find(
    (button) => button.props.tabIndex === -1,
  );
  assert.ok(busyBackdrop, "Dialog retains a backdrop while busy.");
  await act(async () => {
    busyRoot.findByProps({ "data-homepage-draft-cancel": "true" }).props.onClick();
    busyRoot.findByProps({ "data-homepage-draft-continue": "true" }).props.onClick();
    busyRoot.findByProps({ "data-homepage-draft-discard-and-join": "true" }).props.onClick();
    busyBackdrop!.props.onClick();
  });
  assert.deepEqual(
    { continued, discarded, cancelled },
    { continued: 1, discarded: 1, cancelled: 3 },
    "Busy controls and backdrop must be inert even if a test invokes their callbacks directly.",
  );
  assert.equal(
    busyRoot.findByProps({ "data-homepage-draft-continue": "true" }).props.disabled,
    true,
  );
  assert.equal(
    busyRoot.findByProps({ "data-homepage-draft-discard-and-join": "true" }).props.disabled,
    true,
  );
  await act(async () => {
    for (const listener of keyListeners) {
      listener({ key: "Escape", preventDefault: () => undefined } as KeyboardEvent);
    }
  });
  assert.equal(cancelled, 3, "Busy Escape must not visually cancel a started discard.");
} finally {
  if (interactiveRenderer) {
    await act(async () => interactiveRenderer!.unmount());
  }
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
}

console.log("PASS: homepage draft replacement dialog copy and safety semantics");
