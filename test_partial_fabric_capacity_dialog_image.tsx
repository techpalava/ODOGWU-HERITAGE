import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { Fabric } from "./src/types";
import type { FuturePartialFabricAssignmentTargetPresentation } from "./src/utils/designStudioFutureFabricStage";
import { PartialFabricCapacityAssignmentDialog } from "./src/components/PartialFabricCapacityAssignmentDialog";
import { setDefaultImageRetryDelaysForTests } from "./src/hooks/useImageLoadRetry";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const fabric = (code: string, name: string, extra: Partial<Fabric> = {}): Fabric => ({
  code,
  name,
  description: name,
  color: "Ivory",
  colorHex: "",
  category: "Test",
  price: 10,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  ...extra,
});

const ivory = fabric("IVORY", "Classic Ivory Shield", {
  image: " https://example.test/ivory.jpg ",
});
const plain = fabric("PLAIN", "Plain Weave");
const fabrics = [ivory, plain];
const fabricByCode = new Map(fabrics.map((entry) => [entry.code, entry]));
const fabricNameByCode = new Map(fabrics.map((entry) => [entry.code, entry.name]));

const target = (
  allocationId: string,
  fabricCode: string,
  fabricSelectionNumber: number,
): FuturePartialFabricAssignmentTargetPresentation => ({
  allocationId,
  fabricCode,
  fabricSelectionNumber,
  usedUnits: 1,
  remainingUnits: 1,
  projectedUsedUnits: 2,
  assignedGarmentKeys: ["base:long_shirt"],
  assignedGarmentLabels: ["Long Shirt"],
  addGarmentKey: "base:shirt",
  addGarmentLabel: "Shirt",
});

const render = (targets: FuturePartialFabricAssignmentTargetPresentation[]) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(PartialFabricCapacityAssignmentDialog, {
        garmentLabel: "Standard Shirt",
        fabricNameByCode,
        fabricByCode,
        targets,
        onConfirm: () => undefined,
        onCancel: () => undefined,
        onUseDifferentFabric: () => undefined,
      }),
    );
  });
  return renderer;
};

const previews = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-assigned-fabric-preview": "true" });

// Single target: "Add to this fabric?" shows the Fabric image.
const single = render([target("alloc-1", "IVORY", 1)]);
const singlePreviews = previews(single.root);
assert.equal(singlePreviews.length, 1, "the Fabric card must show its image");
assert.equal(singlePreviews[0].props["data-fabric-code"], "IVORY");
const singleImage = singlePreviews[0].findByType("img");
assert.equal(singleImage.props.src, "https://example.test/ivory.jpg");
assert.equal(singleImage.props.alt, "Classic Ivory Shield");
assert.equal(singleImage.props.loading, "lazy");
assert.match(
  String(singlePreviews[0].props.className),
  /sm:w-\[128px\]/,
  "the image sits beside the details on wider screens and above on narrow ones",
);
assert.ok(
  single.root.findAll((node) => typeof node.props.className === "string" && /flex-col/.test(node.props.className) && /sm:flex-row/.test(node.props.className)).length >= 1,
);

// A broken image URL is retried (shared hook; gaps shortened to 1, 2, 4, 8 ms
// here), then falls back instead of leaving an empty frame.
setDefaultImageRetryDelaysForTests([1, 2, 4, 8]);
act(() => single.update(
  createElement(PartialFabricCapacityAssignmentDialog, {
    garmentLabel: "Standard Shirt",
    fabricNameByCode,
    fabricByCode,
    targets: [target("alloc-1", "IVORY", 1)],
    onConfirm: () => undefined,
    onCancel: () => undefined,
    onUseDifferentFabric: () => undefined,
  }),
));
for (let attempt = 0; attempt <= 4; attempt += 1) {
  act(() => previews(single.root)[0].findByType("img").props.onError());
  if (attempt < 4) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    assert.equal(previews(single.root)[0].findAllByType("img").length, 1, "still retrying");
  }
}
setDefaultImageRetryDelaysForTests(null);
assert.equal(previews(single.root)[0].findAllByType("img").length, 0);
assert.equal(
  previews(single.root)[0].findAllByProps({ "data-fabric-photo-reload": "true" }).length,
  1,
  "a failed photo offers Tap to reload photo",
);
assert.match(
  String(previews(single.root)[0].props["aria-label"]),
  /Fabric preview unavailable/,
);
act(() => single.unmount());

// Several targets: every card gets its own image or fallback.
const multi = render([target("alloc-1", "IVORY", 1), target("alloc-2", "PLAIN", 2)]);
const multiPreviews = previews(multi.root);
assert.deepEqual(
  multiPreviews.map((preview) => preview.props["data-fabric-code"]),
  ["IVORY", "PLAIN"],
);
assert.equal(multiPreviews[0].findByType("img").props.alt, "Classic Ivory Shield");
assert.equal(multiPreviews[1].findAllByType("img").length, 0, "no image means the fallback preview");
assert.equal(multiPreviews[1].props.role, "img");
assert.match(String(multiPreviews[1].props["aria-label"]), /Fabric preview unavailable/);
assert.equal(
  multi.root.findAllByProps({ "data-testid": "partial-fabric-capacity-select-alloc-2" }).length,
  1,
  "the Select action is unchanged",
);
act(() => multi.unmount());

// The Fabric step passes catalogue Fabrics into the dialog.
assert.match(
  readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8"),
  /<PartialFabricCapacityAssignmentDialog[\s\S]*?fabricByCode=\{fabricByCode\}/,
);

console.log("PASS: partial Fabric capacity dialog shows each Fabric image with fallback");
