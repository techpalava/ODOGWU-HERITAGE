import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import {
  reconcileGarmentTypeStepSelection,
  selectGarmentConstructionOption,
} from "./src/utils/garmentTypeStepState";
import {
  reconcileAdditionalGarmentConstructionState,
  selectAdditionalGarmentConstructionOption,
} from "./src/utils/additionalGarmentConstructionState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const catalogIds = catalog.map((option) => option.id);
assert.equal(
  catalogIds.length,
  new Set(catalogIds).size,
  "no duplicate Custom Detail option ID is introduced",
);

for (const [optionId, selectionGroup, garmentType, defaultOptionId, defaultCents] of [
  ["shorts_std_rope_elastic", "standard_shorts_fastening", "standard_shorts", "shorts_std_rope", 7000],
  ["bum_rope_elastic", "bum_shorts_fastening", "bum_shorts", "bum_rope", 7000],
  ["trouser_rope_elastic", "trouser_fastening", "trouser", "trouser_rope", 7500],
] as const) {
  const option = catalog.find((entry) => entry.id === optionId);
  assert.ok(option, `${optionId} must exist`);
  assert.equal(option?.label, "With Rope Plus Elastic Band");
  assert.equal(option?.priceCents, 8500);
  assert.equal(option?.selectionGroup, selectionGroup);
  const defaultResolution = resolveGarmentConstructionPricing(garmentType, catalog);
  assert.equal(defaultResolution.status, "resolved");
  if (defaultResolution.status !== "resolved") continue;
  assert.equal(defaultResolution.components[0]?.optionId, defaultOptionId);
  assert.equal(defaultResolution.totalPriceCents, defaultCents);
  const selected = selectGarmentConstructionOption({
    resolution: defaultResolution,
    selectionGroup,
    optionId,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(selected.status, "selected", `${garmentType} must accept Rope Plus Elastic`);
  if (selected.status !== "selected") continue;
  assert.equal(selected.resolution.status, "resolved");
  if (selected.resolution.status !== "resolved") continue;
  assert.equal(selected.resolution.totalPriceCents, 8500);
  assert.equal(selected.resolution.components.length, 1);
  const switched = selectGarmentConstructionOption({
    resolution: selected.resolution,
    selectionGroup,
    optionId: defaultOptionId,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(switched.status, "selected");
  if (switched.status === "selected") {
    assert.equal(switched.resolution.status, "resolved");
    if (switched.resolution.status === "resolved") {
      assert.equal(
        switched.resolution.totalPriceCents,
        defaultCents,
        `switching away from Rope Plus Elastic restores the ${garmentType} construction total once`,
      );
    }
  }
}

for (const group of ["skirt_length", "shirt_construction", "dress_construction"] as const) {
  assert.equal(
    catalog.some(
      (option) =>
        option.selectionGroup === group &&
        option.id.endsWith("rope_elastic"),
    ),
    false,
    `${group} must not gain With Rope Plus Elastic Band`,
  );
}

const baseTrouser = resolveGarmentConstructionPricing("trouser", catalog);
assert.equal(baseTrouser.status, "resolved");
if (baseTrouser.status === "resolved") {
  const additionalState = reconcileAdditionalGarmentConstructionState({
    existingState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:trouser:1": baseTrouser,
      },
    },
    assignments: [],
    normalizedCustomDetailCatalog: catalog,
  });
  const selectedAdditional = selectAdditionalGarmentConstructionOption({
    state: additionalState.state,
    garmentKey: "additional:trouser:1",
    selectionGroup: "trouser_fastening",
    optionId: "trouser_rope_elastic",
    normalizedCustomDetailCatalog: catalog,
  });
  const additionalResolution =
    selectedAdditional.byGarmentKey["additional:trouser:1"];
  assert.equal(additionalResolution?.status, "resolved");
  if (additionalResolution?.status === "resolved") {
    assert.equal(additionalResolution.totalPriceCents, 8500);
  }
  const baseAfterAdditional = resolveGarmentConstructionPricing("trouser", catalog);
  assert.equal(baseAfterAdditional.status, "resolved");
  if (baseAfterAdditional.status === "resolved") {
    assert.equal(
      baseAfterAdditional.totalPriceCents,
      7500,
      "selecting Rope Plus Elastic on additional:trouser:1 must not change the base Trouser default",
    );
  }
  const restoredAdditional = reconcileAdditionalGarmentConstructionState({
    existingState: JSON.parse(JSON.stringify(selectedAdditional)),
    assignments: [],
    normalizedCustomDetailCatalog: catalog,
  });
  const restoredResolution =
    restoredAdditional.state.byGarmentKey["additional:trouser:1"];
  assert.equal(restoredResolution?.status, "resolved");
  if (restoredResolution?.status === "resolved") {
    assert.equal(restoredResolution.components[0]?.optionId, "trouser_rope_elastic");
    assert.equal(
      restoredResolution.totalPriceCents,
      8500,
      "reload preserves the additional Trouser Rope Plus Elastic construction total",
    );
  }
}

for (const [garmentType, selectionGroup, optionId] of [
  ["trouser", "trouser_fastening", "trouser_rope_elastic"],
  ["standard_shorts", "standard_shorts_fastening", "shorts_std_rope_elastic"],
  ["bum_shorts", "bum_shorts_fastening", "bum_rope_elastic"],
] as const) {
  const initial = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: [garmentType],
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  const current = initial.constructionByGarment[garmentType];
  assert.equal(current?.status, "resolved");
  if (current?.status !== "resolved") continue;
  assert.equal(
    current.components[0]?.optionId?.endsWith("rope") &&
      !current.components[0]?.optionId?.endsWith("rope_elastic"),
    true,
    `fresh ${garmentType} selection still defaults to Rope`,
  );
  const selected = selectGarmentConstructionOption({
    resolution: current,
    selectionGroup,
    optionId,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(selected.status, "selected");
  if (selected.status !== "selected") continue;
  const persisted = {
    ...initial,
    constructionByGarment: {
      ...initial.constructionByGarment,
      [garmentType]: selected.resolution,
    },
  };
  const restored = reconcileGarmentTypeStepSelection({
    persistedSelection: persisted,
    normalizedCustomDetailCatalog: catalog,
  }).selection.constructionByGarment[garmentType];
  assert.equal(restored?.status, "resolved");
  if (restored?.status === "resolved") {
    assert.equal(restored.components[0]?.optionId, optionId);
    assert.equal(
      restored.totalPriceCents,
      8500,
      `base ${garmentType} reload keeps Rope Plus Elastic and the catalog €85 total`,
    );
  }
}

const independent = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["trouser", "standard_shorts", "bum_shorts"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalog,
}).selection;
const independentTrouser = independent.constructionByGarment.trouser;
assert.equal(independentTrouser?.status, "resolved");
if (independentTrouser?.status === "resolved") {
  const selectedIndependentTrouser = selectGarmentConstructionOption({
    resolution: independentTrouser,
    selectionGroup: "trouser_fastening",
    optionId: "trouser_rope_elastic",
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(selectedIndependentTrouser.status, "selected");
  if (selectedIndependentTrouser.status === "selected") {
    const next = {
      ...independent,
      constructionByGarment: {
        ...independent.constructionByGarment,
        trouser: selectedIndependentTrouser.resolution,
      },
    };
    const shorts = next.constructionByGarment.standard_shorts;
    const bum = next.constructionByGarment.bum_shorts;
    const trouser = next.constructionByGarment.trouser;
    assert.equal(trouser?.status === "resolved" ? trouser.totalPriceCents : null, 8500);
    assert.equal(shorts?.status === "resolved" ? shorts.totalPriceCents : null, 7000);
    assert.equal(bum?.status === "resolved" ? bum.totalPriceCents : null, 7000);
  }
}

const invalidSaved = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["trouser"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalog,
}).selection;
const invalidTrouser = invalidSaved.constructionByGarment.trouser;
if (invalidTrouser?.status === "resolved") {
  invalidTrouser.components[0].optionId = "not_a_real_rope_elastic";
  invalidTrouser.components[0].componentKey =
    "trouser:trouser_fastening:not_a_real_rope_elastic";
  invalidTrouser.totalPriceCents = 8500;
  invalidTrouser.totalPrice = 85;
}
const invalidRestored = reconcileGarmentTypeStepSelection({
  persistedSelection: invalidSaved,
  normalizedCustomDetailCatalog: catalog,
}).selection.constructionByGarment.trouser;
assert.equal(
  invalidRestored?.status === "resolved"
    ? invalidRestored.components[0]?.optionId
    : null,
  "trouser_rope",
  "an invalid option ID must not become a valid €85 construction",
);
assert.equal(
  invalidRestored?.status === "resolved" ? invalidRestored.totalPriceCents : null,
  7500,
);

const agbadaConstruction = resolveGarmentConstructionPricing("agbada", catalog);
assert.equal(agbadaConstruction.status, "resolved");
if (agbadaConstruction.status === "resolved") {
  const selectedAgbada = selectGarmentConstructionOption({
    resolution: agbadaConstruction,
    selectionGroup: "trouser_fastening",
    optionId: "trouser_rope_elastic",
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(
    selectedAgbada.status,
    "selected",
    "Agbada trousers keep the full Trouser fastening catalogue, including Rope Plus Elastic",
  );
  if (
    selectedAgbada.status === "selected" &&
    selectedAgbada.resolution.status === "resolved"
  ) {
    assert.equal(
      selectedAgbada.resolution.components.some(
        (component) => component.optionId === "trouser_rope_elastic",
      ),
      true,
    );
    const agbadaSelection = reconcileGarmentTypeStepSelection({
      selectedGarmentTypes: ["agbada"],
      selectedDemographic: "male",
      normalizedCustomDetailCatalog: catalog,
    }).selection;
    const restoredAgbada = reconcileGarmentTypeStepSelection({
      persistedSelection: {
        ...agbadaSelection,
        constructionByGarment: {
          ...agbadaSelection.constructionByGarment,
          agbada: selectedAgbada.resolution,
        },
      },
      normalizedCustomDetailCatalog: catalog,
    }).selection.constructionByGarment.agbada;
    assert.equal(restoredAgbada?.status, "resolved");
    if (restoredAgbada?.status === "resolved") {
      assert.equal(
        restoredAgbada.components.some(
          (component) => component.optionId === "trouser_rope_elastic",
        ),
        true,
        "Agbada reload preserves Rope Plus Elastic on its Trouser fastening",
      );
    }
  }
}

console.log("Step 4 With Rope Plus Elastic Band option verification passed.");
