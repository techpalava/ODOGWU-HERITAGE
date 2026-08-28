import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement, useRef, useState } from "react";
import { act, create } from "react-test-renderer";
import type { DesignStudioStageId } from "./src/types";
import type { LiveOrderSummaryView } from "./src/utils/designStudioLiveOrderSummary";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;

const {
  DesignStudioOrderSummary,
  DesignStudioOrderSummaryTrigger,
} = await import("./src/components/DesignStudioOrderSummary");

const sampleView: LiveOrderSummaryView = {
  sections: [
    {
      id: "garments",
      title: "Garments",
      editStage: "garment_type",
      lines: [{ id: "base:shirt", label: "Shirt", detail: null, amountLabel: null }],
    },
    {
      id: "fabrics",
      title: "Fabrics",
      editStage: "fabric",
      lines: [
        {
          id: "fabric-base:shirt",
          label: "Shirt",
          detail: "Royal Forest Mosaic",
          amountLabel: null,
        },
      ],
    },
    {
      id: "optional_extras",
      title: "Optional Extra Garments",
      editStage: "custom_details",
      lines: [
        {
          id: "additional:shirt:1",
          label: "Shirt 1",
          detail: "Imperial Sapphire Link · Standard Length Shirt, Mid-Long Sleeve",
          amountLabel: "€70.00",
        },
      ],
    },
    {
      id: "measurements",
      title: "Measurements",
      editStage: "measurement",
      lines: [
        {
          id: "measurements-complete",
          label: "Mid Risk — Complete",
          detail: null,
          amountLabel: null,
        },
      ],
    },
    {
      id: "delivery",
      title: "Delivery & Pickup",
      editStage: "shipping",
      lines: [
        {
          id: "Delivery Method",
          label: "Delivery Method",
          detail: "Pick Up in Eindhoven",
          amountLabel: null,
        },
      ],
    },
  ],
  totalStatus: "exact",
  totalLabel: "Total",
  totalValueLabel: "€245.00",
  totalAmountCents: 24500,
  quoteRequired: false,
};

const textOf = (node: { children?: unknown[] } | string | null): string => {
  if (typeof node === "string") return node;
  if (!node?.children) return "";
  return node.children
    .map((child) => textOf(child as { children?: unknown[] } | string))
    .join("");
};

let renderer: ReturnType<typeof create>;
act(() => {
  renderer = create(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      variant: "sidebar",
      unlockedStages: new Set<DesignStudioStageId>(["garment_type", "fabric"]),
      currentStageId: "design_style",
      onEditStage: () => undefined,
    }),
  );
});

assert.equal(
  renderer.root.findAllByProps({ "data-testid": "live-order-summary-sidebar" })
    .length,
  1,
);
assert.equal(
  renderer.root.findAllByProps({ "data-testid": "live-order-summary-drawer" })
    .length,
  0,
);
assert.equal(
  textOf(
    renderer.root.findByProps({
      "data-testid": "live-order-summary-total-value",
    }),
  ),
  "€245.00",
);
assert.ok(textOf(renderer.root).includes("Total"));
assert.ok(textOf(renderer.root).includes("Shirt"));
assert.ok(textOf(renderer.root).includes("Royal Forest Mosaic"));
assert.ok(textOf(renderer.root).includes("€70.00"));
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-fabrics",
  }).length,
  1,
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-measurements",
  }).length,
  0,
  "locked Measurement Edit must stay hidden",
);

act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      variant: "sidebar",
      unlockedStages: new Set<DesignStudioStageId>(["fabric"]),
      currentStageId: "fabric",
      onEditStage: () => undefined,
    }),
  );
});
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-fabrics",
  }).length,
  0,
  "Edit for the current stage stays hidden",
);

let editedStage: DesignStudioStageId | null = null;
act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      variant: "sidebar",
      unlockedStages: new Set<DesignStudioStageId>(["fabric", "measurement"]),
      currentStageId: "shipping",
      onEditStage: (stage) => {
        editedStage = stage;
      },
    }),
  );
});
act(() => {
  renderer.root
    .findByProps({ "data-testid": "live-order-summary-edit-fabrics" })
    .props.onClick();
});
assert.equal(editedStage, "fabric");

