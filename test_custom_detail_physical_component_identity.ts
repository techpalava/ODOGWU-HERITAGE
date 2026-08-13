import assert from "node:assert/strict";
import {
  CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT,
  deriveCustomDetailComponentKey,
  resolveCustomDetailPhysicalComponents,
} from "./src/config/CustomDetailPhysicalComponentConfig";
import {
  STYLE_BASE_GARMENT_TYPES,
  createStyleBaseGarmentSpec,
  getCustomDetailGroupsForFabricGarmentType,
} from "./src/config/StyleFabricCapacityConfig";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import type { CanonicalPhysicalGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";

const expectedGarmentTypes: CanonicalPhysicalGarmentType[] = [
  "shirt",
  "trouser",
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
  "agbada",
];
assert.deepEqual([...STYLE_BASE_GARMENT_TYPES], expectedGarmentTypes);
assert.deepEqual(
  Object.keys(CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT).sort(),
  [...expectedGarmentTypes].sort(),
  "Every canonical Step 1 garment must have physical-component configuration.",
);

const simpleGarmentTypes = expectedGarmentTypes.filter(
  (garmentType) => garmentType !== "agbada",
);
const resolvedByType = new Map<
  CanonicalPhysicalGarmentType,
  Extract<
    ReturnType<typeof resolveCustomDetailPhysicalComponents>,
    { status: "resolved" }
  >
>();

for (const garmentType of expectedGarmentTypes) {
  const parentGarmentKey = `base:${garmentType}`;
  const resolution = resolveCustomDetailPhysicalComponents({
    parentGarmentKey,
    garmentType,
  });
  assert.equal(resolution.status, "resolved", `${garmentType} must resolve.`);
  if (resolution.status !== "resolved") continue;
  resolvedByType.set(garmentType, resolution);
  assert.deepEqual(
    [
      ...new Set(
        resolution.components.flatMap((component) => component.garmentGroups),
      ),
    ],
    getCustomDetailGroupsForFabricGarmentType(garmentType),
    `${garmentType} must preserve the existing canonical group IDs.`,
  );
  const allGroups = resolution.components.flatMap(
    (component) => component.garmentGroups,
  );
  assert.equal(
    new Set(allGroups).size,
    allGroups.length,
    `${garmentType} must assign each group to exactly one component.`,
  );
  assert.deepEqual(
    resolution.components.map((component) => component.order),
    [...resolution.components]
      .sort(
        (left, right) =>
          left.order - right.order ||
          left.componentId.localeCompare(right.componentId),
      )
      .map((component) => component.order),
    `${garmentType} component order must be deterministic.`,
  );
}

for (const garmentType of simpleGarmentTypes) {
  const resolution = resolvedByType.get(garmentType)!;
  assert.equal(resolution.components.length, 1);
  assert.equal(
    resolution.components[0].garmentKey,
    `base:${garmentType}`,
    `${garmentType} must reuse its parent Step 1 key.`,
  );
  assert.equal(resolution.components[0].keyStrategy, "parent");
}

assert.notEqual(
  resolvedByType.get("shirt")!.components[0].garmentKey,
  resolvedByType.get("kaftan")!.components[0].garmentKey,
  "Shirt and Kaftan must remain independent despite shared detail groups.",
);
assert.notEqual(
  resolvedByType.get("dress")!.components[0].garmentKey,
  resolvedByType.get("full_length_gown")!.components[0].garmentKey,
  "Dress and Full-length Gown must remain independent.",
);

const agbada = resolvedByType.get("agbada")!;
assert.equal(agbada.parentGarmentKey, "base:agbada");
assert.equal(agbada.components.length, 2, "No third Agbada component is defined.");
assert.deepEqual(
  agbada.components.map((component) => ({
    componentId: component.componentId,
    garmentKey: component.garmentKey,
    garmentType: component.garmentType,
    garmentGroups: component.garmentGroups,
    order: component.order,
  })),
  [
    {
      componentId: "shirt",
      garmentKey: "base:agbada:shirt",
      garmentType: "shirt",
      garmentGroups: ["shirt", "neck"],
      order: 10,
    },
    {
      componentId: "trouser",
      garmentKey: "base:agbada:trouser",
      garmentType: "trouser",
      garmentGroups: ["trousers"],
      order: 20,
    },
  ],
);
assert.equal(
  deriveCustomDetailComponentKey("uploaded:design-42:agbada", "shirt"),
  "uploaded:design-42:agbada:shirt",
  "Child-key derivation must work with any stable parent key.",
);

const reloadedInput = JSON.parse(
  JSON.stringify({ parentGarmentKey: "base:agbada", garmentType: "agbada" }),
) as { parentGarmentKey: string; garmentType: string };
assert.deepEqual(
  resolveCustomDetailPhysicalComponents(reloadedInput),
  resolveCustomDetailPhysicalComponents({
    parentGarmentKey: "base:agbada",
    garmentType: "agbada",
  }),
  "JSON/draft reload must reproduce identical component keys.",
);

const knownConstructionOptionIds = new Set(
  SEED_CUSTOM_DETAIL_CATALOG.filter((option) => option.required).map(
    (option) => option.id,
  ),
);
agbada.components.forEach((component) => {
  knownConstructionOptionIds.forEach((optionId) => {
    assert.equal(
      component.garmentKey.includes(optionId),
      false,
      "Physical-component keys must never contain construction option IDs.",
    );
  });
});

const normalizedCatalog = normalizeCustomDetailCatalog(
  SEED_CUSTOM_DETAIL_CATALOG,
);
const agbadaConstruction = resolveGarmentConstructionPricing(
  "agbada",
  normalizedCatalog,
);
assert.equal(agbadaConstruction.status, "resolved");
if (agbadaConstruction.status === "resolved") {
  assert.equal(agbadaConstruction.totalPriceCents, 14000);
}
const repricedCatalog = normalizedCatalog.map((option) =>
  option.id === "shirt_std_short"
    ? { ...option, label: "Renamed construction", priceCents: 9900 }
    : option,
);
const resolutionAfterCatalogChange = resolveCustomDetailPhysicalComponents({
  parentGarmentKey: "base:agbada",
  garmentType: "agbada",
});
assert.equal(resolutionAfterCatalogChange.status, "resolved");
if (resolutionAfterCatalogChange.status === "resolved") {
  assert.deepEqual(
    resolutionAfterCatalogChange.components.map(
      (component) => component.garmentKey,
    ),
    agbada.components.map((component) => component.garmentKey),
    "Labels and prices must not affect component keys.",
  );
}
assert.equal(
  resolveGarmentConstructionPricing("agbada", repricedCatalog).status,
  "resolved",
  "The identity configuration must not alter construction resolution.",
);

const agbadaCapacitySpec = createStyleBaseGarmentSpec("agbada");
assert.equal(agbadaCapacitySpec.key, "base:agbada");
assert.equal(agbadaCapacitySpec.fabricUnits, 2);
const agbadaCapacity = FabricCapacityEngine.resolveGarmentAssignment({
  code: "STYLE_BASE_AGBADA",
  garmentSpec: agbadaCapacitySpec,
});
assert.equal(agbadaCapacity.status, "resolved");
if (agbadaCapacity.status === "resolved") {
  assert.equal(agbadaCapacity.assignments.length, 1);
  assert.equal(agbadaCapacity.assignments[0].garmentKey, "base:agbada");
  assert.equal(agbadaCapacity.assignments[0].fabricUnits, 2);
}

assert.deepEqual(
  resolveCustomDetailPhysicalComponents({
    parentGarmentKey: "base:other",
    garmentType: "other",
  }),
  {
    status: "unresolved",
    code: "unsupported_garment_type",
    parentGarmentKey: "base:other",
    garmentType: "other",
  },
);
assert.deepEqual(
  resolveCustomDetailPhysicalComponents({
    parentGarmentKey: " ",
    garmentType: "shirt",
  }),
  { status: "unresolved", code: "invalid_parent_garment_key" },
);

console.log("PASS: authoritative Custom Details physical-component identities");
