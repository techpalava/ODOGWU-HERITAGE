import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import {
  prepareAuthoritativeDesignStyleRecord,
  projectPublishedDesignStyleRecord,
} from "./src/utils/designStyleAuthority";
import {
  buildGalleryStyleSearch,
  pushGalleryStyleEntry,
  readGalleryStyleId,
  replaceGalleryStyleId,
  requestReturnToExploreDesignStyles,
  resolveGalleryAdvertisedGarments,
  resolveGalleryStyleIntent,
  type GalleryStyleHistory,
  type GalleryStyleOccurrenceSnapshot,
} from "./src/utils/galleryStyleIntent";

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: "male" | "female" | "unisex" = "female",
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic,
  constructionByGarment: {},
});

const publish = (
  style: StyleCategory,
  reference: readonly ("bum_shorts" | "trouser" | "shirt" | "dress" | "kaftan")[],
) => {
  const record = prepareAuthoritativeDesignStyleRecord({
    style,
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: [...reference] },
    currentRecord: null,
  });
  const projected = projectPublishedDesignStyleRecord(record);
  assert.ok(projected);
  return projected;
};

const bumShort = publish(
  {
    id: "casual-bum-short-1",
    name: "Bow-Tie Bum Short",
    description: "A fitted high-waist Ankara bum short.",
    gender: "female",
    options: [],
    outfitType: "Senator Set",
    garmentComposition: "Shorts Only",
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("bum_shorts"),
      createStyleBaseGarmentSpec("trouser"),
    ],
    customDetailConfig: {
      representedGenders: ["female"],
      featuresMaleAndFemale: false,
      supportedGarmentGroups: ["bum_shorts", "trousers"],
      requiredSelectionGroups: ["bum_shorts_fastening"],
      enabled: true,
    },
  },
  ["bum_shorts"],
);

const coupleStyle = publish(
  {
    id: "couple-set-1",
    name: "Couple Agbada",
    description: "Matching couple set.",
    gender: "couple",
    options: [],
    fabricCapacityComposition: [createStyleBaseGarmentSpec("kaftan")],
    customDetailConfig: {
      representedGenders: ["male", "female"],
      featuresMaleAndFemale: true,
      supportedGarmentGroups: ["shirt"],
      requiredSelectionGroups: [],
      enabled: true,
    },
  },
  ["kaftan"],
);

const occurrence = (
  garmentType: GalleryStyleOccurrenceSnapshot["garmentType"],
  assignmentKind: GalleryStyleOccurrenceSnapshot["assignmentKind"] = "none",
  assignmentStyleId: string | null = null,
): GalleryStyleOccurrenceSnapshot => ({
  occurrenceToken: `token-${garmentType}`,
  garmentKey: garmentType,
  garmentType,
  label: garmentType,
  assignmentKind,
  assignmentStyleId,
});

assert.deepEqual(resolveGalleryAdvertisedGarments(bumShort), {
  status: "known",
  garmentTypes: ["bum_shorts"],
});

assert.equal(readGalleryStyleId(""), null);
assert.equal(readGalleryStyleId("?style=casual-bum-short-1"), "casual-bum-short-1");
assert.equal(readGalleryStyleId("?style=%20"), null);
assert.equal(
  buildGalleryStyleSearch("?future_order_v2_order_id=abc", "casual-bum-short-1"),
  "?future_order_v2_order_id=abc&style=casual-bum-short-1",
);
assert.equal(
  buildGalleryStyleSearch("?style=casual-bum-short-1&x=1", null),
  "?x=1",
);

const historyLog: string[] = [];
const history: GalleryStyleHistory = {
  state: null,
  pushState(data, _unused, url) {
    history.state = data;
    historyLog.push(`push ${String(url)}`);
  },
  replaceState(data, _unused, url) {
    history.state = data;
    historyLog.push(`replace ${String(url)}`);
  },
  back() {
    historyLog.push("back");
  },
};
pushGalleryStyleEntry("casual-bum-short-1", history, {
  pathname: "/",
  search: "",
  hash: "",
});
assert.deepEqual(historyLog, ["push /?style=casual-bum-short-1"]);
assert.equal(requestReturnToExploreDesignStyles(history, {
  pathname: "/",
  search: "?style=casual-bum-short-1",
  hash: "",
}), "home");
assert.equal(historyLog.at(-1), "push /#explore-design-styles");
replaceGalleryStyleId(null, history, {
  pathname: "/",
  search: "?style=casual-bum-short-1",
  hash: "",
});
assert.equal(historyLog.at(-1), "replace /");

