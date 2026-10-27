/**
 * Admin Edit Timeline layout in a real browser: at 1280 and 1440 px, in the
 * admin page layout, the full-width edit panel needs no horizontal scrolling,
 * both Save and both Cancel buttons are visible and clickable, each Save
 * saves once and each Cancel closes without saving. Normal rows also fit.
 *
 * Uses the local Chrome/Chromium (CHROME_PATH or a standard install) in
 * headless mode; StorageService is stubbed, so nothing is written. Without a
 * browser the check is skipped (set REQUIRE_BROWSER=1 to fail instead).
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { createServer } from "vite";

const run = promisify(execFile);
const chrome = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((candidate) => candidate && existsSync(candidate));
if (!chrome) {
  if (process.env.REQUIRE_BROWSER === "1") throw new Error("No Chrome/Chromium found for the layout check");
  console.log("SKIP: admin Edit Timeline layout check (no Chrome/Chromium; set CHROME_PATH)");
  process.exit(0);
}

const STUB_ID = "\0batch-edit-layout-storage-stub";
const server = await createServer({
  configFile: "vite.config.ts",
  logLevel: "error",
  server: { port: 0, host: "127.0.0.1", hmr: false },
  plugins: [
    {
      name: "batch-edit-layout-storage-stub",
      enforce: "pre",
      resolveId(id) {
        return /services\/storageService(\.ts)?$/.test(id) ? STUB_ID : undefined;
      },
      load(id) {
        if (id !== STUB_ID) return undefined;
        return [
          "export const StorageService = new Proxy({}, {",
          "  get: (_target, key) => async () => {",
          "    if (key === 'saveBatches') window.__batchSaveCalls = (window.__batchSaveCalls || 0) + 1;",
          "  },",
          "});",
        ].join("\n");
      },
    },
  ],
});

try {
  await server.listen();
  const { port } = server.httpServer.address();
  const url = `http://127.0.0.1:${port}/scripts/batchEditLayout/harness.html`;
  for (const width of [1280, 1440]) {
    // The first visit after a dependency change can hit Vite's one-time
    // dependency optimisation reload; load the page again once if so.
    const readResult = async () => {
      const { stdout } = await run(
        chrome,
        [
          "--headless=new",
          "--no-sandbox",
          "--disable-gpu",
          "--hide-scrollbars",
          `--window-size=${width},1000`,
          "--virtual-time-budget=20000",
          "--dump-dom",
          url,
        ],
        { maxBuffer: 32 * 1024 * 1024, timeout: 120000 },
      );
      return stdout.match(/<pre id="layout-result">([\s\S]*?)<\/pre>/);
    };
    const match = (await readResult()) || (await readResult());
    assert.ok(match, `${width}px: the layout page reported a result`);
    const payload = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    assert.equal(payload.ok, true, `${width}px: ${payload.error}`);
    const result = payload.result;
    assert.equal(result.viewport, width, "viewport width");
    assert.equal(result.nonEditOverflow, 0, `${width}px: normal rows fit without horizontal scrolling`);
    assert.equal(result.editOverflow, 0, `${width}px: Edit Timeline needs no horizontal scrolling`);
    assert.equal(result.panelInsideTable, true, `${width}px: the edit panel fits the table`);
    assert.ok(result.panelOverflow <= 0, `${width}px: nothing inside the edit panel overflows`);
    for (const [id, button] of Object.entries(result.buttons)) {
      assert.deepEqual(
        { insideTable: button.insideTable, insideViewport: button.insideViewport, enabled: button.enabled, clickable: button.clickable },
        { insideTable: true, insideViewport: true, enabled: true, clickable: true },
        `${width}px: ${id} (${button.text}) is visible and clickable`,
      );
    }
    assert.deepEqual(result.clicks, {
      "batch-edit-save-top": { saveCalls: 1, closed: true },
      "batch-edit-save-bottom": { saveCalls: 1, closed: true },
      "batch-edit-cancel-top": { saveCalls: 0, closed: true },
      "batch-edit-cancel-bottom": { saveCalls: 0, closed: true },
    });
    console.log(`  ${width}px ok: ${JSON.stringify({ editOverflow: result.editOverflow, buttons: Object.keys(result.buttons).length })}`);
  }
} finally {
  await server.close();
}

console.log("PASS: admin Edit Timeline panel fits 1280 and 1440 px with both Save and Cancel buttons usable");
