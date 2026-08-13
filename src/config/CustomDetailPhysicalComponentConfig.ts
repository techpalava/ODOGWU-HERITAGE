import type {
  CanonicalPhysicalGarmentType,
  CustomDetailGarmentGroup,
} from "../types";
import { STYLE_BASE_GARMENT_TYPES } from "./StyleFabricCapacityConfig";

export type CustomDetailComponentKeyStrategy = "parent" | "child";

export interface CustomDetailPhysicalComponentDefinition {
  componentId: string;
  garmentType: CanonicalPhysicalGarmentType;
  garmentGroups: readonly CustomDetailGarmentGroup[];
  order: number;
  keyStrategy: CustomDetailComponentKeyStrategy;
}

export interface ResolvedCustomDetailPhysicalComponent
  extends CustomDetailPhysicalComponentDefinition {
  garmentKey: string;
  parentGarmentKey: string;
}

export type CustomDetailPhysicalComponentResolution =
  | {
      status: "resolved";
      parentGarmentKey: string;
      parentGarmentType: CanonicalPhysicalGarmentType;
      components: ResolvedCustomDetailPhysicalComponent[];
    }
  | {
      status: "unresolved";
      code:
        | "invalid_parent_garment_key"
        | "unsupported_garment_type"
        | "invalid_component_configuration";
      parentGarmentKey?: string;
      garmentType?: string;
    };

const parentComponent = (
  componentId: string,
  garmentType: CanonicalPhysicalGarmentType,
  garmentGroups: readonly CustomDetailGarmentGroup[],
): readonly CustomDetailPhysicalComponentDefinition[] => [
  {
    componentId,
    garmentType,
    garmentGroups,
    order: 10,
    keyStrategy: "parent",
  },
];

/**
 * Future Custom Details identity only. Fabric capacity and Step 1 construction
 * continue to treat every entry as its established parent garment.
 */
export const CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT: Readonly<
  Record<
    CanonicalPhysicalGarmentType,
    readonly CustomDetailPhysicalComponentDefinition[]
  >
> = {
  shirt: parentComponent("shirt", "shirt", ["shirt", "neck"]),
  trouser: parentComponent("trouser", "trouser", ["trousers"]),
  standard_shorts: parentComponent(
    "standard_shorts",
    "standard_shorts",
    ["standard_shorts"],
  ),
  skirt: parentComponent("skirt", "skirt", ["skirt"]),
  bum_shorts: parentComponent("bum_shorts", "bum_shorts", ["bum_shorts"]),
  dress: parentComponent("dress", "dress", ["dress", "neck"]),
  kaftan: parentComponent("kaftan", "kaftan", ["shirt", "neck"]),
  full_length_gown: parentComponent(
    "full_length_gown",
    "full_length_gown",
    ["dress", "neck"],
  ),
  agbada: [
    {
      componentId: "shirt",
      garmentType: "shirt",
      garmentGroups: ["shirt", "neck"],
      order: 10,
      keyStrategy: "child",
    },
    {
      componentId: "trouser",
      garmentType: "trouser",
      garmentGroups: ["trousers"],
      order: 20,
      keyStrategy: "child",
    },
  ],
};

const CANONICAL_PHYSICAL_GARMENT_TYPE_SET = new Set<string>(
  STYLE_BASE_GARMENT_TYPES,
);

const isStableKeyPart = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.trim() === value &&
  !value.includes(":");

const isStableParentGarmentKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.trim() === value;

export const deriveCustomDetailComponentKey = (
  parentGarmentKey: string,
  componentId: string,
): string => `${parentGarmentKey}:${componentId}`;

const cloneDefinition = (
  definition: CustomDetailPhysicalComponentDefinition,
): CustomDetailPhysicalComponentDefinition => ({
  ...definition,
  garmentGroups: [...definition.garmentGroups],
});

export const resolveCustomDetailPhysicalComponents = ({
  parentGarmentKey,
  garmentType,
}: {
  parentGarmentKey: unknown;
  garmentType: unknown;
}): CustomDetailPhysicalComponentResolution => {
  if (!isStableParentGarmentKey(parentGarmentKey)) {
    return { status: "unresolved", code: "invalid_parent_garment_key" };
  }
  if (
    typeof garmentType !== "string" ||
    !CANONICAL_PHYSICAL_GARMENT_TYPE_SET.has(garmentType)
  ) {
    return {
      status: "unresolved",
      code: "unsupported_garment_type",
      parentGarmentKey,
      ...(typeof garmentType === "string" ? { garmentType } : {}),
    };
  }

  const parentGarmentType = garmentType as CanonicalPhysicalGarmentType;
  const definitions = CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT[
    parentGarmentType
  ]
    .map(cloneDefinition)
    .sort(
      (left, right) =>
        left.order - right.order || left.componentId.localeCompare(right.componentId),
    );
  const componentIds = new Set<string>();
  const componentKeys = new Set<string>();
  const assignedGroups = new Set<CustomDetailGarmentGroup>();
  const components: ResolvedCustomDetailPhysicalComponent[] = [];

  for (const definition of definitions) {
    const garmentKey =
      definition.keyStrategy === "parent"
        ? parentGarmentKey
        : deriveCustomDetailComponentKey(
            parentGarmentKey,
            definition.componentId,
          );
    const malformed =
      !isStableKeyPart(definition.componentId) ||
      definition.garmentGroups.length === 0 ||
      componentIds.has(definition.componentId) ||
      componentKeys.has(garmentKey) ||
      definition.garmentGroups.some((group) => assignedGroups.has(group));
    if (malformed) {
      return {
        status: "unresolved",
        code: "invalid_component_configuration",
        parentGarmentKey,
        garmentType: parentGarmentType,
      };
    }
    componentIds.add(definition.componentId);
    componentKeys.add(garmentKey);
    definition.garmentGroups.forEach((group) => assignedGroups.add(group));
    components.push({
      ...definition,
      garmentGroups: [...definition.garmentGroups],
      garmentKey,
      parentGarmentKey,
    });
  }

  if (components.length === 0) {
    return {
      status: "unresolved",
      code: "invalid_component_configuration",
      parentGarmentKey,
      garmentType: parentGarmentType,
    };
  }
  return {
    status: "resolved",
    parentGarmentKey,
    parentGarmentType,
    components,
  };
};
