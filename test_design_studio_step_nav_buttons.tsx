import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  DesignStudioBackButton,
  DesignStudioForwardButton,
  DesignStudioStepActions,
  studioContinueNavInteractionClass,
  studioOutlinedNavInteractionClass,
} from "./src/components/DesignStudioBackButton";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");

const classNameOf = (node: ReactTestInstance): string =>
  String(node.props.className || "");

const render = (element: ReactElement) => {
  let renderer: ReturnType<typeof create> | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
};

const back = render(
  <DesignStudioBackButton destination="Personalized Additions" />,
);
const backButton = back.root.findByType("button");
assert.equal(backButton.props["aria-label"], "Back one step to Personalized Additions");
assert.equal(backButton.props["data-studio-nav"], "back");
assert.match(textOf(backButton), /Back one step/);
assert.match(textOf(backButton), /to Personalized Additions/);
assert.match(classNameOf(backButton), /min-h-12/);
assert.match(classNameOf(backButton), /min-w-0/);
assert.match(classNameOf(backButton), /max-w-full/);
assert.match(classNameOf(backButton), /text-heritage-ink/);
assert.equal(classNameOf(backButton).includes("whitespace-nowrap"), false);
assert.equal(classNameOf(backButton).includes("shrink-0"), false);
const backLabel = backButton.findByProps({ "data-studio-nav-label": "stack" });
assert.match(classNameOf(backLabel), /flex-col/);
const backPrimary = backLabel.findAllByType("span").find((span) =>
  classNameOf(span).includes("uppercase"),
);
assert.ok(backPrimary);
assert.match(classNameOf(backPrimary), /truncate/);
for (const span of backButton.findAllByType("span")) {
  if (span === backPrimary) continue;
  assert.equal(classNameOf(span).includes("whitespace-nowrap"), false);
  assert.match(classNameOf(span), /flex-col|min-w-0|tracking-wide|tracking-normal|text-current\/75/);
}
const backIcon = backButton.findByType("svg");
assert.equal(String(backIcon.props["aria-hidden"]), "true");
assert.match(String(backIcon.props.className), /shrink-0/);
assert.match(studioOutlinedNavInteractionClass, /duration-200/);
assert.match(studioOutlinedNavInteractionClass, /ease-out/);
assert.match(studioOutlinedNavInteractionClass, /enabled:hover:bg-heritage-green/);
assert.match(studioOutlinedNavInteractionClass, /enabled:hover:text-white/);
assert.match(studioOutlinedNavInteractionClass, /focus-visible:bg-heritage-green/);
assert.match(studioOutlinedNavInteractionClass, /focus-visible:text-white/);
assert.equal(
  /(?:^|\s)hover:bg-heritage-green(?:\s|$)/.test(studioOutlinedNavInteractionClass),
  false,
);
assert.match(classNameOf(backButton), /enabled:hover:bg-heritage-green/);
assert.match(classNameOf(backButton), /enabled:hover:text-white/);
assert.match(classNameOf(backButton), /focus-visible:bg-heritage-green/);
assert.match(classNameOf(backButton), /focus-visible:text-white/);
assert.match(classNameOf(backButton), /duration-200/);
assert.equal(
  /(?:^|\s)hover:(?:border|bg|text)-/.test(classNameOf(backButton)),
  false,
);
const backSecondary = backButton
  .findAllByType("span")
  .find((span) => classNameOf(span).includes("text-current/75"));
assert.ok(backSecondary);
assert.match(classNameOf(backSecondary), /group-enabled:group-hover:text-white!/);
assert.match(classNameOf(backSecondary), /group-focus-visible:text-white!/);

