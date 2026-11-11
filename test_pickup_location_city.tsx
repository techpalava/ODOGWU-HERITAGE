import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const browserWindow = {
  setTimeout: () => 0,
  scrollTo() {},
  location: { pathname: "/", search: "", hash: "" },
  addEventListener() {},
  removeEventListener() {},
};
const browserStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
Object.assign(globalThis, {
  window: browserWindow,
  document: { getElementById: () => null },
  sessionStorage: browserStorage,
  localStorage: browserStorage,
});

const { calculateFinalMileShipping } = await import("./src/utils/shippingPricing");
const {
  customerFacingPickupCity,
  customerFacingPickupLocationLabel,
  customerFacingPickupWording,
  FUTURE_PICKUP_ATELIER_ADDRESS,
} = await import("./src/utils/designStudioFutureShipping");
const { presentWorkshopStageLines, workshopStageStatus } = await import(
  "./src/utils/futureOrderV2WorkshopProgress"
);
const { presentCustomerWorkshopProgress } = await import(
  "./src/utils/customerWorkshopProgress"
);

const ATELIER_ADDRESS = "Frans Snijderslaan 4-b, 5642 AN, Eindhoven";
const CONFLICTING_ADDRESS = "Kerkstraat 12, 5504 AB, Veldhoven";
const LEGACY = "Veldhoven Campus Lockers";

assert.equal(FUTURE_PICKUP_ATELIER_ADDRESS, ATELIER_ADDRESS);
assert.equal(customerFacingPickupLocationLabel(LEGACY), "Eindhoven");
assert.equal(customerFacingPickupLocationLabel("  veldhoven campus lockers  "), "Eindhoven");
assert.equal(customerFacingPickupLocationLabel(""), "Eindhoven");
assert.equal(customerFacingPickupLocationLabel(null), "Eindhoven");
assert.equal(customerFacingPickupLocationLabel("Eindhoven"), "Eindhoven");
assert.equal(customerFacingPickupLocationLabel("Atelier Front Desk"), "Atelier Front Desk");
assert.equal(customerFacingPickupLocationLabel("ASML Veldhoven Campus"), "ASML Veldhoven Campus");
assert.equal(customerFacingPickupLocationLabel(ATELIER_ADDRESS), ATELIER_ADDRESS);
assert.equal(customerFacingPickupLocationLabel(CONFLICTING_ADDRESS), CONFLICTING_ADDRESS);
assert.equal(customerFacingPickupCity(""), "");
assert.equal(customerFacingPickupCity(LEGACY), "Eindhoven");
assert.equal(
  customerFacingPickupWording(`Arrived at ${LEGACY}. Ready for secure PIN pickup!`),
  "Arrived at Eindhoven. Ready for secure PIN pickup!",
);
assert.equal(customerFacingPickupWording("N.T.C.C. Veldhoven"), "N.T.C.C. Veldhoven");
assert.equal(customerFacingPickupWording(CONFLICTING_ADDRESS), CONFLICTING_ADDRESS);

assert.equal(
  workshopStageStatus(6, LEGACY),
  "Arrived at Eindhoven. Ready for secure PIN pickup!",
);
assert.equal(
  workshopStageStatus(6, "Amsterdam"),
  "Arrived at Amsterdam. Ready for secure PIN pickup!",
);
assert.equal(
  workshopStageStatus(6, ""),
  "Arrived at the pickup location. Ready for secure PIN pickup!",
);
assert.equal(
  workshopStageStatus(6, CONFLICTING_ADDRESS),
  `Arrived at ${CONFLICTING_ADDRESS}. Ready for secure PIN pickup!`,
);

const legacyQuote = calculateFinalMileShipping({
  deliverySelection: { method: "PICKUP", pickupLocation: LEGACY },
  garmentPieceCount: 1,
  shipmentGroupId: "group",
  arrivalGroupKey: "individual",
});
assert.equal(legacyQuote.method, "PICKUP");
assert.equal(legacyQuote.pickupLocation, "Eindhoven");
assert.equal(legacyQuote.priceEur, 0);

