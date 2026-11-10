import assert from "node:assert/strict";
import { act, create } from "react-test-renderer";
import { GalleryStyleIntentBanner } from "./src/components/GalleryStyleIntentBanner";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const clicks = { use: 0, keep: 0 };

let prompt!: ReturnType<typeof create>;
act(() => {
  prompt = create(
    <GalleryStyleIntentBanner
      intent={{
        kind: "needs_confirmation",
        styleId: "casual-bum-short-1",
        styleName: "Bow-Tie Bum Short",
      }}
      style={null}
      onBackToStyles={() => {}}
      onClear={() => {}}
      onUseSavedStyle={() => {
        clicks.use += 1;
      }}
      onKeepSavedDesigns={() => {
        clicks.keep += 1;
      }}
    />,
  );
});

const tree = prompt.toJSON() as { props: Record<string, string> };
assert.equal(tree.props["data-gallery-style-intent"], "needs_confirmation");
const labels = prompt.root.findAllByType("button").map((button) =>
  button.children.join(""),
);
assert.deepEqual(labels, ["Use this style", "Keep my designs"]);
act(() => {
  prompt.root.findAllByType("button")[0]!.props.onClick();
  prompt.root.findAllByType("button")[1]!.props.onClick();
});
assert.equal(clicks.use, 1);
assert.equal(clicks.keep, 1);

let unknown!: ReturnType<typeof create>;
act(() => {
  unknown = create(
    <GalleryStyleIntentBanner
      intent={{ kind: "unknown", styleId: "missing-style" }}
      style={null}
      onBackToStyles={() => {}}
      onClear={() => {}}
      onUseSavedStyle={() => {}}
      onKeepSavedDesigns={() => {}}
    />,
  );
});
const text = JSON.stringify(unknown.toJSON());
assert.match(text, /no longer in the catalogue/i);
assert.equal(
  unknown.root.findAllByType("button").map((button) => button.children.join("")).join(" "),
  "Back to styles",
);

console.log("PASS: gallery style banner");
