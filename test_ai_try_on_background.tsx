/**
 * AI Try-on Phase B: background generation, toasts, reload resume.
 * All mocked: no Gemini, Firebase or network calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  AI_TRY_ON_PENDING_STORAGE_KEY,
  AI_TRY_ON_RESUME_WINDOW_MS,
  createAiTryOnBackgroundJobs,
  type AiTryOnBackgroundJob,
} from "./src/services/aiTryOnBackgroundJobs";
import type { AiTryOnPreviewOutcome } from "./src/services/aiTryOnGateway";
import { AiTryOnPhotoPanel, type AiTryOnPhotoPanelProps } from "./src/components/AiTryOnPhotoPanel";
import {
  AiTryOnBackLink,
  AiTryOnBackgroundToasts,
  AiTryOnGeneratingChip,
  aiTryOnToastKind,
} from "./src/components/AiTryOnBackgroundToasts";
import { AI_TRY_ON_BACKGROUND_COPY, aiTryOnPossessive } from "./src/utils/aiTryOnBackgroundCopy";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const memoryStorage = () => {
  const backing = new Map<string, string>();
  return {
    backing,
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
  };
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = () => new Promise((done) => setTimeout(done, 0));
const completed = (remaining = 4): AiTryOnPreviewOutcome => ({
  kind: "completed",
  resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-1", ownerBindingId: "session-x" },
  preview: { mimeType: "image/png", data: "iVBORw0KGgo=" },
  orderTriesRemaining: remaining,
  storedPreviewId: "tryon-11111111-1111-4111-8111-111111111111",
});

// ------------------------------------------------------------ wording (pending approval)
{
  assert.equal(aiTryOnPossessive(null), "your");
  assert.equal(aiTryOnPossessive("You"), "your");
  assert.equal(aiTryOnPossessive("Ada"), "Ada's");
  assert.equal(
    AI_TRY_ON_BACKGROUND_COPY.panelGenerating(null),
    "Creating your preview. This can take up to a minute. You can carry on with the next steps; we'll let you know when it's ready.",
  );
  assert.equal(AI_TRY_ON_BACKGROUND_COPY.continueWhileGenerating, "Continue while we make your preview");
  assert.equal(AI_TRY_ON_BACKGROUND_COPY.chipOne("Ada"), "Making Ada's preview…");
  assert.equal(AI_TRY_ON_BACKGROUND_COPY.chipMany(2), "Making 2 previews…");
  assert.equal(AI_TRY_ON_BACKGROUND_COPY.readyTitle(null), "Your preview is ready");
  assert.equal(AI_TRY_ON_BACKGROUND_COPY.readyTitle("Obi"), "Obi's preview is ready");
  assert.equal(AI_TRY_ON_BACKGROUND_COPY.failedTitle(null), "We couldn't create your preview");
  assert.equal(AI_TRY_ON_BACKGROUND_COPY.failedBody, "This try wasn't counted.");
  assert.equal(AI_TRY_ON_BACKGROUND_COPY.backTo("Measurement"), "Back to Measurement");
}

// ------------------------------------------------------------ store: one request per wearer
{
  const storage = memoryStorage();
  let clock = 1_000_000;
  const jobs = createAiTryOnBackgroundJobs({ storage, now: () => clock });
  const ada = deferred<AiTryOnPreviewOutcome>();
  let runs = 0;
  const startAda = () =>
    jobs.start({
      wearerId: "w-ada",
      wearerName: "Ada",
      inputFingerprint: "fp-ada",
      scope: "guest",
      run: () => { runs += 1; return ada.promise; },
    });
  assert.equal(startAda(), true);
  assert.equal(startAda(), false, "a second Generate for the same wearer sends nothing");
  assert.equal(runs, 1);
  assert.equal(jobs.isRunning("w-ada"), true);
  // Another wearer may start meanwhile.
  const obi = deferred<AiTryOnPreviewOutcome>();
  assert.equal(
    jobs.start({ wearerId: "w-obi", wearerName: "Obi", inputFingerprint: "fp-obi", scope: "guest", run: () => obi.promise }),
    true,
  );
  // Reload marker: ids, fingerprint and time only.
  const markers = JSON.parse(storage.backing.get(AI_TRY_ON_PENDING_STORAGE_KEY) || "[]");
  assert.equal(markers.length, 2);
  assert.deepEqual(Object.keys(markers[0]).sort(), ["inputFingerprint", "scope", "startedAt", "wearerId"]);
  assert.equal(JSON.stringify(markers).includes("Ada"), false, "no names in browser storage");

  // Ada ends while her panel is on screen: inline, no toast.
  jobs.setVisibleWearer("w-ada");
  clock += 30_000;
  ada.resolve(completed());
  await flush();
  const adaJob = jobs.getSnapshot()["w-ada"] as AiTryOnBackgroundJob;
  assert.equal(adaJob.status, "completed");
  assert.equal(adaJob.seenInline, true);
  assert.equal(adaJob.toast, "none");
  assert.equal(adaJob.storedPreviewId, "tryon-11111111-1111-4111-8111-111111111111");
  // Obi ends while the customer is on another step: toast.
  jobs.setVisibleWearer(null);
  obi.resolve({ kind: "failed", orderTriesRemaining: 4 });
  await flush();
  const obiJob = jobs.getSnapshot()["w-obi"] as AiTryOnBackgroundJob;
  assert.equal(obiJob.status, "failed");
  assert.equal(obiJob.toast, "open");
  assert.equal(storage.backing.has(AI_TRY_ON_PENDING_STORAGE_KEY), false, "markers removed when settled");
  jobs.closeToast("w-obi");
  assert.equal(jobs.getSnapshot()["w-obi"].toast, "closed");
  // A thrown request is a failure, never a hang.
  jobs.start({ wearerId: "w-chi", wearerName: null, inputFingerprint: "fp", scope: "guest", run: async () => { throw new Error("network"); } });
  await flush();
  assert.equal(jobs.getSnapshot()["w-chi"].status, "failed");
  // Discard (order placed or cleared): a late result never shows up.
  const late = deferred<AiTryOnPreviewOutcome>();
  jobs.start({ wearerId: "w-late", wearerName: null, inputFingerprint: "fp", scope: "guest", run: () => late.promise });
  jobs.discardAll();
  late.resolve(completed());
  await flush();
  assert.deepEqual(jobs.getSnapshot(), {});
  assert.equal(storage.backing.has(AI_TRY_ON_PENDING_STORAGE_KEY), false);
}

// ------------------------------------------------------------ store: leaving the page keeps the marker
{
  const storage = memoryStorage();
  let leave!: (leaving: boolean) => void;
  const jobs = createAiTryOnBackgroundJobs({ storage, onPageLeave: (listener) => { leave = listener; } });
  const request = deferred<AiTryOnPreviewOutcome>();
  jobs.start({ wearerId: "w-ada", wearerName: null, inputFingerprint: "fp", scope: "guest", run: () => request.promise });
  // A reload aborts the request in the old page; that is not a real failure.
  leave(true);
  request.resolve({ kind: "failed", orderTriesRemaining: null });
  await flush();
  assert.equal(jobs.getSnapshot()["w-ada"].status, "running");
  assert.equal(storage.backing.has(AI_TRY_ON_PENDING_STORAGE_KEY), true, "marker kept for the next page");
}

// ------------------------------------------------------------ store: reload resume (never a second request)
{
  const storage = memoryStorage();
  let clock = 5_000_000;
  const timers: Array<() => void> = [];
  const startedAt = clock - 20_000;
  storage.setItem(
    AI_TRY_ON_PENDING_STORAGE_KEY,
    JSON.stringify([
      { wearerId: "w-ada", inputFingerprint: "fp-ada", scope: "guest", startedAt },
      { wearerId: "w-old", inputFingerprint: "fp-old", scope: "other-order", startedAt },
    ]),
  );
  const jobs = createAiTryOnBackgroundJobs({ storage, now: () => clock, setTimer: (fn) => timers.push(fn) });
  const DAY = 24 * 60 * 60 * 1000;
  let summaries: Array<{ previewId: string; wearerKey: string; inputFingerprint: string; expiresAt: string }> = [
    // An older preview of the same design (made before this request): ignored.
    { previewId: "tryon-old", wearerKey: "w-ada", inputFingerprint: "fp-ada", expiresAt: new Date(startedAt - 5 * 60_000 + 30 * DAY).toISOString() },
  ];
  let lists = 0;
  const loads: string[] = [];
  jobs.resume({
    scope: "guest",
    listStoredPreviews: async () => { lists += 1; return summaries; },
    loadStoredPreview: async (previewId) => { loads.push(previewId); return { mimeType: "image/webp", data: "UklGRg==" }; },
  });
  assert.equal(jobs.getSnapshot()["w-ada"].status, "running", "chip shows after reload");
  assert.equal(jobs.getSnapshot()["w-ada"].resumed, true);
  assert.equal(jobs.getSnapshot()["w-old"], undefined, "other orders' markers are not resumed");
  await flush();
  assert.equal(lists, 1);
  assert.deepEqual(loads, [], "older preview not taken for this request");
  assert.equal(timers.length, 1, "polls again");
  summaries = [...summaries, { previewId: "tryon-new", wearerKey: "w-ada", inputFingerprint: "fp-ada", expiresAt: new Date(clock + 5_000 + 30 * DAY).toISOString() }];
  clock += 8_000;
  timers.shift()!();
  await flush();
  await flush();
  const job = jobs.getSnapshot()["w-ada"];
  assert.equal(job.status, "completed");
  assert.deepEqual(loads, ["tryon-new"]);
  assert.equal(job.toast, "open");
  assert.equal(aiTryOnToastKind(job, "fp-ada"), "ready");
  assert.equal(aiTryOnToastKind(job, "fp-changed"), "stale");
  // Resuming again (a second effect run) does nothing new.
  jobs.resume({ scope: "guest", listStoredPreviews: async () => { lists += 1; return []; }, loadStoredPreview: async () => null });
  await flush();
  assert.equal(lists, 2);

  // Nothing turns up before the request must have ended: a "reloaded" failure.
  const storage2 = memoryStorage();
  let clock2 = 9_000_000;
  const timers2: Array<() => void> = [];
  storage2.setItem(AI_TRY_ON_PENDING_STORAGE_KEY, JSON.stringify([{ wearerId: "w-ada", inputFingerprint: "fp", scope: "guest", startedAt: clock2 }]));
  const jobs2 = createAiTryOnBackgroundJobs({ storage: storage2, now: () => clock2, setTimer: (fn) => timers2.push(fn) });
  jobs2.resume({ scope: "guest", listStoredPreviews: async () => [], loadStoredPreview: async () => null });
  await flush();
  clock2 += AI_TRY_ON_RESUME_WINDOW_MS;
  timers2.shift()!();
  await flush();
  const failedJob = jobs2.getSnapshot()["w-ada"];
  assert.equal(failedJob.status, "failed");
  assert.equal(aiTryOnToastKind(failedJob, "fp"), "resume_failed");
  assert.equal(storage2.backing.has(AI_TRY_ON_PENDING_STORAGE_KEY), false);
}

// ------------------------------------------------------------ panel: the request outlives the step
const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
const target = (overrides: Partial<AiTryOnWearerTarget> = {}): AiTryOnWearerTarget => ({
  wearerId: "w-ada",
  label: "Ada",
  inputFingerprint: "tryon-v1-0123456789abcdef",
  mode: "garment",
  garmentImageUrl: "https://example.test/style-a.jpg",
  fabricSwatchImageUrl: null,
  fitHints: [],
  orderDetails: null,
  ...overrides,
});
const panelProps = (props: Partial<AiTryOnPhotoPanelProps>): AiTryOnPhotoPanelProps => ({
  targets: [target()],
  triesPerOrder: 5,
  initialTriesRemaining: 5,
  onPreviewCreated: () => undefined,
  onUnavailable: () => undefined,
  preparePhoto: async () => ({ mimeType: "image/jpeg", data: "/9j/4AAQ" }),
  createThumbnailUrl: () => null,
  revokeThumbnailUrl: () => undefined,
  ...props,
});
const choosePhoto = async (renderer: ReturnType<typeof create>) => {
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  const file = Object.assign(new Blob([new Uint8Array(20)], { type: "image/jpeg" }), { name: "me.jpg" });
  await act(async () => {
    await input.props.onChange({ target: { files: [file] } });
  });
};
const generateButton = (renderer: ReturnType<typeof create>) =>
  renderer.root.find((node) => node.type === "button" && /Generate preview|Make a new preview/.test(textOf(node)));

{
  const jobStore = createAiTryOnBackgroundJobs({ storage: null });
  const pending = deferred<AiTryOnPreviewOutcome>();
  const created: Array<{ wearerId: string; inputFingerprint: string }> = [];
  let requests = 0;
  const props = panelProps({
    jobStore,
    onPreviewCreated: ({ wearerId, inputFingerprint }) => created.push({ wearerId, inputFingerprint }),
    requestPreview: () => { requests += 1; return pending.promise; },
  });
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(createElement(AiTryOnPhotoPanel, props)); });
  await choosePhoto(renderer);
  await act(async () => { generateButton(renderer).props.onClick(); });
  assert.equal(requests, 1);
  assert.match(textOf(renderer.root), /You can carry on with the next steps/);
  assert.equal(generateButton(renderer).props.disabled, true, "Generate off while this wearer's request runs");
  // The customer moves to Measurement: the panel goes away, the request doesn't.
  act(() => renderer.unmount());
  await act(async () => { pending.resolve(completed(3)); await flush(); });
  assert.deepEqual(created, [{ wearerId: "w-ada", inputFingerprint: "tryon-v1-0123456789abcdef" }], "recorded off-screen");
  const job = jobStore.getSnapshot()["w-ada"];
  assert.equal(job.toast, "open", "toast, since the panel was not on screen");
  assert.equal(requests, 1, "never sent twice");
  // "View preview": back on AI Try-on, the preview is shown and highlighted.
  act(() => jobStore.requestFocus("w-ada"));
  let again!: ReturnType<typeof create>;
  act(() => { again = create(createElement(AiTryOnPhotoPanel, props), { createNodeMock: () => ({ scrollIntoView: () => undefined }) }); });
  const image = again.root.find((node) => node.type === "img" && /AI try-on preview for Ada/.test(node.props.alt || ""));
  assert.equal(image.props.src, "data:image/png;base64,iVBORw0KGgo=");
  await act(async () => { await new Promise((done) => setTimeout(done, 200)); });
  const figure = again.root.find((node) => node.type === "figure");
  assert.equal(figure.props["data-ai-try-on-highlight"], "true", "briefly highlighted");
  assert.equal(jobStore.getSnapshot()["w-ada"].focusRequested, false);
  assert.equal(jobStore.getSnapshot()["w-ada"].toast, "closed");
  act(() => again.unmount());
}

{
  // Two wearers: Ada's request runs, Obi can be chosen and generated meanwhile.
  const jobStore = createAiTryOnBackgroundJobs({ storage: null });
  const sent: string[] = [];
  const pendings = new Map<string, ReturnType<typeof deferred<AiTryOnPreviewOutcome>>>();
  const props = panelProps({
    jobStore,
    targets: [target(), target({ wearerId: "w-obi", label: "Obi", inputFingerprint: "tryon-v1-fedcba9876543210" })],
    requestPreview: (request) => {
      sent.push(request.wearerKey);
      const next = deferred<AiTryOnPreviewOutcome>();
      pendings.set(request.wearerKey, next);
      return next.promise;
    },
  });
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(createElement(AiTryOnPhotoPanel, props)); });
  await choosePhoto(renderer);
  await act(async () => { generateButton(renderer).props.onClick(); });
  assert.match(textOf(renderer.root), /Creating Ada's preview/);
  const chips = () => renderer.root.findAll((node) => node.type === "button" && node.props.role === "radio");
  assert.equal(chips()[1].props.disabled, undefined, "other wearers stay selectable");
  act(() => chips()[1].props.onClick());
  await choosePhoto(renderer);
  assert.equal(generateButton(renderer).props.disabled, false, "Obi can generate while Ada's runs");
  await act(async () => { generateButton(renderer).props.onClick(); });
  assert.deepEqual(sent, ["w-ada", "w-obi"]);
  // Ada's ends while Obi is on screen: toast for Ada, no inline message for Obi.
  await act(async () => { pendings.get("w-ada")!.resolve({ kind: "failed", orderTriesRemaining: 3 }); await flush(); });
  assert.equal(jobStore.getSnapshot()["w-ada"].toast, "open");
  assert.equal(renderer.root.findAll((node) => node.props["data-ai-try-on-message"]).length, 0);
  await act(async () => { pendings.get("w-obi")!.resolve(completed(2)); await flush(); });
  assert.equal(jobStore.getSnapshot()["w-obi"].toast, "none", "Obi's showed inline");
  assert.match(textOf(renderer.root), /2 tries left/);
  act(() => renderer.unmount());
}

// ------------------------------------------------------------ toasts, chip, back link
{
  const base: AiTryOnBackgroundJob = {
    wearerId: "w-ada",
    wearerName: null,
    inputFingerprint: "fp",
    scope: "guest",
    startedAt: 1,
    settledAt: 2,
    status: "completed",
    outcome: null,
    preview: { mimeType: "image/png", data: "iVBORw0KGgo=" },
    storedPreviewId: null,
    modelId: null,
    resumed: false,
    seenInline: false,
    appliedByPanel: true,
    handledByHost: false,
    toast: "open",
    focusRequested: false,
    busy: false,
  };
  const views: string[] = [];
  const retries: string[] = [];
  const closes: string[] = [];
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(AiTryOnBackgroundToasts, {
        toasts: [
          { job: base, kind: "ready" },
          { job: { ...base, wearerId: "w-obi", wearerName: "Obi", status: "failed", preview: null, outcome: { kind: "failed", orderTriesRemaining: 3 } }, kind: "failed" },
        ],
        onView: (id) => views.push(id),
        onRetry: (id) => retries.push(id),
        onClose: (id) => closes.push(id),
      }),
    );
  });
  const text = textOf(renderer.root);
  assert.match(text, /Your preview is ready/);
  assert.match(text, /View preview/);
  assert.match(text, /We couldn't create Obi's preview/);
  assert.match(text, /This try wasn't counted\./);
  assert.match(text, /Try again/);
  const thumb = renderer.root.findAll((node) => node.type === "img");
  assert.equal(thumb.length, 1, "thumbnail on the ready toast");
  const actions = renderer.root.findAll((node) => node.type === "button" && node.props["data-ai-try-on-toast-action"]);
  act(() => actions[0].props.onClick());
  act(() => actions[1].props.onClick());
  const close = renderer.root.findAll((node) => node.type === "button" && node.props["aria-label"] === "Close");
  act(() => close[0].props.onClick());
  assert.deepEqual([views, retries, closes], [["w-ada"], ["w-obi"], ["w-ada"]]);

  const chip = renderToStaticMarkup(createElement(AiTryOnGeneratingChip, { jobs: [{ ...base, status: "running", wearerName: "Ada" }] }));
  assert.match(chip, /Making Ada&#x27;s preview…/);
  assert.match(chip, /role="status"/);
  assert.equal(renderToStaticMarkup(createElement(AiTryOnGeneratingChip, { jobs: [] })), "");
  assert.match(renderToStaticMarkup(createElement(AiTryOnBackLink, { stepName: "Measurement", onClick: () => undefined })), /Back to Measurement/);
}

// ------------------------------------------------------------ wiring (source)
{
  const studio = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  assert.match(studio, /futureAiTryOnInputFingerprintRef\.current/, "completion reads the design as it is now");
  assert.match(studio, /target\.inputFingerprint !== inputFingerprint\) return;/, "stale previews never complete the step");
  assert.match(studio, /aiTryOnBackgroundJobs\.resume\(/);
  assert.match(studio, /<AiTryOnBackgroundToasts/);
  assert.match(studio, /<AiTryOnGeneratingChip/);
  assert.match(studio, /pendingResumeScrollYRef\.current = returnTo\.scrollY/, "Back restores the scroll position");
  const session = readFileSync("src/services/guestOrderSessionService.ts", "utf8");
  assert.match(session, /retireAiTryOnSessions\(\);\s*\/\/[^\n]*\n\s*aiTryOnBackgroundJobs\.discardAll\(\);/);
  const panel = readFileSync("src/components/AiTryOnPhotoPanel.tsx", "utf8");
  for (const forbidden of ["localStorage", "sessionStorage", "indexedDB"]) {
    assert.equal(panel.includes(forbidden), false, `panel must not touch ${forbidden}`);
  }
}

console.log("PASS: AI Try-on background generation, toasts and reload resume");