const addressQuote = calculateFinalMileShipping({
  deliverySelection: { method: "PICKUP", pickupLocation: CONFLICTING_ADDRESS },
  garmentPieceCount: 2,
  shipmentGroupId: "group",
  arrivalGroupKey: "individual",
});
assert.equal(addressQuote.pickupLocation, CONFLICTING_ADDRESS);
assert.equal(addressQuote.priceEur, 0);

const blankQuote = calculateFinalMileShipping({
  deliverySelection: { method: "PICKUP", pickupLocation: "   " },
  garmentPieceCount: 1,
  shipmentGroupId: "group",
  arrivalGroupKey: "individual",
});
assert.equal(blankQuote.pickupLocation, "");

assert.equal(
  presentCustomerWorkshopProgress({
    shipment: {
      status: `Arrived at ${LEGACY}. Ready for secure PIN pickup!`,
      currentStage: 6,
    },
  }).statusLabel,
  "Arrived at Eindhoven. Ready for secure PIN pickup!",
);
assert.equal(
  presentWorkshopStageLines({
    stageHistory: [
      {
        stage: 6,
        status: `Arrived at ${LEGACY}. Ready for secure PIN pickup!`,
        recordedAt: "",
      },
    ],
  } as never)[0].statusLabel,
  "Arrived at Eindhoven. Ready for secure PIN pickup!",
);

const home = readFileSync("src/components/HomeView.tsx", "utf8");
assert.match(home, /campus lockers in\s+Eindhoven\./);
assert.equal(/campus lockers in\s+Veldhoven\./.test(home), false);

const dashboard = readFileSync("src/components/DashboardView.tsx", "utf8");
assert.match(dashboard, /fitting session on-site\s+at Eindhoven\./);
assert.match(dashboard, /N\.T\.C\.C\. Veldhoven/);
assert.match(dashboard, /NTCC Veldhoven/);
assert.equal(dashboard.includes("at Veldhoven."), false);

const about = readFileSync("src/components/AboutView.tsx", "utf8");
assert.match(about, /Founder & Coordinator[\s\S]{0,180}Veldhoven/);

const reviews = readFileSync("src/utils/customerReviews.ts", "utf8");
assert.match(reviews, /location: "Veldhoven"/);

const email = readFileSync("src/server/orderConfirmationEmail.ts", "utf8");
const emailCopy = readFileSync("src/utils/aiTryOnOrderImageCopy.ts", "utf8");
assert.equal(email.includes("Veldhoven"), false);
assert.equal(email.includes("Eindhoven"), false);
assert.equal(emailCopy.includes("Veldhoven"), false);

const shippingStep = readFileSync("src/components/DormantFutureShippingStep.tsx", "utf8");
assert.match(shippingStep, /Pick Up in Eindhoven/);
assert.equal(shippingStep.includes("Veldhoven"), false);

const { act, create } = await import("react-test-renderer");
const { useAppStore } = await import("./src/store/useAppStore");
const { default: Footer } = await import("./src/components/Footer");
const { DEFAULT_BUSINESS_SETTINGS } = await import("./src/data/mockData");

const originalState = useAppStore.getState();
const renderFooter = async (defaultPickupLocation: string) => {
  useAppStore.setState({
    businessSettings: {
      ...DEFAULT_BUSINESS_SETTINGS,
      productionSettings: {
        ...DEFAULT_BUSINESS_SETTINGS.productionSettings,
        defaultPickupLocation,
      },
    },
  } as never);
  let tree: ReturnType<typeof create> | undefined;
  await act(async () => {
    tree = create(createElement(Footer, {}));
  });
  const location = tree!.root.findByProps({ "data-footer-pickup-location": true });
  const markup = location.children
    .filter((child): child is string => typeof child === "string")
    .join("");
  await act(async () => {
    tree!.unmount();
  });
  return markup;
};

try {
  const legacyFooter = await renderFooter(LEGACY);
  assert.equal(legacyFooter, "Eindhoven");

  const addressFooter = await renderFooter(CONFLICTING_ADDRESS);
  assert.equal(addressFooter, CONFLICTING_ADDRESS);
} finally {
  useAppStore.setState(originalState, true);
}
