import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { FabricGarmentType, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  captureFabricReentryBaseline,
  detectFabricContextualReentryGuidance,
  formatFabricContextualReentryMessage,
  getFirstUnassignedFabricGarmentKey,
} from "./src/utils/designStudioContextualReentryGuidance";
import {
  assignSameFabricProductToGarments,
  getFutureUnassignedFabricTargets,
  reconcileFutureFabricAllocationState,
} from "./src/utils/designStudioFutureFabricStage";
import {
  createDesignStudioNavigationRequest,
  getDesignStyleIncompleteNavigationTarget,
  getFabricUnassignedNavigationTarget,
  getMainStageNavigationTarget,
} from "./src/utils/designStudioNavigation";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { getStep1GarmentDisplayLabel } from "./src/utils/garmentConstructionPricing";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: "unisex",
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const labelForGarmentKey = (_garmentKey: string, garmentType: string) =>
  garmentType === "other"
    ? "Other Garment"
    : getStep1GarmentDisplayLabel(garmentType as Exclude<FabricGarmentType, "other">);

const assignAll = (
  garmentTypeSelection: GarmentTypeStepSelection,
  fabricCode = "FAB-A",
) => {
  const empty = FabricAllocationStateEngine.initialize();
  const targets = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState: empty,
  });
  const result = assignSameFabricProductToGarments({
    state: empty,
    fabricCode,
    garmentKeys: targets.map((target) => target.assignment.garmentKey),
    garmentTypeSelection,
  });
  assert.equal(result.status, "assigned");
  return result.state;
};

const detect = ({
  baseline,
  garmentTypeSelection,
  fabricAllocationState,
  fabricHistoricallyVisited = true,
}: {
  baseline: ReturnType<typeof captureFabricReentryBaseline> | null;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: ReturnType<typeof FabricAllocationStateEngine.initialize>;
  fabricHistoricallyVisited?: boolean;
}) =>
  detectFabricContextualReentryGuidance({
    baseline,
    fabricHistoricallyVisited,
    garmentTypeSelection,
    fabricAllocationState,
    labelForGarmentKey,
  });

// --- normal revisit / unaffected Fabric revisit → no message ---
{
  const shirt = selection(["shirt"]);
  const assigned = assignAll(shirt);
  const baseline = captureFabricReentryBaseline({
    garmentTypeSelection: shirt,
    fabricAllocationState: assigned,
  });
  assert.equal(
    detect({
      baseline,
      garmentTypeSelection: shirt,
      fabricAllocationState: assigned,
    }),
    null,
    "unaffected Fabric revisit must not show guidance",
  );
}

// ordinary incomplete revisit (known unassigned) → no message
{
  const shirt = selection(["shirt"]);
  const empty = FabricAllocationStateEngine.initialize();
  const baseline = captureFabricReentryBaseline({
    garmentTypeSelection: shirt,
    fabricAllocationState: empty,
  });
  assert.equal(
    detect({
      baseline,
      garmentTypeSelection: shirt,
      fabricAllocationState: empty,
    }),
    null,
    "ordinary incomplete revisit must not show guidance",
  );
}

// first visit / no baseline → no message
{
  const shirt = selection(["shirt"]);
  assert.equal(
    detect({
      baseline: null,
      garmentTypeSelection: shirt,
      fabricAllocationState: FabricAllocationStateEngine.initialize(),
    }),
    null,
    "missing baseline (first visit / post-refresh) must not show guidance",
  );
}

// not historically visited → no message
{
  const shirt = selection(["shirt"]);
  const empty = FabricAllocationStateEngine.initialize();
  const baseline = captureFabricReentryBaseline({
    garmentTypeSelection: shirt,
    fabricAllocationState: empty,
  });
  assert.equal(
    detect({
      baseline,
      garmentTypeSelection: shirt,
      fabricAllocationState: empty,
      fabricHistoricallyVisited: false,
    }),
    null,
    "Fabric not historically visited must not show guidance",
  );
}

// --- new garment → Fabric explanation ---
{
  const shirt = selection(["shirt"]);
  const assigned = assignAll(shirt);
  const baseline = captureFabricReentryBaseline({
    garmentTypeSelection: shirt,
    fabricAllocationState: assigned,
  });
  const shirtTrouser = selection(["shirt", "trouser"]);
  const reconciled = reconcileFutureFabricAllocationState({
    state: assigned,
    garmentTypeSelection: shirtTrouser,
  });
  const guidance = detect({
    baseline,
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: reconciled,
  });
  assert.ok(guidance, "new garment must produce guidance");
  assert.equal(guidance!.cause, "new_items");
  assert.equal(guidance!.destinationStageId, "fabric");
  assert.equal(guidance!.affectedItems.length, 1);
  assert.equal(guidance!.focusGarmentKey, guidance!.affectedItems[0]!.id);
  assert.match(guidance!.message, /You added .+ It still needs a Fabric assignment\./);
}

