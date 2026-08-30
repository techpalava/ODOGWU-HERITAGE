/**
 * Step 3 full-catalogue discovery UX.
 * Fixtures only — does not mutate production catalogue records.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { ReactElement } from "react";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;

const { DormantFutureDesignStyleStep } = await import(
  "./src/components/DormantFutureDesignStyleStep"
);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const shirtTrouserMale: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};

const dressFemale: GarmentTypeStepSelection = {
  garmentTypes: ["dress"],
  demographic: "female",
  audienceSelection: { schemaVersion: 1, demographics: ["female"] },
  constructionByGarment: {},
};

const styleA: StyleCategory = {
  id: "style-a-exact",
  name: "Heritage Classic",
  description: "Exact shirt + trouser match.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const styleB: StyleCategory = {
  id: "style-b-adaptable",
  name: "Royal Senator",
  description: "Kaftan original, explicitly adaptable.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("kaftan")],
  styleApplicability: {
    mode: "adaptable",
    garmentTypes: ["shirt", "trouser", "kaftan"],
  },
};

const styleC: StyleCategory = {
  id: "style-c-blocked-garment",
  name: "Palace Kaftan",
  description: "Kaftan only, not approved for this order.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("kaftan")],
};

const styleD: StyleCategory = {
  id: "style-d-blocked-demographic",
  name: "Ladies Evening",
  description: "Female shirt + trouser, demographic mismatch.",
  gender: "female",
  targetDemographic: "female",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const styleE: StyleCategory = {
  id: "style-e-indeterminate",
  name: "Unreviewed Archive",
  description: "Malformed catalogue metadata.",
  gender: "male",
  targetDemographic: "male",
  options: [],
};

const styleF: StyleCategory = {
  id: "style-f-disabled",
  name: "Retired Classic",
  description: "Disabled catalogue design.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
  isActive: false,
} as StyleCategory;

const fullCatalogue = [styleA, styleB, styleC, styleD, styleE, styleF];

const emptyUploaded = {
  source: null,
  reference: null,
  composition: [],
  demographic: null,
  previewUrl: null,
  error: "",
  isUploading: false,
  isReplacing: false,
  isDeleting: false,
  isLoadingPreview: false,
  isConfirmed: false,
  isPricingActive: false,
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const findCards = (
  root: ReactTestInstance,
  predicate?: (card: ReactTestInstance) => boolean,
) =>
  root
    .findAll((node) => typeof node.props?.["data-style-card"] === "string")
    .filter((card) => (predicate ? predicate(card) : true));

const cardsInSection = (root: ReactTestInstance, testId: string) =>
  findCards(root.findByProps({ "data-testid": testId }));

const cardById = (root: ReactTestInstance, styleId: string) => {
  const cards = findCards(
    root,
    (card) => card.props["data-style-card"] === styleId,
  );
  assert.ok(cards.length > 0, `expected card ${styleId}`);
  return cards[0]!;
};

const buttonsByLabel = (root: ReactTestInstance, label: string) =>
  root
    .findAllByType("button")
    .filter((button) => textContent(button).includes(label));

const renderStep = async ({
  styles,
  garmentTypeSelection = shirtTrouserMale,
  selectedStyleId = null,
  onSelectStyle = () => undefined,
}: {
  styles: StyleCategory[];
  garmentTypeSelection?: GarmentTypeStepSelection;
  selectedStyleId?: string | null;
  onSelectStyle?: (styleId: string) => void;
}) => {
  let renderer!: ReturnType<typeof create>;
  const tree: ReactElement = (
    <DormantFutureDesignStyleStep
      styles={styles}
      garmentTypeSelection={garmentTypeSelection}
      selectedStyleId={selectedStyleId}
      stagePrice={null}
      uploadedDesign={emptyUploaded}
      pendingCatalogStyleName={null}
      stylesLoadState="ready"
      onSelectStyle={onSelectStyle}
      onUploadDesignFile={() => undefined}
      onToggleUploadedGarment={() => undefined}
      onUploadedDemographicChange={() => undefined}
      onRemoveUploadedDesign={() => undefined}
      onRetryUploadedDesignDeletion={() => undefined}
      onContinueUploadedDesign={() => undefined}
      onBack={() => undefined}
      onReturnToGarmentType={() => undefined}
      onContinue={() => undefined}
    />
  );
  await act(async () => {
    renderer = create(tree);
  });
  return { renderer, tree };
};

// Full catalogue visibility
{
  const { renderer } = await renderStep({ styles: fullCatalogue });
  const ids = new Set(
    findCards(renderer.root).map((card) => card.props["data-style-card"]),
  );
  assert.deepEqual(
    [...ids].sort(),
    fullCatalogue.map((style) => style.id).sort(),
  );
  assert.equal(cardById(renderer.root, styleC.id).props["data-style-tier"], "blocked");
  assert.equal(
    cardById(renderer.root, styleE.id).props["data-style-tier"],
    "indeterminate",
  );
}

// Best Matches section
{
  const { renderer } = await renderStep({ styles: fullCatalogue });
  const bestMatchIds = cardsInSection(renderer.root, "step3-best-matches").map(
    (card) => card.props["data-style-card"],
  );
  assert.deepEqual(bestMatchIds, [styleA.id]);
  assert.equal(
    textContent(cardById(renderer.root, styleA.id)).includes("BEST MATCH"),
    true,
  );
  assert.equal(
    cardsInSection(renderer.root, "step3-best-matches").some(
      (card) => card.props["data-style-card"] === styleB.id,
    ),
    false,
  );
}

// Zero exact, adaptable remains
{
  const { renderer } = await renderStep({
    styles: [styleB, styleC],
  });
  assert.match(
    textContent(renderer.root),
    /No exact catalogue matches yet\. Explore adaptable designs below/,
  );
  assert.equal(
    textContent(renderer.root).includes("No matching design styles are available yet"),
    false,
  );
  const adaptableCard = cardById(renderer.root, styleB.id);
  assert.equal(adaptableCard.props["data-style-tier"], "adaptable");
  assert.match(textContent(adaptableCard), /CAN BE ADAPTED/);
  const useButtons = buttonsByLabel(renderer.root, "Use This Design");
  assert.equal(useButtons.length, 1);
  assert.equal(useButtons[0]!.props.disabled, false);
}

// Adaptable dialog isolation
{
  const selected: string[] = [];
  const { renderer } = await renderStep({
    styles: [styleA, styleB, styleC],
    onSelectStyle: (styleId) => selected.push(styleId),
  });
  const useButton = buttonsByLabel(renderer.root, "Use This Design")[0]!;
  await act(async () => {
    useButton.props.onClick({ currentTarget: { focus() {} } });
  });
  assert.deepEqual(selected, []);
  const dialog = renderer.root.findByProps({
    "data-testid": "adapt-design-confirmation",
  });
  assert.equal(dialog.props.role, "dialog");
  assert.equal(dialog.props["aria-modal"], "true");
  const dialogText = textContent(dialog);
  assert.match(dialogText, /Adapt this design to your garments\?/);
  assert.match(dialogText, /Long Shirt \(Kaftan\)/);
  assert.match(dialogText, /Standard Shirt and Trouser/);
  assert.match(dialogText, /Your garments and Fabric selections will not change/);

  await act(async () => {
    buttonsByLabel(dialog, "Cancel")[0]!.props.onClick();
  });
  assert.deepEqual(selected, []);
  assert.equal(
    renderer.root.findAllByProps({
      "data-testid": "adapt-design-confirmation",
    }).length,
    0,
  );

  await act(async () => {
    buttonsByLabel(renderer.root, "Use This Design")[0]!.props.onClick({
      currentTarget: { focus() {} },
    });
  });
  const confirm = renderer.root.findByProps({ "data-adapt-confirm": "true" });
  await act(async () => {
    confirm.props.onClick();
  });
  assert.deepEqual(selected, [styleB.id]);
}

// Exact match selects immediately, no dialog
{
  const selected: string[] = [];
  const { renderer } = await renderStep({
    styles: [styleA, styleB],
    onSelectStyle: (styleId) => selected.push(styleId),
  });
  const selectButtons = buttonsByLabel(renderer.root, "Select Design").filter(
    (button) => !button.props.disabled,
  );
  assert.equal(selectButtons.length, 1);
  await act(async () => {
    selectButtons[0]!.props.onClick();
  });
  assert.deepEqual(selected, [styleA.id]);
  assert.equal(
    renderer.root.findAllByProps({
      "data-testid": "adapt-design-confirmation",
    }).length,
    0,
  );
}

// Blocked garment + demographic
{
  const selected: string[] = [];
  const { renderer } = await renderStep({
    styles: fullCatalogue,
    onSelectStyle: (styleId) => selected.push(styleId),
  });
  const blockedGarment = cardById(renderer.root, styleC.id);
  assert.equal(blockedGarment.props["data-style-tier"], "blocked");
  assert.match(textContent(blockedGarment), /NOT AVAILABLE FOR THIS ORDER/);
  assert.match(
    textContent(blockedGarment),
    /This design is not available for one or more garments in your order/,
  );
  const blockedDemo = cardById(renderer.root, styleD.id);
  assert.match(textContent(blockedDemo), /NOT AVAILABLE FOR THIS ORDER/);
  assert.match(
    textContent(blockedDemo),
    /This design does not match who the order is for/,
  );
  const blockedButtons = [blockedGarment, blockedDemo].flatMap((card) =>
    card.findAllByType("button"),
  );
  assert.ok(blockedButtons.every((button) => button.props.disabled));
  for (const button of blockedButtons) {
    await act(async () => {
      button.props.onClick?.({ currentTarget: { focus() {} } });
    });
  }
  assert.deepEqual(selected, []);
}

// Indeterminate fail-closed
{
  const selected: string[] = [];
  const { renderer } = await renderStep({
    styles: [styleE],
    onSelectStyle: (styleId) => selected.push(styleId),
  });
  const reviewCard = cardById(renderer.root, styleE.id);
  assert.equal(reviewCard.props["data-style-tier"], "indeterminate");
  assert.match(textContent(reviewCard), /CATALOGUE REVIEW/);
  assert.match(
    textContent(reviewCard),
    /This design needs catalogue review before it can be selected/,
  );
  const reviewButton = reviewCard.findByType("button");
  assert.equal(reviewButton.props.disabled, true);
  await act(async () => {
    reviewButton.props.onClick?.({ currentTarget: { focus() {} } });
  });
  assert.deepEqual(selected, []);
}

// Filters are presentation only
{
  const selected: string[] = [];
  const frozenGarments = structuredClone(shirtTrouserMale);
  const { renderer } = await renderStep({
    styles: fullCatalogue,
    garmentTypeSelection: frozenGarments,
    onSelectStyle: (styleId) => selected.push(styleId),
  });
  const moreDesignsFilter = renderer.root.findByProps({
    "data-catalogue-filter": "more_designs",
  });
  assert.equal(moreDesignsFilter.props["aria-pressed"], true);
  assert.match(textContent(moreDesignsFilter), /More Designs/i);
  const exploreBefore = cardsInSection(renderer.root, "step3-explore-all").map(
    (card) => card.props["data-style-card"],
  );
  assert.equal(exploreBefore.includes(styleA.id), false);
  assert.equal(exploreBefore.includes(styleB.id), true);

  await act(async () => {
    renderer.root
      .findByProps({ "data-catalogue-filter": "exact_match" })
      .props.onClick();
  });
  assert.equal(
    renderer.root.findByProps({ "data-catalogue-filter": "exact_match" }).props[
      "aria-pressed"
    ],
    true,
  );
  const exactFiltered = cardsInSection(renderer.root, "step3-explore-all").map(
    (card) => card.props["data-style-card"],
  );
  assert.deepEqual(exactFiltered, [styleA.id]);
  assert.equal(
    cardById(renderer.root, styleA.id).props["data-style-tier"],
    "exact_match",
  );

  await act(async () => {
    renderer.root
      .findByProps({ "data-catalogue-filter": "more_designs" })
      .props.onClick();
  });
  assert.equal(
    cardById(renderer.root, styleC.id).props["data-style-tier"],
    "blocked",
  );

  await act(async () => {
    renderer.root
      .findByProps({ "data-catalogue-filter": "adaptable" })
      .props.onClick();
  });
  const adaptableFiltered = cardsInSection(
    renderer.root,
    "step3-explore-all",
  ).map((card) => card.props["data-style-card"]);
  assert.deepEqual(adaptableFiltered, [styleB.id]);
  assert.deepEqual(selected, []);
  assert.deepEqual(frozenGarments, shirtTrouserMale);
}

// Zero selectable still shows catalogue + upload
{
  const { renderer } = await renderStep({
    styles: [styleC, styleD, styleE],
  });
  assert.match(
    textContent(renderer.root),
    /No designs can currently be selected for this order/,
  );
  assert.equal(
    textContent(renderer.root).includes("No matching design styles are available yet"),
    false,
  );
  const ids = new Set(
    findCards(renderer.root).map((card) => card.props["data-style-card"]),
  );
  assert.deepEqual([...ids].sort(), [styleC.id, styleD.id, styleE.id].sort());
  renderer.root.findByProps({ "data-testid": "upload-your-design-panel" });
}

// Selected exact retains Best Match + Selected
{
  const { renderer } = await renderStep({
    styles: [styleA],
    selectedStyleId: styleA.id,
  });
  const selectedCard = cardById(renderer.root, styleA.id);
  assert.equal(selectedCard.props["data-style-selected"], "true");
  assert.match(textContent(selectedCard), /SELECTED/i);
  assert.match(textContent(selectedCard), /BEST MATCH/);
  const selectedButton = selectedCard.findByType("button");
  assert.equal(selectedButton.props["aria-pressed"], true);
}

// Step 1 reconciliation surfaces reselection
{
  const { renderer } = await renderStep({
    styles: [styleB],
    garmentTypeSelection: shirtTrouserMale,
    selectedStyleId: styleB.id,
  });
  assert.equal(
    textContent(renderer.root).includes("Select another design"),
    false,
  );
  await act(async () => {
    renderer.update(
      <DormantFutureDesignStyleStep
        styles={[styleB]}
        garmentTypeSelection={dressFemale}
        selectedStyleId={styleB.id}
        stagePrice={null}
        uploadedDesign={emptyUploaded}
        pendingCatalogStyleName={null}
        stylesLoadState="ready"
        onSelectStyle={() => undefined}
        onUploadDesignFile={() => undefined}
        onToggleUploadedGarment={() => undefined}
        onUploadedDemographicChange={() => undefined}
        onRemoveUploadedDesign={() => undefined}
        onRetryUploadedDesignDeletion={() => undefined}
        onContinueUploadedDesign={() => undefined}
        onBack={() => undefined}
        onReturnToGarmentType={() => undefined}
        onContinue={() => undefined}
      />,
    );
  });
  assert.match(textContent(renderer.root), /Select another design/);
  assert.equal(
    cardById(renderer.root, styleB.id).props["data-style-tier"],
    "blocked",
  );
}

// Upload panel independent of catalogue filters
{
  const { renderer } = await renderStep({ styles: fullCatalogue });
  await act(async () => {
    renderer.root
      .findByProps({ "data-catalogue-filter": "adaptable" })
      .props.onClick();
  });
  const upload = renderer.root.findByProps({
    "data-testid": "upload-your-design-panel",
  });
  assert.match(textContent(upload), /Upload Your Own Design/);
  assert.equal(
    renderer.root.findByProps({ "data-catalogue-filter": "adaptable" }).props[
      "aria-pressed"
    ],
    true,
  );
}

const componentSource = readFileSync(
  "src/components/DormantFutureDesignStyleStep.tsx",
  "utf8",
);
assert.equal(
  componentSource.includes("ODOGWU_STEP3_DISCOVERY_QA_STYLES"),
  false,
  "Production Step 3 must not read catalogue styles from sessionStorage",
);
assert.equal(componentSource.includes("sessionStorage"), false);
assert.equal(componentSource.includes("localStorage"), false);
assert.match(componentSource, /More Designs/);
assert.match(componentSource, /more_designs/);
assert.match(componentSource, /useState<CatalogueBrowseFilter>\("more_designs"\)/);

console.log("PASS: Step 3 full-catalogue discovery UX");
