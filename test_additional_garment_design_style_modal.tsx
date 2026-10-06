import assert from "node:assert/strict";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { FutureAdditionalGarmentDesignStyleDialog } from "./src/components/FutureAdditionalGarmentDesignStyleDialog";
import type { DesignStyleStepCatalogueEntry } from "./src/utils/designStyleStepRuntime";

const textContent = (node: { children?: readonly unknown[] } | string | null | undefined): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => textContent(child as never)).join("");
  if (typeof node === "object" && "children" in node) {
    return textContent((node as { children?: readonly unknown[] }).children as never);
  }
  return "";
};

const entry = {
  style: {
    id: "style-shirt-1",
    name: "Heritage Shirt",
    description: "A classic shirt design",
    image: "",
  },
  presentation: {
    tier: "exact_match",
    selectable: true,
    requiresAdaptationConfirmation: false,
    originalCompositionLabel: "Shirt",
    selectedGarmentLabels: ["Standard Shirt"],
    customerReason: "Designed for Standard Shirt.",
  },
  selected: false,
  request: {
    runtimeGeneration: 1,
    expectedLedgerRevision: 1,
    target: {
      garmentKey: "additional:shirt:1",
      occurrenceToken: "additional:shirt:1@3",
    },
    styleId: "style-shirt-1",
    sourceKey: "catalog:style-shirt-1",
    eligibilityFingerprint: "fp-1",
  },
  requestsByOccurrenceToken: {
    "additional:shirt:1@3": {
      runtimeGeneration: 1,
      expectedLedgerRevision: 1,
      target: {
        garmentKey: "additional:shirt:1",
        occurrenceToken: "additional:shirt:1@3",
      },
      styleId: "style-shirt-1",
      sourceKey: "catalog:style-shirt-1",
      eligibilityFingerprint: "fp-1",
    },
  },
  selectedOccurrenceLabels: [],
  referenceGarmentTypes: ["shirt"],
  adaptationCopy: null,
} as unknown as DesignStyleStepCatalogueEntry;

let selected: DesignStyleStepCatalogueEntry | null = null;
let cancelled = false;
let renderer: ReactTestRenderer;

await act(async () => {
  renderer = create(
    <FutureAdditionalGarmentDesignStyleDialog
      garmentType="shirt"
      garmentKey="additional:shirt:1"
      catalogueEntries={[entry]}
      onSelectStyle={(next) => {
        selected = next;
      }}
      onCancel={() => {
        cancelled = true;
      }}
    />,
  );
  await Promise.resolve();
});

assert.match(
  textContent(renderer!.root),
  /Choose Design Style for Shirt/,
  "modal title must prefer the garment type label",
);
assert.equal(
  renderer!.root.findByProps({
    "data-additional-garment-design-style-dialog": "true",
  }).props["data-garment-key"],
  "additional:shirt:1",
);
const card = renderer!.root.findByProps({
  "data-testid": "additional-garment-design-style-card",
});
assert.equal(card.props["data-garment-key"], "additional:shirt:1");

await act(async () => {
  card
    .findAllByType("button")
    .find((button) => textContent(button).trim().startsWith("Use This Design"))!
    .props.onClick();
  await Promise.resolve();
});
assert.equal(selected?.style.id, "style-shirt-1");

await act(async () => {
  renderer!.update(
    <FutureAdditionalGarmentDesignStyleDialog
      garmentType="shirt"
      garmentKey="additional:shirt:1"
      catalogueEntries={[entry]}
      onSelectStyle={(next) => {
        selected = next;
      }}
      onCancel={() => {
        cancelled = true;
      }}
    />,
  );
  await Promise.resolve();
});

await act(async () => {
  renderer!.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === "Close design style picker")!
    .props.onClick();
  await Promise.resolve();
});
assert.equal(cancelled, true);

act(() => renderer!.unmount());
console.log("PASS: Additional Garment Design Style modal bind and cancel");