// --- multiple newly affected garments ---
{
  const shirt = selection(["shirt"]);
  const assigned = assignAll(shirt);
  const baseline = captureFabricReentryBaseline({
    garmentTypeSelection: shirt,
    fabricAllocationState: assigned,
  });
  const expanded = selection(["shirt", "trouser", "skirt"]);
  const reconciled = reconcileFutureFabricAllocationState({
    state: assigned,
    garmentTypeSelection: expanded,
  });
  const guidance = detect({
    baseline,
    garmentTypeSelection: expanded,
    fabricAllocationState: reconciled,
  });
  assert.ok(guidance);
  assert.equal(guidance!.cause, "new_items");
  assert.equal(guidance!.affectedItems.length, 2);
  assert.match(
    guidance!.message,
    /You added garments that still need Fabric:/,
  );
}

// --- changed garment → appropriate explanation ---
{
  const longDress = selection(["full_length_gown"]);
  const assigned = assignAll(longDress);
  const baseline = captureFabricReentryBaseline({
    garmentTypeSelection: longDress,
    fabricAllocationState: assigned,
  });
  // Replace gown with shirt: previous assignment keys drop; shirt is new.
  // Simulate a changed requirement by keeping the same key but dropping the
  // assignment via reconcile after a fabricUnits-affecting construction swap
  // is modeled as: baseline thinks key was assigned, current state unassigned
  // for that key after reconcile emptied it.
  const emptyAfterChange = FabricAllocationStateEngine.initialize();
  const stillGown = selection(["full_length_gown"]);
  // Force "changed" path: baseline has assigned key, current has same required
  // key unassigned (customer cleared / units invalidated).
  const guidance = detect({
    baseline,
    garmentTypeSelection: stillGown,
    fabricAllocationState: emptyAfterChange,
  });
  assert.ok(guidance, "changed/lost assignment must produce guidance");
  assert.equal(guidance!.cause, "changed_items");
  assert.match(guidance!.message, /You changed .+ Choose a Fabric for it again\./);
}

// --- explanation appears only once (consume / baseline refresh) ---
{
  const shirt = selection(["shirt"]);
  const assigned = assignAll(shirt);
  let baseline = captureFabricReentryBaseline({
    garmentTypeSelection: shirt,
    fabricAllocationState: assigned,
  });
  const shirtTrouser = selection(["shirt", "trouser"]);
  const reconciled = reconcileFutureFabricAllocationState({
    state: assigned,
    garmentTypeSelection: shirtTrouser,
  });
  const first = detect({
    baseline,
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: reconciled,
  });
  assert.ok(first);
  // Consume: refresh baseline to current incomplete state.
  baseline = captureFabricReentryBaseline({
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: reconciled,
  });
  const second = detect({
    baseline,
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: reconciled,
  });
  assert.equal(second, null, "guidance must appear only once after consume");
}

// --- refresh after explanation → no duplicate (null baseline) ---
{
  const shirtTrouser = selection(["shirt", "trouser"]);
  const empty = FabricAllocationStateEngine.initialize();
  assert.equal(
    detect({
      baseline: null,
      garmentTypeSelection: shirtTrouser,
      fabricAllocationState: empty,
      fabricHistoricallyVisited: true,
    }),
    null,
    "post-refresh null baseline must not duplicate guidance",
  );
}

// --- message helpers ---
assert.equal(
  formatFabricContextualReentryMessage({
    cause: "new_items",
    labels: ["Standard Shirt", "Trouser"],
  }),
  "You added garments that still need Fabric: Standard Shirt and Trouser.",
);
assert.equal(
  formatFabricContextualReentryMessage({
    cause: "mixed",
    labels: ["Standard Shirt", "Trouser", "Skirt"],
  }),
  "Some garments need Fabric attention: Standard Shirt, Trouser, and Skirt.",
);

// --- navigation request carries reentryGuidance + fabric_unassigned ---
{
  const request = createDesignStudioNavigationRequest({
    id: 1,
    stage: "fabric",
    target: getFabricUnassignedNavigationTarget("base:trouser"),
    reentryGuidance: {
      destinationStageId: "fabric",
      cause: "new_items",
      affectedItems: [{ id: "base:trouser", label: "Trouser" }],
      message: "You added Trouser. It still needs a Fabric assignment.",
      focusGarmentKey: "base:trouser",
    },
  });
  assert.equal(request.reentryGuidance?.cause, "new_items");
  assert.equal(request.reentryGuidance?.focusGarmentKey, "base:trouser");
  assert.deepEqual(request.target, {
    kind: "fabric_unassigned",
    garmentKey: "base:trouser",
  });
  const ordinary = createDesignStudioNavigationRequest({
    id: 2,
    stage: "fabric",
    target: getMainStageNavigationTarget(),
  });
  assert.equal(ordinary.reentryGuidance, null);
}

