import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  DormantFutureDesignStyleStep,
  STEP3_CONTINUE_NOTE_BEAM_CLASS,
  STEP3_CONTINUE_NOTE_ID,
  STEP3_CONTINUE_TARGET_PULSE_CLASS,
  STEP3_PROGRESS_BEAM_CLASS,
} from "./src/components/DormantFutureDesignStyleStep";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
});

const style: StyleCategory = {
  id: "step3-guide-style",
  name: "Step 3 Guide Heritage",
  description: "Fixture for the Step 3 guide beams.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("skirt"),
  ],
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

type CardMock = {
  scrolls: ScrollIntoViewOptions[];
  focusCalls: FocusOptions[];
};

const css = readFileSync("src/index.css", "utf8");

// Keyframes: the pill beam is slower and softer than the Step 1 audience beam.
assert.match(css, /--animate-step3-progress-beam: step3-progress-beam 3\.6s ease-in-out infinite;/);
assert.match(css, /--animate-step3-continue-note-beam: step1-audience-beam 2\.8s ease-in-out infinite;/);
assert.match(css, /--animate-step3-continue-target-pulse: step2-next-unassigned 1\.2s ease-out 1;/);
assert.match(css, /@keyframes step3-progress-beam \{[\s\S]*?0 0 8px 0 rgb\(197 168 92 \/ 0\.2\)/);

// Reduced motion: no animation, a steady heritage gold border.
for (const beam of [STEP3_PROGRESS_BEAM_CLASS, STEP3_CONTINUE_NOTE_BEAM_CLASS]) {
  assert.match(beam, /motion-safe:animate-step3-/);
  assert.match(beam, /motion-reduce:animate-none/);
  assert.match(beam, /motion-reduce:border-heritage-gold(\s|$)/);
}
assert.equal(STEP3_CONTINUE_TARGET_PULSE_CLASS, "motion-safe:animate-step3-continue-target-pulse");

const runtime = globalThis as unknown as { window?: unknown };
const originalWindow = runtime.window;
let prefersReducedMotion = false;
const frames: FrameRequestCallback[] = [];
runtime.window = {
  cancelAnimationFrame: () => undefined,
  matchMedia: () => ({ matches: prefersReducedMotion }),
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  },
};
const flushFrames = async () => {
  await act(async () => {
    while (frames.length) frames.shift()!(0);
  });
};

const cards = new Map<string, CardMock>();
const render = async (selectedStyleIdByGarmentKey: Record<string, string>, onContinue: () => void) => {
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt", "skirt"]),
    selectedStyleIdByGarmentKey,
  });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DormantFutureDesignStyleStep
        {...createDesignStyleStepRenderProps(model)}
        onContinue={onContinue}
      />,
      {
        createNodeMock: (element) => {
          if (
            element.type === "article" &&
            typeof element.props["data-occurrence-token"] === "string"
          ) {
            const token = element.props["data-occurrence-token"] as string;
            const existing = cards.get(token);
            if (existing) return existing;
            const card: CardMock & {
              scrollIntoView(options: ScrollIntoViewOptions): void;
              focus(options: FocusOptions): void;
            } = {
              scrolls: [],
              focusCalls: [],
              scrollIntoView(options) {
                this.scrolls.push(options);
              },
              focus(options) {
                this.focusCalls.push(options);
              },
            };
            cards.set(token, card);
            return card;
          }
          return { focus: () => undefined, scrollIntoView: () => undefined };
        },
      },
    );
  });
  return { renderer, model };
};

const forwardButtons = (root: ReactTestInstance) =>
  root.findAll(
    (node) => node.type === "button" && node.props["data-studio-nav"] === "forward",
  );

