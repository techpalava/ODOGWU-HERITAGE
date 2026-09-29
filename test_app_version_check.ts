import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAppVersionChecker,
  isOutdatedBuild,
  readClientBuildId,
  shouldReloadAfterPreloadError,
} from "./src/utils/appVersionCheck";
import { handleAppVersion, readServerBuildId } from "./src/server/appVersion";
import type { HttpResponse } from "./src/server/httpTypes";

// Outside a Vite build the client reports the development build.
assert.equal(readClientBuildId(), "dev");

assert.equal(isOutdatedBuild("abc", "def"), true);
assert.equal(isOutdatedBuild("abc", "abc"), false);
assert.equal(isOutdatedBuild("dev", "def"), false);
assert.equal(isOutdatedBuild("abc", "dev"), false);
assert.equal(isOutdatedBuild("abc", null), false);

// A matching server build keeps the tab usable.
{
  let fetches = 0;
  const checker = createAppVersionChecker({
    clientBuildId: "build-1",
    fetchServerBuildId: async () => {
      fetches += 1;
      return "build-1";
    },
  });
  assert.equal(await checker.check(), false);
  assert.equal(checker.isOutdated(), false);
  assert.equal(fetches, 1);
}

// A development tab never contacts the server.
{
  let fetches = 0;
  const checker = createAppVersionChecker({
    clientBuildId: "dev",
    fetchServerBuildId: async () => {
      fetches += 1;
      return "build-2";
    },
  });
  assert.equal(await checker.check(), false);
  assert.equal(fetches, 0);
}

// A network failure does not block the customer.
{
  const checker = createAppVersionChecker({
    clientBuildId: "build-1",
    fetchServerBuildId: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(await checker.check(), false);
}

// A newer deployment marks the tab outdated once and notifies subscribers.
{
  let notifications = 0;
  let fetches = 0;
  const checker = createAppVersionChecker({
    clientBuildId: "build-1",
    fetchServerBuildId: async () => {
      fetches += 1;
      return "build-2";
    },
  });
  const unsubscribe = checker.subscribe(() => {
    notifications += 1;
  });
  assert.equal(await checker.check(), true);
  assert.equal(await checker.check(), true);
  assert.equal(checker.isOutdated(), true);
  assert.equal(notifications, 1);
  assert.equal(fetches, 1, "An outdated tab stays outdated without refetching.");
  unsubscribe();
}

// A chunk load failure reloads once; a second failure soon after does not loop.
assert.equal(shouldReloadAfterPreloadError({ lastReloadAt: null, now: 1_000 }), true);
assert.equal(shouldReloadAfterPreloadError({ lastReloadAt: 1_000, now: 5_000 }), false);
assert.equal(shouldReloadAfterPreloadError({ lastReloadAt: 1_000, now: 60_000 }), true);

// The server reports the deployment commit and is never cached.
{
  const previous = process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  assert.equal(readServerBuildId(), "dev");
  process.env.VERCEL_GIT_COMMIT_SHA = " abc123 ";
  assert.equal(readServerBuildId(), "abc123");
  const state = { statusCode: 0, body: null as unknown, cache: "" };
  const res: HttpResponse = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      if (name === "Cache-Control") state.cache = value;
      return res;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  handleAppVersion({ method: "GET", headers: {} }, res);
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, { buildId: "abc123" });
  assert.equal(state.cache, "no-store");
  if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = previous;
}

// The client build ID and the server build ID come from the same variable.
const viteConfig = readFileSync("vite.config.ts", "utf8");
assert.match(viteConfig, /__APP_BUILD_ID__: JSON\.stringify\(/);
assert.match(viteConfig, /process\.env\.VERCEL_GIT_COMMIT_SHA/);

// Prepare and pay both check the version before doing any work.
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.equal(
  studioSource.match(/await ensureCurrentAppVersion\(\)/g)?.length,
  2,
  "Prepare and pay must each check for an outdated tab.",
);
const appSource = readFileSync("src/App.tsx", "utf8");
assert.ok(appSource.includes("<AppVersionBanner />"));
assert.ok(appSource.includes("startAppVersionMonitoring()"));
assert.ok(appSource.includes("installPreloadErrorReload()"));

console.log("PASS: stale tab version check");
