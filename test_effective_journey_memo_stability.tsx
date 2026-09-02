/**
 * React-level memo/effect stability around the production effective-journey hook.
 */
import assert from "node:assert/strict";
import { createElement, useEffect, useRef, useState } from "react";
import { act, create } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type {
  FabricAllocationState,
  GarmentTypeStepSelection,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  getFutureFabricAllocationStateSignature,
  reconcileFutureFabricAllocationStateIfChanged,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { createUploadedDesignSource } from "./src/utils/designSourceState";
import { mergeUploadedDesignCompositionWithStep1 } from "./src/utils/uploadedDesignStep1";
import { useDesignStudioEffectiveJourneyComposition } from "./src/utils/useDesignStudioEffectiveJourneyComposition";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const step1 = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;

const composition = mergeUploadedDesignCompositionWithStep1({
  step1GarmentTypes: ["shirt"],
  additionalGarmentTypes: ["trouser"],
});
const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "stability-owner",
  mimeType: "image/jpeg",
  designReferenceId: "stability-ref",
  createdAt: "2026-01-01T00:00:00.000Z",
});
const uploaded = createUploadedDesignSource({
  uploadReference,
  fabricCapacityComposition: composition,
  demographic: "male",
});
assert.ok(uploaded);

const StabilityHarness = ({
  catalogInput,
  step1Selection,
  uploadedSource,
  onSettle,
}: {
  catalogInput: typeof catalog;
  step1Selection: GarmentTypeStepSelection;
  uploadedSource: NonNullable<typeof uploaded>;
  onSettle: (payload: {
    effectiveRef: GarmentTypeStepSelection;
    fabricWrites: number;
    fabricSignature: string;
  }) => void;
}) => {
  const {
    normalizedGarmentTypeCatalog,
    effectiveJourneyGarmentTypeSelection,
  } = useDesignStudioEffectiveJourneyComposition({
    customDetailCatalog: catalogInput,
    garmentTypeSelection: step1Selection,
    activeUploadedDesignSource: uploadedSource,
    confirmedDesignSourceKey: uploadedSource.sourceKey,
  });

  const [fabricState, setFabricState] = useState<FabricAllocationState>(() => {
    let state = FabricAllocationStateEngine.initialize();
    state = assignFutureFabricToGarment({
      state,
      garmentTypeSelection: step1Selection,
      garmentKey: "base:shirt",
      fabricCode: "STABLE-FAB",
    }).state;
    return state;
  });
  const fabricWritesRef = useRef(0);
  const lastEffectiveRef = useRef(effectiveJourneyGarmentTypeSelection);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    setFabricState((current) => {
      const next = reconcileFutureFabricAllocationStateIfChanged({
        state: current,
        garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
      });
      if (next !== current) {
        fabricWritesRef.current += 1;
      }
      return next;
    });
  }, [effectiveJourneyGarmentTypeSelection]);

  useEffect(() => {
    onSettle({
      effectiveRef: effectiveJourneyGarmentTypeSelection,
      fabricWrites: fabricWritesRef.current,
      fabricSignature: getFutureFabricAllocationStateSignature(fabricState),
    });
    lastEffectiveRef.current = effectiveJourneyGarmentTypeSelection;
  });

  void normalizedGarmentTypeCatalog;
  return createElement("div", {
    "data-renders": String(renderCountRef.current),
    "data-effective-types": effectiveJourneyGarmentTypeSelection.garmentTypes.join(","),
  });
};

let lastSettle: {
  effectiveRef: GarmentTypeStepSelection;
  fabricWrites: number;
  fabricSignature: string;
} | null = null;

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(
    createElement(StabilityHarness, {
      catalogInput: catalog,
      step1Selection: step1,
      uploadedSource: uploaded,
      onSettle: (payload) => {
        lastSettle = payload;
      },
    }),
  );
});

assert.ok(lastSettle);
const firstEffective = lastSettle!.effectiveRef;
const writesAfterFirst = lastSettle!.fabricWrites;
assert.ok(firstEffective.garmentTypes.includes("shirt"));
assert.ok(firstEffective.garmentTypes.includes("trouser"));

// Identical inputs: force rerenders without changing props.
for (let i = 0; i < 12; i += 1) {
  await act(async () => {
    renderer.update(
      createElement(StabilityHarness, {
        catalogInput: catalog,
        step1Selection: step1,
        uploadedSource: uploaded,
        onSettle: (payload) => {
          lastSettle = payload;
        },
      }),
    );
  });
}

assert.equal(
  lastSettle!.effectiveRef,
  firstEffective,
  "effectiveJourneyGarmentTypeSelection must keep the same reference for unchanged inputs",
);
assert.equal(
  lastSettle!.fabricWrites,
  writesAfterFirst,
  "Fabric reconciliation must settle and not write repeatedly",
);
assert.ok(
  Number(renderer.root.findByType("div").props["data-renders"]) > 1,
  "Harness must have rerendered",
);

console.log("PASS: effective journey memo/effect stability");