act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      variant: "drawer",
      unlockedStages: new Set<DesignStudioStageId>(["fabric"]),
      currentStageId: "garment_type",
      onClose: () => undefined,
    }),
  );
});
const drawer = renderer.root.findByProps({
  "data-testid": "live-order-summary-drawer",
});
assert.equal(drawer.props.role, "dialog");
assert.equal(drawer.props["aria-modal"], "true");
assert.ok(drawer.props["aria-labelledby"]);
assert.ok(typeof drawer.props.onKeyDown === "function");
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-drawer-close",
  }).length,
  1,
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-drawer-scroll",
  }).props.className,
  /overflow-y-auto/,
);

const LiveSummaryMobileHarness = ({
  view,
}: {
  view: LiveOrderSummaryView;
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return createElement(
    "div",
    null,
    createElement(DesignStudioOrderSummaryTrigger, {
      totalLabel: view.totalLabel,
      totalValueLabel: view.totalValueLabel,
      onOpen: () => setOpen(true),
      openButtonRef: triggerRef,
    }),
    open
      ? createElement(DesignStudioOrderSummary, {
          view,
          variant: "drawer",
          unlockedStages: new Set<DesignStudioStageId>(["fabric"]),
          currentStageId: "fabric",
          onClose: () => {
            setOpen(false);
            triggerRef.current?.focus?.({ preventScroll: true });
          },
        })
      : null,
  );
};

let harness: ReturnType<typeof create>;
act(() => {
  harness = create(createElement(LiveSummaryMobileHarness, { view: sampleView }));
});
assert.equal(
  harness.root.findAllByProps({ "data-testid": "live-order-summary-drawer" })
    .length,
  0,
);
act(() => {
  harness.root
    .findByProps({ "data-testid": "live-order-summary-view-order" })
    .props.onClick();
});
assert.equal(
  harness.root.findAllByProps({ "data-testid": "live-order-summary-drawer" })
    .length,
  1,
  "View Order must open the drawer",
);
assert.equal(
  harness.root.findByProps({
    "data-testid": "live-order-summary-drawer-close",
  }).props["aria-label"],
  "Close order summary",
);
act(() => {
  harness.root
    .findByProps({ "data-testid": "live-order-summary-drawer" })
    .props.onKeyDown({
      key: "Escape",
      preventDefault() {},
    });
});
assert.equal(
  harness.root.findAllByProps({ "data-testid": "live-order-summary-drawer" })
    .length,
  0,
  "Escape must close the drawer",
);
assert.equal(
  harness.root.findAllByProps({
    "data-testid": "live-order-summary-view-order",
  }).length,
  1,
);

let trigger: ReturnType<typeof create>;
act(() => {
  trigger = create(
    createElement(DesignStudioOrderSummaryTrigger, {
      totalLabel: "Current Subtotal",
      totalValueLabel: "€65.00",
      onOpen: () => undefined,
    }),
  );
});
assert.equal(
  textOf(
    trigger.root.findByProps({
      "data-testid": "live-order-summary-trigger-label",
    }),
  ),
  "Current Subtotal",
);
assert.equal(
  textOf(
    trigger.root.findByProps({
      "data-testid": "live-order-summary-trigger-total",
    }),
  ),
  "€65.00",
);
assert.ok(textOf(trigger.root).includes("View Order"));

const viewSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
assert.match(viewSource, /closeButtonRef\.current\?\.focus|mobileSummaryTriggerRef\.current\?\.focus/);
assert.match(viewSource, /closeMobileLiveOrderSummary/);
assert.match(
  viewSource,
  /showPersistentLiveOrderSummary \?[\s\S]*lg:hidden[\s\S]*DesignStudioOrderSummaryTrigger/,
);
assert.match(
  viewSource,
  /showPersistentLiveOrderSummary \?[\s\S]*hidden min-w-0 lg:block/,
);
assert.doesNotMatch(
  viewSource,
  /futureStageId === "summary"[\s\S]{0,80}DesignStudioOrderSummaryTrigger/,
);

const summarySource = readFileSync(
  new URL("./src/components/DesignStudioOrderSummary.tsx", import.meta.url),
  "utf8",
);
assert.match(summarySource, /closeButtonRef\.current\?\.focus/);
assert.match(summarySource, /event\.key === "Escape"/);
assert.match(summarySource, /aria-labelledby/);
assert.match(summarySource, /overflow-y-auto/);

console.log("test_design_studio_live_order_summary_ui.tsx: all assertions passed");