// --- first unassigned key helper ---
{
  const shirtTrouser = selection(["shirt", "trouser"]);
  const shirtOnly = assignAll(selection(["shirt"]));
  const reconciled = reconcileFutureFabricAllocationState({
    state: shirtOnly,
    garmentTypeSelection: shirtTrouser,
  });
  const firstKey = getFirstUnassignedFabricGarmentKey({
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: reconciled,
  });
  assert.ok(firstKey);
  assert.equal(
    firstKey,
    getFutureUnassignedFabricTargets({
      garmentTypeSelection: shirtTrouser,
      fabricAllocationState: reconciled,
    })[0]!.assignment.garmentKey,
  );
}

// --- design_style_incomplete navigation target ---
{
  assert.deepEqual(
    getDesignStyleIncompleteNavigationTarget("occ:shirt:1"),
    { kind: "design_style_incomplete", occurrenceToken: "occ:shirt:1" },
  );
  const request = createDesignStudioNavigationRequest({
    id: 3,
    stage: "design_style",
    target: getDesignStyleIncompleteNavigationTarget("occ:trouser:1"),
  });
  assert.equal(request.target.kind, "design_style_incomplete");
  if (request.target.kind === "design_style_incomplete") {
    assert.equal(request.target.occurrenceToken, "occ:trouser:1");
  }
}

// --- wiring: Design Studio + Fabric step ---
{
  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  const fabricSource = readFileSync(
    "src/components/DormantFutureFabricStep.tsx",
    "utf8",
  );
  const designStyleSource = readFileSync(
    "src/components/DormantFutureDesignStyleStep.tsx",
    "utf8",
  );
  const navigationSource = readFileSync(
    "src/utils/designStudioNavigation.ts",
    "utf8",
  );

  assert.match(navigationSource, /reentryGuidance/);
  assert.match(navigationSource, /fabric_unassigned/);
  assert.match(navigationSource, /design_style_incomplete/);
  assert.match(navigationSource, /getFabricUnassignedNavigationTarget/);
  assert.match(navigationSource, /getDesignStyleIncompleteNavigationTarget/);
  assert.match(studioSource, /detectFabricContextualReentryGuidance/);
  assert.match(studioSource, /captureFabricReentryBaseline/);
  assert.match(studioSource, /activeContextualReentryGuidance/);
  assert.match(studioSource, /redirectedForIncompleteFabric/);
  assert.match(studioSource, /redirectedForIncompleteDesignStyle/);
  assert.match(
    studioSource,
    /redirectedForIncompleteDesignStyle \|\|\s*effectiveTarget\.kind === "validation_target"\s*\?/,
    "Design Style gold flash is only jump-ahead or validation, not ordinary stage_top",
  );
  assert.doesNotMatch(
    studioSource,
    /redirectedForIncompleteDesignStyle[\s\S]{0,220}stage_top/,
    "ordinary Design Style stage_top must not gold-flash the first incomplete card",
  );
  assert.match(studioSource, /getFabricUnassignedNavigationTarget/);
  assert.match(studioSource, /getDesignStyleIncompleteNavigationTarget/);
  assert.match(studioSource, /fabricUnassignedFocusRequest/);
  assert.match(studioSource, /designStyleIncompleteFocusRequest/);
  assert.match(studioSource, /firstIncompleteDesignStyleOccurrenceToken/);
  assert.match(
    studioSource,
    /correctedStageId === "fabric"[\s\S]*navigateToFutureStage\("fabric"/,
    "stage correction to Fabric must navigate with focus, not bare setFutureStageId",
  );
  assert.match(
    studioSource,
    /correctedStageId === "design_style"[\s\S]*navigateToFutureStage\("design_style"/,
    "stage correction to Design Style must navigate with occurrence focus",
  );
  assert.match(
    studioSource,
    /request\.target\.kind === "design_style_incomplete"[\s\S]*return;/,
    "design_style_incomplete must skip stage-top scroll",
  );
  assert.match(
    studioSource,
    /unassignedFocusGarmentKey && request\.stage === "fabric"[\s\S]*return;/,
    "fabric_unassigned must skip stage-top scroll",
  );
  assert.match(fabricSource, /data-contextual-reentry-guidance="fabric"/);
  assert.match(fabricSource, /CONTEXTUAL_REENTRY_AUTO_DISMISS_MS/);
  assert.match(fabricSource, /data-contextual-reentry-dismiss/);
  assert.match(fabricSource, /onDismissContextualReentryGuidance/);
  assert.match(fabricSource, /unassignedFocusGarmentKey/);
  assert.match(
    fabricSource,
    /navigateToStep2PostAssignmentDestination\(\s*unassignedFocusGarmentKey,\s*"next_unassigned"/,
  );
  assert.match(designStyleSource, /incompleteFocusOccurrenceToken/);
  assert.match(designStyleSource, /data-contextual-reentry-focus=\{/);
  assert.match(designStyleSource, /"design_style"/);
  assert.match(
    designStyleSource,
    /setHighlightedOccurrenceToken\(token\)/,
  );
}

console.log("PASS: contextual re-entry guidance (Fabric + Design Style focus)");
