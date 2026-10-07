import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAppVersionChecker,
  isOutdatedBuild,
  readClientBuildId,
  shouldReloadAfterPreloadError,
} from "./src/utils/appVersionCheck";
import { handleHealth, readServerBuildId } from "./src/server/appVersion";
import { APP_VERSION_ENDPOINT } from "./src/utils/appVersionCheck";
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

const BUILD_ENV_KEYS = ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA"] as const;

const withBuildEnv = (
  values: Partial<Record<(typeof BUILD_ENV_KEYS)[number], string>>,
  run: () => void,
) => {
  const previous = new Map<string, string | undefined>(
    BUILD_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of BUILD_ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of BUILD_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const invokeHealth = () => {
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
  handleHealth({ method: "GET", headers: {} }, res);
  return state;
};

const assertBuildIdUnavailable = () => {
  assert.equal(readServerBuildId(), null);
  const state = invokeHealth();
  assert.equal(state.statusCode, 503);
  assert.equal(state.cache, "no-store");
  assert.deepEqual(state.body, {
    error: "Build id unavailable.",
    code: "BUILD_ID_UNAVAILABLE",
  });
  const serialized = JSON.stringify(state.body);
  assert.equal(serialized.includes("dev"), false);
  assert.equal(serialized.includes("VERCEL_GIT_COMMIT_SHA"), false);
};

// Local and other non-Vercel runtimes still report the development build.
withBuildEnv({}, () => {
  assert.equal(readServerBuildId(), "dev");
  const state = invokeHealth();
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, { status: "ok", buildId: "dev" });
  assert.equal(state.cache, "no-store");
});

// A blank VERCEL flag is not a hosted runtime.
withBuildEnv({ VERCEL: "  ", VERCEL_ENV: "development" }, () => {
  assert.equal(readServerBuildId(), "dev");
  const state = invokeHealth();
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, { status: "ok", buildId: "dev" });
});

// The server reports the deployment commit and is never cached.
withBuildEnv({ VERCEL_GIT_COMMIT_SHA: " abc123 " }, () => {
  assert.equal(readServerBuildId(), "abc123");
  const state = invokeHealth();
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, { status: "ok", buildId: "abc123" });
  assert.equal(state.cache, "no-store");
});

// A hosted deploy with a SHA keeps the public health shape, including on Vercel.
withBuildEnv(
  { VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "abc123" },
  () => {
    assert.equal(readServerBuildId(), "abc123");
    const state = invokeHealth();
    assert.equal(state.statusCode, 200);
    assert.deepEqual(state.body, { status: "ok", buildId: "abc123" });
    assert.equal(state.cache, "no-store");
  },
);

// Vercel without a SHA must not claim the development sentinel.
withBuildEnv({ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: "   " }, () => {
  assertBuildIdUnavailable();
});
withBuildEnv({ VERCEL: "1" }, () => {
  assertBuildIdUnavailable();
});
withBuildEnv({ VERCEL_ENV: "production" }, () => {
  assertBuildIdUnavailable();
});
withBuildEnv({ VERCEL_ENV: "preview" }, () => {
  assertBuildIdUnavailable();
});

// The existing health function reports the build, keeping the Vercel function count unchanged.
assert.equal(APP_VERSION_ENDPOINT, "/api/health");
assert.match(readFileSync("api/health.ts", "utf8"), /handleHealth as default/);

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
