/**
 * B1: ticking / unticking a garment on a person card that is not the selected
 * Measuring-for person must change only the assignment. It must never select
 * the card through bubbling, and never copy the selected person's live form
 * onto another person.
 *
 * Part 1 (node): the production toggle handlers sync the live form to the
 * person selected right now (ref), even when a select ran earlier in the same
 * event.
 * Part 2 (browser): the real WearerAssignmentPanel in react-dom with real
 * bubbling clicks, run in headless Chrome or Edge (no new dependencies).
 * Set CHROME_PATH to pick a browser.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import type { FutureMeasurementStateV1, WearerOrderStateV2 } from "./src/types";
import { createWearerGarmentToggleHandlers } from "./src/utils/wearerGarmentToggle";
import { updateWearerMeasurement } from "./src/utils/wearerOrder";
import {
  buildCrossCardFixture,
  crossCardGarments,
  crossCardSelection,
  enteredFingerprint,
} from "./test_wearer_cross_card_fixture";

const pass = (label: string) => console.log(`PASS ${label}`);
const repoDir = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------- Part 1
const handlerHarness = (nolOwnsTrouser: boolean) => {
  const fixture = buildCrossCardFixture({ nolOwnsTrouser });
  // Design Studio's wearerOrderForPlan: Fred is selected, his live form overlaid.
  const rendered = updateWearerMeasurement(fixture.order, fixture.fredId, fixture.fred);
  let committed: WearerOrderStateV2 = rendered;
  let liveForm: FutureMeasurementStateV1 | null = fixture.fred;
  const activeRef = { current: fixture.fredId as string | null };
  const handlers = createWearerGarmentToggleHandlers({
    getOrder: () => committed,
    getActiveWearerId: () => activeRef.current,
    garments: crossCardGarments,
    garmentTypeSelection: crossCardSelection,
    commitOrder: (order) => {
      committed = order;
    },
    setLiveForm: (measurement) => {
      liveForm = measurement;
    },
  });
  const bagOf = (wearerId: string) =>
    enteredFingerprint(committed.wearers.find((wearer) => wearer.wearerId === wearerId)?.measurement);
  return {
    fixture,
    handlers,
    activeRef,
    bagOf,
    liveFingerprint: () => enteredFingerprint(liveForm || undefined),
    committed: () => committed,
  };
};

{
  // Tick Nol's trouser while Fred is selected (no select in between).
  const h = handlerHarness(false);
  const fredBefore = enteredFingerprint(h.fixture.fred);
  const nolBefore = enteredFingerprint(h.fixture.nol);
  assert.notEqual(fredBefore, nolBefore, "fixture people must differ");
  const result = h.handlers.assign("base:trouser", h.fixture.nolId);
  assert.equal(result.status, "updated");
  assert.equal(h.committed().assignmentByGarmentKey["base:trouser"], h.fixture.nolId);
  assert.equal(h.bagOf(h.fixture.nolId), nolBefore, "Nol keeps his own values");
  assert.equal(h.bagOf(h.fixture.fredId), fredBefore, "Fred unchanged");
  assert.equal(h.liveFingerprint(), fredBefore, "live form stays Fred's");
  pass("handler tick on another card leaves both people's values alone");
}

{
  // Same event selected Nol first (ref already Nol): the live form must be Nol's own.
  const h = handlerHarness(false);
  const nolBefore = enteredFingerprint(h.fixture.nol);
  const fredBefore = enteredFingerprint(h.fixture.fred);
  h.activeRef.current = h.fixture.nolId;
  h.handlers.assign("base:trouser", h.fixture.nolId);
  assert.equal(h.liveFingerprint(), nolBefore, "live form is Nol's, never Fred's");
  assert.equal(h.bagOf(h.fixture.nolId), nolBefore);
  assert.equal(h.bagOf(h.fixture.fredId), fredBefore);
  pass("handler tick syncs the live form to the latest selected person (ref)");
}

{
  // Untick Nol's trouser while Fred is selected: Nol loses only trouser fields.
  const h = handlerHarness(true);
  const fredBefore = enteredFingerprint(h.fixture.fred);
  const nolShared = JSON.parse(enteredFingerprint(h.fixture.nol)).shared;
  h.handlers.unassign("base:trouser");
  assert.equal(h.committed().assignmentByGarmentKey["base:trouser"], undefined);
  const nolAfter = JSON.parse(h.bagOf(h.fixture.nolId));
  assert.deepEqual(nolAfter.shared, nolShared, "Nol keeps shared body values");
  assert.equal(nolAfter.byGarmentKey["base:trouser"], undefined, "trouser fields stripped");
  assert.equal(h.bagOf(h.fixture.fredId), fredBefore, "Fred unchanged");
  assert.equal(h.liveFingerprint(), fredBefore, "live form stays Fred's");
  h.activeRef.current = h.fixture.nolId;
  h.handlers.assign("base:trouser", h.fixture.nolId);
  h.handlers.unassign("base:trouser");
  assert.deepEqual(JSON.parse(h.liveFingerprint()).shared, nolShared, "live form is Nol's own after select");
  pass("handler untick strips only the garment fields and never copies Fred's form");
}

// ---------------------------------------------------------------- Part 2
const browserCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((candidate): candidate is string => Boolean(candidate));
const browser = browserCandidates.find((candidate) => existsSync(candidate));
assert.ok(browser, `No Chrome/Edge found for the DOM test. Set CHROME_PATH. Tried: ${browserCandidates.join(", ")}`);

type Snapshot = {
  activeWearerId: string | null;
  selectCalls?: number;
  fred: string;
  nol: string;
  assignment: Record<string, string>;
};
type ScenarioResult = { name: string; fredId: string; nolId: string; before: Snapshot; after: Snapshot };

const workDir = mkdtempSync(join(tmpdir(), "wearer-cross-card-"));
try {
  await build({
    entryPoints: [join(repoDir, "test_wearer_cross_card_dom.harness.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    outfile: join(workDir, "harness.js"),
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "error",
  });
  writeFileSync(
    join(workDir, "index.html"),
    '<!doctype html><html><head><title>pending</title></head><body><script src="harness.js"></script></body></html>',
  );
  const run = spawnSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      `--user-data-dir=${join(workDir, "profile")}`,
      "--virtual-time-budget=5000",
      "--dump-dom",
      pathToFileURL(join(workDir, "index.html")).href,
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  const title = /<title>([\s\S]*?)<\/title>/.exec(run.stdout || "")?.[1];
  assert.ok(title && title !== "pending", `browser produced no result: ${run.stderr?.slice(0, 400)}`);
  const decoded = title
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
  const parsed = JSON.parse(decoded) as ScenarioResult[] | { error: string };
  assert.ok(Array.isArray(parsed), `harness error: ${(parsed as { error: string }).error}`);
  const byName = new Map(parsed.map((result) => [result.name, result]));

  for (const name of ["tick", "tick-label"]) {
    const { before, after, fredId, nolId } = byName.get(name)!;
    assert.equal(after.selectCalls, 0, `${name}: ticking Nol's garment must not select his card`);
    assert.equal(after.activeWearerId, fredId, `${name}: Fred stays selected`);
    assert.equal(after.assignment["base:trouser"], nolId, `${name}: trouser assigned to Nol`);
    assert.equal(after.nol, before.nol, `${name}: Nol's values are not overwritten`);
    assert.notEqual(after.nol, before.fred, `${name}: Nol never gets Fred's values`);
    assert.equal(after.fred, before.fred, `${name}: Fred unchanged`);
    pass(`DOM ${name}: real bubbling click on Nol's checkbox changes only the assignment`);
  }
  {
    const { before, after, fredId } = byName.get("untick")!;
    assert.equal(after.selectCalls, 0, "untick must not select Nol's card");
    assert.equal(after.activeWearerId, fredId);
    assert.equal(after.assignment["base:trouser"], undefined, "trouser unassigned");
    const nolBefore = JSON.parse(before.nol);
    const nolAfter = JSON.parse(after.nol);
    assert.deepEqual(nolAfter.shared, nolBefore.shared, "Nol keeps his shared values");
    assert.equal(nolAfter.byGarmentKey["base:trouser"], undefined, "trouser fields stripped");
    assert.notEqual(after.nol, before.fred, "Nol never gets Fred's values");
    assert.equal(after.fred, before.fred, "Fred unchanged");
    pass("DOM untick: real bubbling click strips only Nol's trouser fields");
  }
  {
    const { before, after, nolId } = byName.get("chrome")!;
    assert.equal(after.selectCalls, 1, "clicking card chrome selects the card");
    assert.equal(after.activeWearerId, nolId, "Nol is selected");
    assert.equal(after.nol, before.nol, "selecting does not change Nol's values");
    assert.equal(after.fred, before.fred, "selecting keeps Fred's values");
    pass("DOM card chrome click still selects the person");
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
console.log("test_wearer_cross_card_dom: all passed");