const lockedBack = render(<DesignStudioBackButton disabled />);
const lockedBackButton = lockedBack.root.findByType("button");
assert.equal(
  lockedBackButton.props["aria-label"],
  "Back one step is unavailable on Garment Type",
);
assert.equal(textOf(lockedBackButton).includes("to "), false);
assert.equal(lockedBackButton.props.disabled, true);
assert.match(classNameOf(lockedBackButton), /disabled:bg-heritage-cream\/50/);
assert.match(classNameOf(lockedBackButton), /disabled:text-heritage-ink\/45/);
assert.equal(
  /(?:^|\s)hover:(?:border|bg|text)-/.test(classNameOf(lockedBackButton)),
  false,
);

const forward = render(
  <DesignStudioForwardButton
    destination="Delivery & Pickup"
    ariaLabel="Continue to Delivery & Pickup"
  />,
);
const forwardButton = forward.root.findByType("button");
assert.equal(forwardButton.props["aria-label"], "Continue to Delivery & Pickup");
assert.equal(forwardButton.props["data-studio-nav"], "forward");
assert.match(textOf(forwardButton), /Continue/);
assert.match(textOf(forwardButton), /to Delivery & Pickup/);
assert.equal(classNameOf(forwardButton).includes("whitespace-nowrap"), false);
assert.match(
  classNameOf(forwardButton.findByProps({ "data-studio-nav-label": "stack" })),
  /flex-col/,
);
const forwardIcon = forwardButton.findAllByType("svg").at(-1)!;
assert.equal(String(forwardIcon.props["aria-hidden"]), "true");
assert.match(studioContinueNavInteractionClass, /bg-heritage-green/);
assert.match(studioContinueNavInteractionClass, /text-white/);
assert.match(studioContinueNavInteractionClass, /enabled:hover:bg-white/);
assert.match(studioContinueNavInteractionClass, /enabled:hover:text-heritage-green/);
assert.match(studioContinueNavInteractionClass, /enabled:hover:border-heritage-green/);
assert.match(studioContinueNavInteractionClass, /focus-visible:bg-white/);
assert.match(studioContinueNavInteractionClass, /focus-visible:text-heritage-green/);
assert.match(studioContinueNavInteractionClass, /duration-200/);
assert.equal(
  /(?:^|\s)hover:bg-white(?:\s|$)/.test(studioContinueNavInteractionClass),
  false,
);
assert.match(classNameOf(forwardButton), /bg-heritage-green/);
assert.match(classNameOf(forwardButton), /text-white/);
assert.match(classNameOf(forwardButton), /enabled:hover:bg-white/);
assert.match(classNameOf(forwardButton), /enabled:hover:text-heritage-green/);
assert.match(classNameOf(forwardButton), /focus-visible:bg-white/);
assert.equal(classNameOf(forwardButton).includes("enabled:hover:bg-heritage-forest"), false);
const forwardSecondary = forwardButton
  .findAllByType("span")
  .find((span) => classNameOf(span).includes("text-current/75"));
assert.ok(forwardSecondary);
assert.match(classNameOf(forwardSecondary), /group-enabled:group-hover:text-heritage-green!/);
assert.match(classNameOf(forwardSecondary), /group-focus-visible:text-heritage-green!/);

const review = render(
  <DesignStudioForwardButton label="Review Order" icon="package" ariaLabel="Review Order" />,
);
const reviewButton = review.root.findByType("button");
assert.equal(textOf(reviewButton).replace(/\s+/g, " ").trim(), "Review Order");
assert.equal(reviewButton.props["aria-label"], "Review Order");

const actions = render(
  <DesignStudioStepActions
    backDestination="Summary"
    forward={{
      label: "Review Order",
      ariaLabel: "Review Order",
      locked: true,
      disabled: true,
      describedBy: "studio-step-guide",
    }}
    note={
      <>
        <p id="studio-step-guide" data-testid="studio-step-guide">
          Review Order is locked until personalised price evaluation is resolved.
        </p>
        <p>
          Complete delivery or pickup before reviewing your order. A second
          line must stay under both buttons.
        </p>
      </>
    }
  />,
);
const elementChildren = (node: ReactTestInstance) =>
  node.children.filter(
    (child): child is ReactTestInstance => typeof child !== "string",
  );
