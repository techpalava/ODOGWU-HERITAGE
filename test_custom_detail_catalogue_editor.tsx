import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DatabaseView from "./src/components/DatabaseView";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { DesignStyleAuthorityService } from "./src/services/designStyleAuthorityService";
import { useAppStore } from "./src/store/useAppStore";
import type { Customer, CustomDetailOption } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const shirtOption: CustomDetailOption = {
  id: "additional_garment_shirt",
  label: "Shirt",
  description: "Add one separately tailored shirt to this design.",
  garmentGroup: "personalized",
  selectionGroup: "additional_physical_garment",
  priceCents: 0,
  eligibleDemographics: ["unisex"],
  displayOrder: 0,
  required: false,
  active: true,
  allowMultiple: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const originalSubscribe = DesignStyleAuthorityService.subscribeToAdminRecords;
let renderer: ReturnType<typeof create> | undefined;

const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children
        .map((child) => textContent(child as ReactTestInstance | string))
        .join("");

const findByText = (label: string) => {
  const node = renderer?.root.findAll(
    (candidate) =>
      typeof candidate.type === "string" &&
      textContent(candidate).trim() === label,
  ).at(-1);
  assert.ok(node, `Expected "${label}"`);
  return node;
};

const inputForLabel = (label: string) => {
  const labelNode = renderer?.root
    .findAllByType("label")
    .find((candidate) => textContent(candidate).trim() === label);
  assert.ok(labelNode, `Expected field ${label}`);
  const input = labelNode.parent?.findAllByType("input")[0];
  assert.ok(input, `Expected input for ${label}`);
  return input;
};

try {
  DesignStyleAuthorityService.subscribeToAdminRecords = ((onSnapshot) => {
    onSnapshot({ styles: [], diagnostics: [] });
    return () => undefined;
  }) as typeof DesignStyleAuthorityService.subscribeToAdminRecords;

  useAppStore.setState({
    currentUser: {
      name: "Regression Administrator",
      email: "techpalavabox@gmail.com",
      phone: "+234000000000",
    } satisfies Customer,
    referenceData: [],
    customDetailCatalog: [shirtOption],
  });

  const noStateUpdate = () => undefined;
  await act(async () => {
    renderer = create(
      createElement(DatabaseView, {
        customers: [],
        setCustomers: noStateUpdate,
        styles: [],
        setStyles: noStateUpdate,
        fabrics: [],
        setFabrics: noStateUpdate,
        customGroups: [],
        setCustomGroups: noStateUpdate,
        orders: [],
        setOrders: noStateUpdate,
        batches: [],
        setBatches: noStateUpdate,
        businessSettings: DEFAULT_BUSINESS_SETTINGS,
        setBusinessSettings: noStateUpdate,
        initialTab: "styles",
      }),
    );
  });

  assert.equal(
    renderer.root.findAllByType("h3").some((heading) =>
      textContent(heading).includes("Custom Detail Option"),
    ),
    false,
  );

  await act(async () => {
    findByText("Custom Detail Catalogue").props.onClick();
  });
  await act(async () => {
    findByText("Edit").props.onClick();
  });

  assert.ok(
    renderer.root.findAllByType("h3").some((heading) =>
      textContent(heading).includes("Modify Selected Custom Detail Option"),
    ),
  );
  assert.equal(inputForLabel("Option ID (Primary Key)").props.value, shirtOption.id);
  assert.equal(inputForLabel("Customer-Facing Label").props.value, "Shirt");
  assert.equal(
    renderer.root.findAllByType("h3").some((heading) =>
      textContent(heading).includes("Garment Option"),
    ),
    false,
  );

  await act(async () => {
    findByText("Add Option").props.onClick();
  });
  assert.ok(
    renderer.root.findAllByType("h3").some((heading) =>
      textContent(heading).includes("Add New Custom Detail Option"),
    ),
  );
  assert.equal(inputForLabel("Customer-Facing Label").props.value, "");

  console.log("PASS: custom detail catalogue edit and add option open the editor");
} finally {
  DesignStyleAuthorityService.subscribeToAdminRecords = originalSubscribe;
  await act(async () => renderer?.unmount());
}