const base = {
  styleId: "casual-bum-short-1",
  styles: [bumShort],
  hydrationSettled: true,
  replaceConfirmed: false,
} as const;

assert.equal(
  resolveGalleryStyleIntent({
    ...base,
    stylesLoadState: "loading",
    styles: [],
    garmentTypeSelection: selection([]),
    occurrences: [],
  }).kind,
  "pending_catalogue",
);
assert.equal(
  resolveGalleryStyleIntent({
    ...base,
    stylesLoadState: "ready",
    styles: [bumShort],
    garmentTypeSelection: selection(["bum_shorts"]),
    occurrences: [occurrence("bum_shorts")],
  }).kind,
  "ready_to_assign",
);

const exact = resolveGalleryStyleIntent({
  ...base,
  stylesLoadState: "ready",
  garmentTypeSelection: selection(["bum_shorts", "trouser"]),
  occurrences: [occurrence("bum_shorts"), occurrence("trouser")],
});
assert.equal(exact.kind, "ready_to_assign");
if (exact.kind === "ready_to_assign") {
  assert.deepEqual(
    exact.targets.map((target) => target.garmentKey),
    ["bum_shorts"],
  );
}

const male = resolveGalleryStyleIntent({
  ...base,
  stylesLoadState: "ready",
  garmentTypeSelection: selection(["shirt"], "male"),
  occurrences: [occurrence("shirt")],
});
assert.equal(male.kind, "conflict");

const maleOnBumShort = resolveGalleryStyleIntent({
  ...base,
  stylesLoadState: "ready",
  garmentTypeSelection: selection(["bum_shorts"], "male"),
  occurrences: [occurrence("bum_shorts")],
});
assert.equal(maleOnBumShort.kind, "conflict");
if (maleOnBumShort.kind === "conflict") {
  assert.match(maleOnBumShort.customerReason, /who the order is for/i);
}

assert.equal(
  resolveGalleryStyleIntent({
    ...base,
    styleId: "missing-style",
    stylesLoadState: "ready",
    garmentTypeSelection: selection(["bum_shorts"]),
    occurrences: [occurrence("bum_shorts")],
  }).kind,
  "unknown",
);

const draft = resolveGalleryStyleIntent({
  ...base,
  stylesLoadState: "ready",
  garmentTypeSelection: selection(["bum_shorts"]),
  occurrences: [occurrence("bum_shorts", "catalog", "other-style")],
});
assert.equal(draft.kind, "needs_confirmation");
const replaced = resolveGalleryStyleIntent({
  ...base,
  stylesLoadState: "ready",
  replaceConfirmed: true,
  garmentTypeSelection: selection(["bum_shorts"]),
  occurrences: [occurrence("bum_shorts", "catalog", "other-style")],
});
assert.equal(replaced.kind, "ready_to_assign");

const coupleMale = resolveGalleryStyleIntent({
  styleId: coupleStyle.id,
  styles: [coupleStyle],
  stylesLoadState: "ready",
  hydrationSettled: true,
  replaceConfirmed: false,
  garmentTypeSelection: selection(["kaftan"], "male"),
  occurrences: [occurrence("kaftan")],
});
assert.equal(coupleMale.kind, "conflict");
const coupleFamily = resolveGalleryStyleIntent({
  styleId: coupleStyle.id,
  styles: [coupleStyle],
  stylesLoadState: "ready",
  hydrationSettled: true,
  replaceConfirmed: false,
  garmentTypeSelection: selection(["kaftan"], "unisex"),
  occurrences: [occurrence("kaftan")],
});
assert.equal(coupleFamily.kind, "ready_to_assign");

console.log("PASS: gallery style intent");
