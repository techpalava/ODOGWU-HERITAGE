/**
 * Stale Style listener generation race regressions.
 */
import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { StyleCategory } from "./src/types";
import {
  applyStylesCatalogueListenerEvent,
  invalidateStylesCatalogueLoadGeneration,
  isCurrentStylesCatalogueLoadGeneration,
  peekStylesCatalogueLoadGeneration,
  type StylesCatalogueListenerState,
} from "./src/utils/stylesCatalogueLoadState";

const staleStyle: StyleCategory = {
  id: "stale-old-gen",
  name: "Stale",
  description: "",
  gender: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
};

const freshStyle: StyleCategory = {
  id: "fresh-new-gen",
  name: "Fresh",
  description: "",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

// Simulate: old generation exists, then reinitialization begins.
const oldGeneration = peekStylesCatalogueLoadGeneration() || 0;
let state: StylesCatalogueListenerState = {
  styles: [staleStyle],
  stylesLoadState: "ready",
  stylesLoadError: null,
};

// Begin reload: invalidate immediately (same order as initializeData).
const newGeneration = invalidateStylesCatalogueLoadGeneration();
assert.ok(newGeneration > oldGeneration);
assert.equal(isCurrentStylesCatalogueLoadGeneration(oldGeneration), false);
assert.equal(isCurrentStylesCatalogueLoadGeneration(newGeneration), true);

state = {
  ...state,
  stylesLoadState: "loading",
  stylesLoadError: null,
};

// Old listener snapshot arrives after reload started — must be ignored.
state = applyStylesCatalogueListenerEvent(state, {
  kind: "snapshot",
  callbackGeneration: oldGeneration,
  styles: [staleStyle],
});
assert.equal(state.stylesLoadState, "loading");
assert.equal(state.styles[0]?.id, "stale-old-gen"); // unchanged local copy; not marked ready
assert.notEqual(state.stylesLoadState, "ready");

// Old listener error also ignored.
state = applyStylesCatalogueListenerEvent(state, {
  kind: "error",
  callbackGeneration: oldGeneration,
  message: "stale network failure",
});
assert.equal(state.stylesLoadState, "loading");
assert.equal(state.stylesLoadError, null);

// First new-generation successful snapshot → ready.
state = applyStylesCatalogueListenerEvent(state, {
  kind: "snapshot",
  callbackGeneration: newGeneration,
  styles: [freshStyle],
});
assert.equal(state.stylesLoadState, "ready");
assert.equal(state.styles.length, 1);
assert.equal(state.styles[0]?.id, "fresh-new-gen");
assert.equal(state.stylesLoadError, null);

// Another reload: stale error after invalidate stays ignored; then new error applies.
const newerGeneration = invalidateStylesCatalogueLoadGeneration();
state = {
  ...state,
  stylesLoadState: "loading",
  stylesLoadError: null,
};
state = applyStylesCatalogueListenerEvent(state, {
  kind: "error",
  callbackGeneration: newGeneration,
  message: "old generation error",
});
assert.equal(state.stylesLoadState, "loading");
state = applyStylesCatalogueListenerEvent(state, {
  kind: "error",
  callbackGeneration: newerGeneration,
  message: "authoritative catalogue failure",
});
assert.equal(state.stylesLoadState, "error");
assert.equal(state.stylesLoadError, "authoritative catalogue failure");

console.log("PASS: stale Style listener generation race regressions");
