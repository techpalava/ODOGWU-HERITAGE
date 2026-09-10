import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { StyleCategory } from "./src/types";
import {
  prepareAuthoritativeDesignStyleRecord,
  projectPublishedDesignStyleSnapshot,
} from "./src/utils/designStyleAuthority";
import { applyStylesCatalogueListenerEvent } from "./src/utils/stylesCatalogueLoadState";

const style: StyleCategory = {
  id: "customer-style-1",
  name: "Customer Style",
  description: "Published customer projection.",
  gender: "female",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("dress")],
  customDetailConfig: {
    representedGenders: ["female"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["dress", "neck"],
    requiredSelectionGroups: ["dress_construction"],
    enabled: true,
  },
};

const record = prepareAuthoritativeDesignStyleRecord({
  style,
  lifecycle: "published",
  displayOrder: 1,
  referenceComposition: { status: "known", garmentTypes: ["dress"] },
  currentRecord: null,
});
const ready = projectPublishedDesignStyleSnapshot([
  { id: record.id, data: record },
]);
assert.equal(ready.status, "ready");
assert.equal(ready.status === "ready" ? ready.styles.length : 0, 1);

const malformed = projectPublishedDesignStyleSnapshot([
  { id: record.id, data: { ...record, eligibilityFingerprint: "wrong" } },
]);
assert.equal(malformed.status, "error");

const currentState = {
  styles: ready.status === "ready" ? [...ready.styles] : [],
  stylesLoadState: "ready" as const,
  stylesLoadError: null,
};
const errorState = applyStylesCatalogueListenerEvent(
  currentState,
  {
    kind: "error",
    callbackGeneration: 8,
    message: "Temporary catalogue listener failure.",
  },
  8,
);
assert.equal(errorState.stylesLoadState, "error");
assert.equal(errorState.styles.length, 1);
assert.equal(errorState.styles[0].id, record.id);

const staleEmptySnapshot = applyStylesCatalogueListenerEvent(
  errorState,
  { kind: "snapshot", callbackGeneration: 7, styles: [] },
  8,
);
assert.equal(staleEmptySnapshot, errorState);

const disabled = prepareAuthoritativeDesignStyleRecord({
  style,
  lifecycle: "disabled",
  displayOrder: 1,
  referenceComposition: { status: "known", garmentTypes: ["dress"] },
  currentRecord: record,
});
assert.equal(
  projectPublishedDesignStyleSnapshot([{ id: disabled.id, data: disabled }])
    .status,
  "error",
);

console.log(
  "PASS: published customer projection and listener loading/error preservation",
);
