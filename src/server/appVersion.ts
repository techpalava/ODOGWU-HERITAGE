import type { HttpRequest, HttpResponse } from "./httpTypes.js";

const DEV_BUILD_ID = "dev";
const BUILD_ID_UNAVAILABLE_CODE = "BUILD_ID_UNAVAILABLE";

/**
 * Vercel sets `VERCEL` on every deployment. Preview and production also set
 * `VERCEL_ENV`. A blank flag is not a hosted runtime.
 */
const isVercelHostedRuntime = (): boolean => {
  if ((process.env.VERCEL ?? "").trim() !== "") return true;
  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim();
  return vercelEnv === "production" || vercelEnv === "preview";
};

/**
 * Deployment commit when Vercel provides one. Local and other non-Vercel
 * runtimes use "dev". A hosted Vercel runtime with a missing SHA returns null
 * so /api/health can fail closed instead of publishing that development sentinel.
 */
export const readServerBuildId = (): string | null => {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim();
  if (sha) return sha;
  if (isVercelHostedRuntime()) return null;
  return DEV_BUILD_ID;
};

/** Health check that also reports the live build, so open tabs can detect a newer deployment. */
export const handleHealth = (_req: HttpRequest, res: HttpResponse) => {
  res.setHeader("Cache-Control", "no-store");
  const buildId = readServerBuildId();
  if (buildId === null) {
    return res.status(503).json({
      error: "Build id unavailable.",
      code: BUILD_ID_UNAVAILABLE_CODE,
    });
  }
  return res.status(200).json({ status: "ok", buildId });
};