const row = actions.root.findByProps({ "data-studio-step-actions": "true" });
assert.match(classNameOf(row), /flex-col/);
assert.equal(classNameOf(row).includes("sm:flex-row"), false);
assert.equal(classNameOf(row).includes("sm:items-center"), false);
assert.equal(classNameOf(row).includes("items-center"), false);
const rowChildren = elementChildren(row);
assert.equal(rowChildren.length, 2);
const buttonRow = rowChildren[0];
const noteRegion = rowChildren[1];
assert.equal(buttonRow.props["data-studio-step-actions-buttons"], "true");
assert.equal(noteRegion.props["data-studio-step-actions-note"], "true");
assert.match(classNameOf(buttonRow), /flex-row/);
assert.match(classNameOf(buttonRow), /flex-nowrap/);
assert.match(classNameOf(buttonRow), /items-stretch/);
assert.match(classNameOf(buttonRow), /justify-between/);
assert.equal(classNameOf(buttonRow).includes("flex-col"), false);
assert.equal(classNameOf(buttonRow).includes("sm:flex-row"), false);
assert.match(classNameOf(noteRegion), /w-full/);
const buttonRowChildren = elementChildren(buttonRow);
assert.equal(buttonRowChildren.length, 2);
assert.equal(
  buttonRow.findAll(
    (node) => node.props?.["data-testid"] === "studio-step-guide",
  ).length,
  0,
);
const pair = buttonRow.findAllByType("button");
assert.equal(pair.length, 2);
assert.equal(pair[0].props["data-studio-nav"], "back");
assert.equal(pair[1].props["data-studio-nav"], "forward");
for (const button of pair) {
  assert.match(classNameOf(button), /min-w-0/);
  assert.match(classNameOf(button), /flex-1/);
  assert.match(classNameOf(button), /basis-0/);
  assert.match(classNameOf(button), /sm:max-w-xs/);
  assert.equal(/(?:^|\s)w-full(?:\s|$)/.test(classNameOf(button)), false);
  assert.equal(classNameOf(button).includes("whitespace-nowrap"), false);
  assert.match(
    classNameOf(button.findByProps({ "data-studio-nav-label": "stack" })),
    /flex-col/,
  );
}
assert.equal(pair[1].props.disabled, true);
assert.equal(pair[1].props["aria-describedby"], "studio-step-guide");
assert.match(classNameOf(pair[1]), /disabled:bg-heritage-green\/35/);
assert.match(classNameOf(pair[1]), /enabled:hover:bg-white/);
assert.equal(
  /(?:^|\s)hover:bg-white(?:\s|$)/.test(classNameOf(pair[1])),
  false,
);
assert.equal(classNameOf(pair[1]).includes("enabled:hover:bg-heritage-forest"), false);
const guide = noteRegion.findByProps({ id: "studio-step-guide" });
assert.equal(guide.props["data-testid"], "studio-step-guide");
const flatHosts: ReactTestInstance[] = [];
const visitHosts = (node: ReactTestInstance) => {
  flatHosts.push(node);
  for (const child of node.children) {
    if (typeof child !== "string") visitHosts(child);
  }
};
visitHosts(row);
const backIndex = flatHosts.findIndex(
  (node) => node.props?.["data-studio-nav"] === "back",
);
const forwardIndex = flatHosts.findIndex(
  (node) => node.props?.["data-studio-nav"] === "forward",
);
const guideIndex = flatHosts.findIndex(
  (node) => node.props?.["data-testid"] === "studio-step-guide",
);
assert.ok(backIndex >= 0 && forwardIndex > backIndex && guideIndex > forwardIndex);

