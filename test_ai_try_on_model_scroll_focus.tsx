import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { AiTryOnPhotoPanel } from "./src/components/AiTryOnPhotoPanel";
import { createAiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";

type WearerTarget = Parameters<typeof AiTryOnPhotoPanel>[0]["targets"][number];

const target = (): WearerTarget => ({
  wearerId: "w-ada",
  label: "Ada",
  inputFingerprint: "fp-ada-shirt",
  mode: "garment",
  garmentImageUrl: "https://example.test/style-a.jpg",
  fabricSwatchImageUrl: null,
  fitHints: [{ id: "total_height", valueCm: 170 }] as never,
  orderDetails: null,
});

const byData = (renderer: ReturnType<typeof create>, attribute: string) =>
  renderer.root.findAll((node) => typeof node.type === "string" && node.props[attribute] !== undefined);

const click = async (node: ReactTestInstance) => {
  await act(async () => {
    await node.props.onClick();
  });
};

const choosePhoto = async (renderer: ReturnType<typeof create>) => {
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  const file = Object.assign(new Blob([new Uint8Array(20)], { type: "image/jpeg" }), { name: "me.jpg" });
  await act(async () => {
    await input.props.onChange({ target: { files: [file] } });
  });
};

(async () => {
  const scrollCalls: Array<{ behavior?: string; block?: string }> = [];
  const focusCalls: Array<{ preventScroll?: boolean } | undefined> = [];
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(AiTryOnPhotoPanel, {
        targets: [target()],
        triesPerOrder: 5,
        initialTriesRemaining: 5,
        onPreviewCreated: () => undefined,
        onUnavailable: () => undefined,
        requestPreview: async () => ({ kind: "unavailable" } as never),
        preparePhoto: async () => ({ mimeType: "image/jpeg" as const, data: "/9j/4AAQ" }),
        createThumbnailUrl: () => null,
        revokeThumbnailUrl: () => undefined,
        jobStore: createAiTryOnBackgroundJobs({ storage: null }),
      }),
      {
        createNodeMock: (element) => {
          if (element.type === "fieldset" && element.props["data-ai-try-on-model-picker"]) {
            return {
              scrollIntoView: (opts: { behavior?: string; block?: string }) => scrollCalls.push(opts),
              focus: (opts?: { preventScroll?: boolean }) => focusCalls.push(opts),
            };
          }
          return {};
        },
      },
    );
  });

  const picker = byData(renderer, "data-ai-try-on-model-picker")[0];
  assert.equal(picker.props.tabIndex, -1);
  assert.match(String(picker.props.className), /\bscroll-mt-28\b/);
  assert.match(String(picker.props.className), /\bsm:scroll-mt-24\b/);
  assert.match(String(picker.props.className), /\boutline-none\b/);

  // Case 1: picker already open -> clicking "Choose a model" jumps scroll & focus to the picker.
  await click(byData(renderer, "data-ai-try-on-model-option")[0]);
  assert.equal(scrollCalls.length, 1);
  assert.equal(scrollCalls[0].block, "start");
  assert.deepEqual(focusCalls[0], { preventScroll: true });

  // Case 2: picker closed (uploaded photo) -> clicking "Choose a model" mounts, scrolls & focuses.
  await choosePhoto(renderer);
  assert.equal(byData(renderer, "data-ai-try-on-model-picker").length, 0);
  await click(byData(renderer, "data-ai-try-on-model-option")[0]);
  assert.equal(byData(renderer, "data-ai-try-on-model-picker").length, 1);
  assert.equal(scrollCalls.length, 2);
  assert.equal(scrollCalls[1].block, "start");
  assert.deepEqual(focusCalls[1], { preventScroll: true });

  await act(async () => {
    renderer.unmount();
  });
  console.log("AI Try-on choose-a-model scroll/focus: all checks passed");
})();
