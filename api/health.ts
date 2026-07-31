import type { HttpRequest, HttpResponse } from "../src/server/httpTypes";

export default function healthHandler(
  _req: HttpRequest,
  res: HttpResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ status: "ok" });
}
