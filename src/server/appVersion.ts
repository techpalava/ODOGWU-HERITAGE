import type { HttpRequest, HttpResponse } from "./httpTypes.js";

export const readServerBuildId = (): string =>
  (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim() || "dev";

/** Health check that also reports the live build, so open tabs can detect a newer deployment. */
export const handleHealth = (_req: HttpRequest, res: HttpResponse) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ status: "ok", buildId: readServerBuildId() });
};