const actionsWithoutNote = render(
  <DesignStudioStepActions
    backDestination="Summary"
    forward={{ label: "Continue", ariaLabel: "Continue" }}
  />,
);
const bare = actionsWithoutNote.root.findByProps({
  "data-studio-step-actions": "true",
});
assert.equal(elementChildren(bare).length, 1);
assert.equal(elementChildren(bare)[0].props["data-studio-step-actions-buttons"], "true");
assert.equal(
  actionsWithoutNote.root.findAll(
    (node) => node.props?.["data-studio-step-actions-note"] === "true",
  ).length,
  0,
);

const noteCallSites = [
  "src/components/GarmentTypeStep.tsx",
  "src/components/DormantFutureDesignStyleStep.tsx",
  "src/components/DormantFutureMeasurementStep.tsx",
  "src/components/DormantFutureSummaryStep.tsx",
  "src/components/DormantFutureShippingStep.tsx",
];
for (const sourcePath of noteCallSites) {
  const source = readFileSync(sourcePath, "utf8");
  const noteAt = source.indexOf("note={");
  assert.ok(noteAt >= 0, `${sourcePath} passes note`);
  const forwardAt = source.indexOf("forward=", noteAt);
  assert.ok(forwardAt > noteAt, `${sourcePath} keeps forward as its own prop`);
  const noteSource = source.slice(noteAt, forwardAt);
  assert.equal(
    noteSource.includes("DesignStudioForwardButton"),
    false,
    `${sourcePath} must not nest Forward inside note`,
  );
  assert.equal(noteSource.includes("lg:text-right"), false, sourcePath);
  assert.equal(noteSource.includes("lg:max-w-sm"), false, sourcePath);
  assert.equal(noteSource.includes("max-w-sm"), false, sourcePath);
}

const outlinedNavSources = [
  "src/components/DormantFutureAiTryOnStep.tsx",
  "src/components/FutureRemainingFabricCapacityOffer.tsx",
  "src/components/DormantFutureDesignStyleStep.tsx",
  "src/components/FutureAdditionalGarmentDesignStyleDialog.tsx",
];
for (const sourcePath of outlinedNavSources) {
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /studioOutlinedNavInteractionClass/);
  assert.equal(source.includes("hover:bg-heritage-gold/10"), false);
  assert.equal(/(?:^|\s)hover:bg-heritage-green(?:\s|$)/.test(source), false);
}
for (const sourcePath of [
  "src/components/DormantFutureAiTryOnStep.tsx",
  "src/components/FutureRemainingFabricCapacityOffer.tsx",
]) {
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /studioContinueNavInteractionClass/);
}

const componentDir = "src/components";
for (const fileName of readdirSync(componentDir)) {
  if (!fileName.endsWith(".tsx") || fileName === "DesignStudioBackButton.tsx") continue;
  const source = readFileSync(`${componentDir}/${fileName}`, "utf8");
  assert.equal(
    source.includes("<DesignStudioForwardButton"),
    false,
    `${fileName} must use DesignStudioStepActions instead of its own Continue button`,
  );
}
const fabricSource = readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8");
const fabricFooterAt = fabricSource.lastIndexOf('backDestination="Garment Type"');
assert.ok(fabricFooterAt > 0);
const fabricFooter = fabricSource.slice(fabricFooterAt, fabricFooterAt + 500);
assert.match(fabricFooter, /forward=\{showContinueAction \?/);
assert.equal(fabricFooter.includes("justify-end"), false);
const garmentSource = readFileSync("src/components/GarmentTypeStep.tsx", "utf8");
const garmentContinueAt = garmentSource.indexOf('data-testid="future-garment-type-continue-action"');
assert.ok(garmentContinueAt > 0);
const garmentContinue = garmentSource.slice(garmentContinueAt, garmentContinueAt + 500);
assert.match(garmentContinue, /<DesignStudioStepActions/);
assert.equal(garmentContinue.includes("justify-end"), false);

console.log("PASS: studio step navigation stays on one row at every width");