try {
  // Incomplete: 1 of 2 assigned (the Standard Skirt still needs a design).
  let continueCalls = 0;
  const { renderer, model } = await render({ "base:shirt:1": style.id }, () => {
    continueCalls += 1;
  });
  const root = renderer.root;
  const firstIncomplete = model.projection.occurrences.find(
    (occurrence) => occurrence.status !== "complete",
  )!;
  assert.ok(firstIncomplete, "fixture has an unassigned garment");
  const targetToken = firstIncomplete.target.occurrenceToken;

  // 1. Progress pill: same wording, a real button with the beam, inside a
  // live region that stays mounted.
  const pill = root.findByProps({ "data-testid": "step3-assignment-progress" });
  assert.equal(pill.type, "button");
  assert.equal(pill.props.type, "button");
  assert.equal(textContent(pill), "1 of 2 garments assigned");
  assert.equal(pill.props["data-step3-progress-beam"], "on");
  assert.ok(String(pill.props.className).includes(STEP3_PROGRESS_BEAM_CLASS));
  assert.equal(pill.props["aria-describedby"], STEP3_CONTINUE_NOTE_ID);
  const region = root.findByProps({ "data-testid": "step3-assignment-progress-region" });
  assert.equal(region.props["aria-live"], "polite");
  assert.ok(region.findByProps({ "data-testid": "step3-assignment-progress" }));

  // 2. Note: same wording, under the bottom Continue only, with the beam.
  const footer = root.findByProps({ "data-testid": "future-design-style-continue-action" });
  const forwardColumn = footer.findByProps({ "data-studio-step-actions-forward-column": "true" });
  const columnChildren = forwardColumn.children.filter(
    (child): child is ReactTestInstance => typeof child !== "string",
  );
  const columnHosts = forwardColumn.findAll(
    (node) =>
      typeof node.type === "string" &&
      (node.props["data-studio-nav"] === "forward" ||
        node.props["data-studio-step-actions-forward-note"] === "true"),
  );
  assert.deepEqual(
    columnHosts.map((node) =>
      node.props["data-studio-nav"] === "forward" ? "continue" : "note",
    ),
    ["continue", "note"],
    "the note comes directly after the bottom Continue",
  );
  assert.ok(columnChildren.length >= 2);
  const note = footer.findByProps({ "data-testid": "step3-continue-lock-note" });
  assert.equal(textContent(note), "Choose a design reference for Standard Skirt to continue.");
  assert.equal(note.props.id, STEP3_CONTINUE_NOTE_ID);
  assert.equal(note.props.role, "status");
  assert.ok(String(note.props.className).includes(STEP3_CONTINUE_NOTE_BEAM_CLASS));
  assert.equal(
    root.findAll((node) => node.props?.["data-testid"] === "step3-continue-lock-note").length,
    1,
    "the header Continue gets no note",
  );
  assert.equal(
    root
      .findByProps({ "data-studio-step-actions-slot": "header" })
      .findAll((node) => node.props?.["data-studio-step-actions-forward-note"] === "true").length,
    0,
  );
  assert.equal(
    footer.findAll((node) => node.props?.["data-studio-step-actions-note"] === "true").length,
    0,
    "the note no longer sits in the full-width note row",
  );

  // 3. Locked Continue: looks locked, clickable, never continues; jumps to the
  // first unassigned garment card, focuses it and pulses it once.
  const forwards = forwardButtons(root);
  assert.equal(forwards.length, 2, "header and footer Continue");
  for (const button of forwards) {
    assert.equal(button.props.disabled, undefined);
    assert.equal(button.props["aria-disabled"], "true");
    assert.equal(button.props["aria-describedby"], STEP3_CONTINUE_NOTE_ID);
    assert.equal(button.props["data-continue-unlock-glow"], "off");
  }

  for (const [index, button] of forwards.entries()) {
    const card = cards.get(targetToken)!;
    const scrollsBefore = card.scrolls.length;
    const focusBefore = card.focusCalls.length;
    await act(async () => button.props.onClick());
    assert.equal(continueCalls, 0, "locked Continue never calls onContinue");
    assert.equal(card.scrolls.length, scrollsBefore + 1);
    assert.deepEqual(card.scrolls.at(-1), { behavior: "smooth", block: "center" });
    const targetCard = root.find(
      (node) => node.type === "article" && node.props["data-occurrence-token"] === targetToken,
    );
    assert.equal(targetCard.props.tabIndex, -1, "the target card can take focus");
    assert.equal(targetCard.props["data-step3-continue-target"], "true");
    await flushFrames();
    assert.equal(card.focusCalls.length, focusBefore + 1, `Continue ${index} focuses the card`);
    assert.deepEqual(card.focusCalls.at(-1), { preventScroll: true });
    const pulsing = root.find(
      (node) => node.type === "article" && node.props["data-occurrence-token"] === targetToken,
    );
    assert.equal(pulsing.props["data-step3-continue-target-pulse"], "true");
    assert.ok(String(pulsing.props.className).includes(STEP3_CONTINUE_TARGET_PULSE_CLASS));
    // Only the first unassigned card is targeted.
    for (const other of root.findAll(
      (node) =>
        node.type === "article" &&
        typeof node.props["data-occurrence-token"] === "string" &&
        node.props["data-occurrence-token"] !== targetToken,
    )) {
      assert.equal(other.props["data-step3-continue-target"], undefined);
      assert.equal(String(other.props.className).includes(STEP3_CONTINUE_TARGET_PULSE_CLASS), false);
    }
  }

  // The pulse is one-shot: it is removed after ~1.2s.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1300));
  });
  assert.equal(
    root.find(
      (node) => node.type === "article" && node.props["data-occurrence-token"] === targetToken,
    ).props["data-step3-continue-target-pulse"],
    undefined,
  );

  // The pill jumps to the same first unassigned card.
  {
    const card = cards.get(targetToken)!;
    const before = card.scrolls.length;
    await act(async () =>
      root.findByProps({ "data-testid": "step3-assignment-progress" }).props.onClick(),
    );
    await flushFrames();
    assert.equal(card.scrolls.length, before + 1);
    assert.equal(continueCalls, 0);
  }

  // Reduced motion: instant scroll; the pulse class is motion-safe only.
  prefersReducedMotion = true;
  {
    const card = cards.get(targetToken)!;
    await act(async () => forwardButtons(root)[1]!.props.onClick());
    await flushFrames();
    assert.deepEqual(card.scrolls.at(-1), { behavior: "auto", block: "center" });
    assert.equal(continueCalls, 0);
  }
  prefersReducedMotion = false;

  // Complete: no beam, the check stays, the note is gone, Continue works.
  let completeContinueCalls = 0;
  const complete = await render(
    { "base:shirt:1": style.id, "base:skirt:1": style.id },
    () => {
      completeContinueCalls += 1;
    },
  );
  const completeRoot = complete.renderer.root;
  const completePill = completeRoot.findByProps({ "data-testid": "step3-assignment-progress" });
  assert.equal(completePill.type, "div", "a complete pill is not interactive");
  assert.equal(completePill.props["data-step3-progress-beam"], "off");
  assert.equal(String(completePill.props.className).includes("animate-step3-progress-beam"), false);
  assert.equal(String(completePill.props.className).includes("motion-reduce:border-heritage-gold"), false);
  assert.equal(textContent(completePill), "2 of 2 garments assigned");
  assert.equal(completePill.findAll((node) => node.props?.["aria-hidden"] === "true").length > 0, true, "check icon stays");
  assert.equal(
    completeRoot.findAll((node) => node.props?.["data-testid"] === "step3-continue-lock-note").length,
    0,
  );
  assert.equal(
    completeRoot.findAll((node) => node.props?.["data-studio-step-actions-forward-column"] === "true").length,
    0,
  );
  const completeForwards = forwardButtons(completeRoot);
  for (const button of completeForwards) {
    assert.equal(button.props.disabled, false);
    assert.equal(button.props["aria-disabled"], undefined);
    assert.equal(button.props["aria-describedby"], undefined);
  }
  await act(async () => completeForwards[1]!.props.onClick());
  assert.equal(completeContinueCalls, 1, "an unlocked Continue continues as before");
} finally {
  runtime.window = originalWindow;
}

console.log("test_step3_guide_beams: ok");
