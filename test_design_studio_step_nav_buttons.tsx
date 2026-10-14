import assert from "node:assert/strict";
import type { ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  DesignStudioBackButton,
  DesignStudioForwardButton,
  DesignStudioStepActions,
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
for (const span of backButton.findAllByType("span")) {
  assert.equal(classNameOf(span).includes("whitespace-nowrap"), false);
  assert.match(classNameOf(span), /overflow-wrap:normal|min-w-0|tracking-wide|tracking-normal/);
}
const backIcon = backButton.findByType("svg");
assert.equal(String(backIcon.props["aria-hidden"]), "true");
assert.match(String(backIcon.props.className), /shrink-0/);

const lockedBack = render(<DesignStudioBackButton disabled />);
const lockedBackButton = lockedBack.root.findByType("button");
assert.equal(
  lockedBackButton.props["aria-label"],
  "Back one step is unavailable on Garment Type",
);
assert.equal(textOf(lockedBackButton).includes("to "), false);
assert.equal(lockedBackButton.props.disabled, true);

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
const forwardIcon = forwardButton.findAllByType("svg").at(-1)!;
assert.equal(String(forwardIcon.props["aria-hidden"]), "true");

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
    }}
    note={<p>Review Order is locked until personalised price evaluation is resolved.</p>}
  />,
);
const row = actions.root.findByProps({ "data-studio-step-actions": "true" });
assert.match(classNameOf(row), /flex-col/);
assert.match(classNameOf(row), /sm:flex-row/);
assert.match(classNameOf(row), /sm:items-center/);
assert.match(classNameOf(row), /sm:justify-between/);
const pair = row.findAllByType("button");
assert.equal(pair.length, 2);
for (const button of pair) {
  assert.match(classNameOf(button), /w-full/);
  assert.match(classNameOf(button), /min-w-0|max-w-full/);
  assert.equal(classNameOf(button).includes("whitespace-nowrap"), false);
}
assert.match(classNameOf(pair[0]), /sm:flex-1/);
assert.match(classNameOf(pair[0]), /sm:max-w-xs/);

console.log("PASS: studio step navigation labels stay in one wrapping line");
