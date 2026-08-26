/**
 * Customer-facing Fabric catalogue cards must not render per-Fabric unit prices.
 * Shared by Step 2 and Step 4 Optional Extra Garment Fabric popup.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { FutureFabricCatalogueCard } from "./src/components/FutureFabricCatalogueCard";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { resolveFabricPrice } from "./src/utils/fabricPricing";
import { PRICING_CURRENCY_SYMBOL } from "./src/utils/money";
import type { Fabric, FabricAllocation } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const pricedFabric: Fabric = {
  code: "ODG-007",
  name: "Imperial Sapphire Link",
  description: "Priced fabric",
  color: "Blue",
  colorHex: "#123456",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 3.91,
  image: "https://example.test/odg-007.jpg",
};

const unpricedFabric: Fabric = {
  ...pricedFabric,
  code: "ODG-UNPRICED",
  name: "Needs Catalogue Review",
  category: "Future Fabric",
  price: undefined,
};

const selectPresentation = {
  status: "SELECT" as const,
  action: "select" as const,
  cancelGarmentKey: null,
};

const renderCard = (fabric: Fabric, extras?: Record<string, unknown>) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(FutureFabricCatalogueCard, {
        fabric,
        presentation: selectPresentation,
        onAction: () => undefined,
        ...extras,
      }),
    );
  });
  return renderer;
};

// TEST A / E — shared card: valid price fabric shows name/code/stock/SELECT, no € amount
{
  const renderer = renderCard(pricedFabric, {
    dataAttributes: { "data-step2-fabric-card": "true" },
  });
  const card = renderer.root.findByProps({
    "data-fabric-catalogue-card": "true",
  });
  const text = textContent(card);
  assert.match(text, /Imperial Sapphire Link/);
  assert.match(text, /ODG-007/);
  assert.match(text, /SELECT|In Stock|Low Stock/i);
  assert.equal(text.includes("€"), false);
  assert.equal(text.includes("3.91"), false);
  assert.equal(text.includes(`${PRICING_CURRENCY_SYMBOL}3.91`), false);
  assert.equal(
    renderer.root.findAll(
      (node) =>
        typeof node === "object" &&
        typeof node.props?.className === "string" &&
        node.props.className.includes("text-heritage-gold") &&
        typeof textContent(node) === "string" &&
        /\d+\.\d{2}/.test(textContent(node)),
    ).length,
    0,
    "no customer Fabric-price element in card DOM",
  );
  assert.equal(
    resolveFabricPrice(pricedFabric),
    3.91,
    "internal resolveFabricPrice still returns catalogue price",
  );
}

// TEST B — Step 4 popup card uses same shared component without price
{
  const renderer = renderCard(pricedFabric, {
    targetGarmentLabel: "Shirt",
    dataAttributes: { "data-step4-fabric-card": "true" },
  });
  const text = textContent(renderer.root);
  assert.match(text, /Imperial Sapphire Link/);
  assert.match(text, /ODG-007/);
  assert.equal(text.includes("€"), false);
  assert.equal(text.includes("3.91"), false);
  const action = renderer.root.findByProps({ "data-fabric-card": "true" });
  assert.equal(action.props.disabled, false);
  assert.match(String(action.props["aria-label"] || ""), /SELECT/i);
  assert.equal(
    String(action.props["aria-label"] || "").includes("3.91"),
    false,
  );
}

// TEST C — missing-price Fabric stays unavailable; no numeric price in DOM
{
  const renderer = renderCard(unpricedFabric);
  const text = textContent(renderer.root);
  assert.equal(text.includes("€"), false);
  assert.equal(text.includes("3.91"), false);
  assert.match(text, /Price needs catalogue review before selection\./);
  const action = renderer.root.findByProps({ "data-fabric-card": "true" });
  assert.equal(action.props.disabled, true);
  assert.match(textContent(action), /Unavailable/);
}

// TEST D — internal allocation pricing still includes catalogue price
{
  const allocation: FabricAllocation = {
    allocationId: "alloc-hide-price-test",
    fabricCode: pricedFabric.code,
    garmentAssignments: [
      {
        code: "BASE_SHIRT",
        garmentKey: "base:shirt",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "main",
      },
    ],
  };
  const pricing = resolveFabricAllocationMaterialPricing(
    [allocation],
    [pricedFabric],
  );
  assert.equal(pricing.status, "resolved");
  assert.equal(pricing.totalMaterialPrice, 3.91);
}

// TEST F — source must not CSS-hide a price; price row removed from component
{
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync("src/components/FutureFabricCatalogueCard.tsx", "utf8"),
  );
  assert.equal(source.includes("resolveFabricPrice"), false);
  assert.equal(source.includes("PRICING_CURRENCY_SYMBOL"), false);
  assert.equal(source.includes("price.toFixed"), false);
  assert.equal(/display:\s*none|sr-only|visibility:\s*hidden|opacity-0/.test(source), false);
}

console.log("PASS: FutureFabricCatalogueCard hides customer Fabric prices");
