import type { HttpRequest, HttpResponse } from "./httpTypes.js";

export const readServerBuildId = (): string =>
  (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim() || "dev";

export const handleAppVersion = (_req: HttpRequest, res: HttpResponse) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ buildId: readServerBuildId() });
};
