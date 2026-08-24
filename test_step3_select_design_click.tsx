/**
 * Rendered Step 3 Select Design click regression.
 * Exercises activateFutureCatalogStyleSelection (production activation path)
 * through DormantFutureDesignStyleStep — not a mocked local setter.
 */
import assert from "node:assert/strict";
import { useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  DesignSource,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { activateFutureCatalogStyleSelection } from "./src/utils/designSourceState";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};

const compatibleStyle: StyleCategory = {
  id: "casual-native-1",
  name: "Casual Native",
  description: "Shirt + Trouser male catalogue fixture.",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const emptyUploadedDesign = {
  source: null,
  reference: null,
  composition: [],
  demographic: null,
  previewUrl: null,
  error: "",
  isUploading: false,
  isReplacing: false,
  isDeleting: false,
  isLoadingPreview: false,
  isConfirmed: false,
  isPricingActive: false,
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

/** Mirrors DesignStudioView.activateFutureCatalogStyle production wiring. */
const Step3SelectDesignHarness = () => {
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [futureDesignSource, setFutureDesignSource] =
    useState<DesignSource | null>(null);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);

  const activateFutureCatalogStyle = (styleId: string) => {
    const activated = activateFutureCatalogStyleSelection({
      styleId,
      primaryFabricCode: null,
    });
    setSelectedStyleId(activated.selectedStyleId);
    setFutureDesignSource(activated.designSource);
    setConfirmedKey(activated.confirmedDesignSourceKey);
  };

  return (
    <div data-testid="step3-select-design-harness">
      <DormantFutureDesignStyleStep
        styles={[compatibleStyle]}
        garmentTypeSelection={garmentTypeSelection}
        selectedStyleId={selectedStyleId}
        stagePrice={65}
        uploadedDesign={emptyUploadedDesign}
        pendingCatalogStyleName={null}
        isCatalogueLoading={false}
        stylesLoadState="ready"
        onSelectStyle={activateFutureCatalogStyle}
        onUploadDesignFile={() => undefined}
        onToggleUploadedGarment={() => undefined}
        onUploadedDemographicChange={() => undefined}
        onRemoveUploadedDesign={() => undefined}
        onRetryUploadedDesignDeletion={() => undefined}
        onContinueUploadedDesign={() => undefined}
        onBack={() => undefined}
        onReturnToGarmentType={() => undefined}
        onContinue={() => undefined}
      />
      <div data-testid="harness-selected-style-id">
        {selectedStyleId ?? ""}
      </div>
      <div data-testid="harness-design-source-kind">
        {futureDesignSource?.kind ?? ""}
      </div>
      <div data-testid="harness-design-source-style-id">
        {futureDesignSource?.kind === "catalog"
          ? futureDesignSource.styleId
          : ""}
      </div>
      <div data-testid="harness-confirmed-source-key">{confirmedKey ?? ""}</div>
    </div>
  );
};

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(<Step3SelectDesignHarness />);
});

const selectButtonsBefore = renderer.root
  .findAllByType("button")
  .filter((button) => textContent(button).includes("Select Design"));
assert.equal(selectButtonsBefore.length, 1, "one enabled Select Design expected");
assert.equal(selectButtonsBefore[0]!.props.disabled, false);
assert.equal(selectButtonsBefore[0]!.props["aria-pressed"], false);

const continueBefore = renderer.root
  .findByProps({ "data-testid": "future-design-style-continue-action" })
  .findByType("button");
assert.equal(continueBefore.props.disabled, true);

await act(async () => {
  selectButtonsBefore[0]!.props.onClick();
});

assert.equal(
  textContent(
    renderer.root.findByProps({ "data-testid": "harness-selected-style-id" }),
  ),
  "casual-native-1",
);
assert.equal(
  textContent(
    renderer.root.findByProps({ "data-testid": "harness-design-source-kind" }),
  ),
  "catalog",
);
assert.equal(
  textContent(
    renderer.root.findByProps({
      "data-testid": "harness-design-source-style-id",
    }),
  ),
  "casual-native-1",
);
assert.equal(
  textContent(
    renderer.root.findByProps({ "data-testid": "harness-confirmed-source-key" }),
  ),
  "catalog:casual-native-1",
);

const selectedButtons = renderer.root
  .findAllByType("button")
  .filter((button) => textContent(button).trim() === "Selected");
assert.equal(selectedButtons.length, 1);
assert.equal(selectedButtons[0]!.props["aria-pressed"], true);

const continueAfter = renderer.root
  .findByProps({ "data-testid": "future-design-style-continue-action" })
  .findByType("button");
assert.equal(continueAfter.props.disabled, false);
assert.match(textContent(continueAfter), /Continue to Custom Details/i);

console.log("PASS: Step 3 Select Design click activates catalogue source");
