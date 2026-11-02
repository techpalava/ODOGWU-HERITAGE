import { AI_TRY_ON_ENDPOINT } from "../utils/aiTryOnGatewayContract";
import { readAiTryOnIdToken } from "./aiTryOnGateway";

/**
 * The AI preview saved with a paid order (PR 3), read and deleted through
 * `/api/ai-try-on?action=order-images|order-image` with the signed-in
 * customer's (or admin's) Firebase ID token. Never a public image URL.
 */
export type AiTryOnOrderImagesStatus = "saved" | "deleted" | "expired" | "none";

export interface AiTryOnOrderImagesSummary {
  readonly status: AiTryOnOrderImagesStatus;
  readonly expiresAt: string | null;
  readonly images: readonly { wearerKey: string; label: string; onModel: boolean }[];
}

export interface AiTryOnOrderImageService {
  list(orderId: string): Promise<AiTryOnOrderImagesSummary | null>;
  image(orderId: string, wearerKey: string): Promise<{ mimeType: string; data: string } | null>;
  remove(orderId: string): Promise<boolean>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const ENDPOINT = AI_TRY_ON_ENDPOINT;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STATUSES = new Set<AiTryOnOrderImagesStatus>(["saved", "deleted", "expired", "none"]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const createAiTryOnOrderImageService = ({
  fetchImpl = (input, init) => fetch(input, init),
  getIdToken = readAiTryOnIdToken,
}: { fetchImpl?: FetchLike; getIdToken?: () => Promise<string | null> } = {}): AiTryOnOrderImageService => {
  const request = async (query: string, method: "GET" | "DELETE"): Promise<unknown> => {
    const token = await getIdToken().catch(() => null);
    if (!token) return null;
    const response = await fetchImpl(`${ENDPOINT}?${query}`, {
      method,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  };
  return {
    async list(orderId) {
      try {
        const body = await request(`action=order-images&orderId=${encodeURIComponent(orderId)}`, "GET");
        if (!isRecord(body) || !STATUSES.has(body.status as AiTryOnOrderImagesStatus)) return null;
        const images = Array.isArray(body.images)
          ? body.images.filter(
              (entry): entry is { wearerKey: string; label: string; onModel: boolean } =>
                isRecord(entry) && typeof entry.wearerKey === "string" && typeof entry.label === "string",
            ).map((entry) => ({ wearerKey: entry.wearerKey, label: entry.label, onModel: entry.onModel === true }))
          : [];
        return {
          status: body.status as AiTryOnOrderImagesStatus,
          expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
          images,
        };
      } catch {
        return null;
      }
    },
    async image(orderId, wearerKey) {
      try {
        const body = await request(
          `action=order-image&orderId=${encodeURIComponent(orderId)}&wearerKey=${encodeURIComponent(wearerKey)}`,
          "GET",
        );
        const image = isRecord(body) && isRecord(body.image) ? body.image : null;
        if (!image || typeof image.data !== "string" || typeof image.mimeType !== "string" || !IMAGE_MIME_TYPES.has(image.mimeType)) {
          return null;
        }
        return { mimeType: image.mimeType, data: image.data };
      } catch {
        return null;
      }
    },
    async remove(orderId) {
      try {
        const body = await request(`action=order-images&orderId=${encodeURIComponent(orderId)}`, "DELETE");
        return isRecord(body) && body.status === "deleted";
      } catch {
        return false;
      }
    },
  };
};
